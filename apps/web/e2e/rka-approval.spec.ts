import { readFileSync } from "node:fs";
import { expect, test, type Cookie, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import postgres from "postgres";
import { E2E_DATABASE_URL } from "../playwright.config";
import { authFile, type E2eRole } from "./users";

/**
 * The five RKA journeys from the plan, run in order against one fresh database:
 * requestor submits; owner consolidates; Finance returns for clarification; Finance finalises;
 * Director locks and reads the summary. Seed: two SCM lines (6241, 5300) in draft.
 */
test.describe.configure({ mode: "serial" });

/** Switches the page to a role's saved session (from auth.setup.ts) and opens a path. */
async function as(role: E2eRole, page: Page, path: string) {
  const state = JSON.parse(readFileSync(authFile(role), "utf8")) as { cookies: Cookie[] };
  await page.context().clearCookies();
  await page.context().addCookies(state.cookies);
  await page.goto(path);
}

const lineRow = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const comments = (page: Page) => page.getByRole("list", { name: "Daftar komentar" }).getByRole("listitem");

test("1. Requestor drafts a line like in Excel and submits to the Default Owner", async ({ page }) => {
  await as("requestor", page, "/rka");
  await page.getByRole("button", { name: "Tambah baris" }).click();

  await page.getByLabel("COA baris 3").selectOption("6241");
  await page.getByLabel("Uraian baris 3").fill("Internet cabang");
  await page.getByLabel("Baris 3 bulan 1", { exact: true }).fill("1.500.000");
  await page.getByLabel("Baris 3 bulan 1", { exact: true }).focus();
  const row = page.getByRole("row").filter({ has: page.getByLabel("Baris 3 bulan 1", { exact: true }) });
  await row.getByRole("button", { name: "Isi ke kanan" }).click();
  await expect(page.getByTestId("editor-total-3")).toHaveText("Rp 18.000.000");
  await page.getByLabel("Dasar perhitungan baris 3").fill("Rp 1,5 jt per bulan");
  await row.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Baris tersimpan.")).toBeVisible();

  for (const n of [1, 2, 3]) await page.getByLabel(`Pilih baris ${n}`).check();
  await page.getByRole("button", { name: "Kirim ke Default Owner (3)" }).click();
  await expect(page.getByText("3 baris diproses.")).toBeVisible();
  await expect(page.getByText("Belum ada baris anggaran di tahap ini.")).toBeHidden();
});

test("Requestor cannot open an approver's queue", async ({ page }) => {
  await as("requestor", page, "/rka/queue");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("Finance arranges COA Master as a tree; no one else can change it", async ({ page }) => {
  await as("finance", page, "/coa");
  await page.getByLabel("Kode", { exact: true }).fill("6240");
  await page.getByLabel("Nama").fill("Beban Utilitas");
  await page.getByRole("button", { name: "Tambah COA" }).click();
  await expect(page.getByText("COA 6240 ditambahkan.")).toBeVisible();

  await page.getByLabel("Ubah kode yang ada").selectOption("6241");
  await page.getByLabel("Induk").selectOption("6240");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("COA 6241 diperbarui.")).toBeVisible();
  const tree = page.getByRole("treegrid", { name: "Pohon COA" });
  await expect(tree.locator('tr[data-code="6241"]')).toHaveAttribute("aria-level", "2");
  // The parent folds its branch shut and open again.
  await tree.getByRole("button", { name: "Tutup 6240" }).click();
  await expect(tree.locator('tr[data-code="6241"]')).toHaveCount(0);
  await tree.getByRole("button", { name: "Buka 6240" }).click();
  await expect(tree.locator('tr[data-code="6241"]')).toBeVisible();

  // A parent must share the category, so subtotals stay in their P&L row.
  await page.getByLabel("Ubah kode yang ada").selectOption("5300");
  await page.getByLabel("Induk").selectOption("6240");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText(/Induk harus berkategori sama/)).toBeVisible();

  await as("director", page, "/coa");
  await expect(page).toHaveURL(/\/$/);
});

test("Finance types in a 2026 actual; the plan stays as it was", async ({ page }) => {
  await as("finance", page, "/rka/actual");
  await page.getByLabel("Cari COA atau uraian").fill("5300");
  const cell = page.getByRole("textbox", { name: /Actual 2026 baris/ });
  await expect(cell).toHaveCount(1);
  await cell.fill("4.100.000.000");
  await page.getByRole("button", { name: "Simpan (1)" }).click();
  await expect(page.getByText("1 baris disimpan.")).toBeVisible();

  await page.reload();
  await page.getByLabel("Cari COA atau uraian").fill("5300");
  await expect(page.getByRole("textbox", { name: /Actual 2026 baris/ })).toHaveValue("4.100.000.000");

  await as("requestor", page, "/rka/actual");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("BCD adds a deal to the Pipeline; Finance reads it; other divisions cannot open it", async ({ page }) => {
  await as("sales", page, "/pipeline");
  await page.getByRole("button", { name: "Tambah deal" }).click();
  const form = page.getByRole("form", { name: "Deal" });
  await form.getByLabel("Customer", { exact: true }).fill("Telkom");
  await form.getByLabel("End customer").fill("Korlantas");
  await form.getByLabel("Project").fill("Sewa CPE SBST Online Korlantas Polri TA 2027");
  await form.getByLabel("COA deal").selectOption("4100");
  await form.getByLabel("Nilai (exclude PPN)").fill("577.320.000");
  await form.getByLabel("Status deal").selectOption("WB");
  await form.getByLabel("Probabilitas (%)").fill("90");
  await form.getByRole("button", { name: "Simpan deal" }).click();
  await expect(page.getByText("Deal disimpan.")).toBeVisible();
  // 577.320.000 × 90% = 519.588.000, never added to RKA revenue.
  await expect(page.getByTestId("register-total")).toContainText("Rp 519.588.000");

  await as("finance", page, "/pipeline");
  await expect(page.getByText("Sewa CPE SBST Online Korlantas Polri TA 2027")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tambah deal" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Ubah/ })).toHaveCount(0);

  await as("finance", page, "/summary");
  await expect(page.getByTestId("summary-pipeline")).toContainText("pipeline tertimbang Rp 519,6 jt");

  await as("requestor", page, "/pipeline");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("Finance fills the cash assumptions and a loan; the forecast follows; the Director reads it", async ({ page }) => {
  await as("finance", page, "/cash");
  await expect(page.getByText("Asumsi arus kas 2027 belum diisi.")).toBeVisible();
  await page.getByLabel("Saldo kas awal ESTRADA").fill("1.000.000.000");
  await page.getByLabel("Kas minimum konsolidasi").fill("500.000.000");
  await page.getByRole("button", { name: "Simpan asumsi" }).click();
  await expect(page.getByText("Asumsi disimpan.")).toBeVisible();
  await expect(page.getByText("Arus kas bulanan", { exact: true })).toBeVisible();
  await expect(page.getByTestId("cash-opening").getByTestId("m1")).toHaveText("1.000,0");

  await page.getByRole("button", { name: "Tambah fasilitas" }).click();
  await page.getByLabel("Nama fasilitas").fill("KMK Mandiri");
  await page.getByLabel("Suku bunga (%)").fill("12");
  await page.getByLabel("Penarikan Mar").fill("10.000.000.000");
  await page.getByRole("button", { name: "Simpan fasilitas" }).click();
  await expect(page.getByText("Fasilitas disimpan.")).toBeVisible();
  await expect(page.getByTestId("cash-financing").getByTestId("m3")).toHaveText("10.000,0");
  // Interest from March: 10 bn x 12% / 12 = 100 jt a month, paid in the month.
  await expect(page.getByTestId("cash-interest").getByTestId("m3")).toHaveText("(100,0)");

  await as("director", page, "/cash");
  await expect(page.getByTestId("cash-financing").getByTestId("m3")).toHaveText("10.000,0");
  await expect(page.getByRole("button", { name: "Simpan asumsi" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tambah fasilitas" })).toHaveCount(0);

  await as("requestor", page, "/cash");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("Requestor plans new hires; the plan writes the draft line, owned by HCM", async ({ page }) => {
  await as("requestor", page, "/rka");
  await page.getByRole("button", { name: "Tambah posisi" }).click();
  await page.getByLabel("Jabatan posisi 1").fill("Account Manager");
  await page.getByLabel("Jumlah orang posisi 1").fill("6");
  await page.getByLabel("Biaya per orang posisi 1").fill("16.750.000");
  await expect(page.getByTestId("headcount-total-1")).toHaveText("Rp 1.206.000.000");
  await page.getByRole("button", { name: "Simpan posisi 1" }).click();
  await expect(page.getByText("Posisi tersimpan.")).toBeVisible();

  const jan = page.getByLabel("Baris 1 bulan 1", { exact: true });
  await expect(jan).toHaveValue("100.500.000");
  await expect(jan).toBeDisabled();
  await expect(page.getByText("Dihitung dari Rencana headcount")).toBeVisible();
  await expect(page.getByLabel("Unit pemilik baris 1")).toHaveValue("HCM");
  await expect(page.getByLabel("Dasar perhitungan baris 1")).toHaveValue("Rencana headcount: 6 orang × Rp 16.750.000 per bulan, mulai Jan");

  await page.getByLabel("Mulai posisi 1").selectOption("7");
  await page.getByRole("button", { name: "Simpan posisi 1" }).click();
  await expect(page.getByTestId("editor-total-1")).toHaveText("Rp 603.000.000");
  await expect(jan).toHaveValue("0");

  // Leave no draft behind: the journey later locks the whole version.
  await page.getByRole("button", { name: "Hapus posisi 1" }).click();
  await expect(page.getByText("Dihitung dari Rencana headcount")).toBeHidden();
});

test("2. Default Owner returns one line with a comment and consolidates the rest", async ({ page }) => {
  await as("default_owner", page, "/rka/queue");
  await expect(page.getByText("SCM · 3 baris")).toBeVisible();

  await lineRow(page, "Internet cabang").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Kembalikan" }).click();
  await expect(page.getByText("Catatan wajib diisi untuk aksi ini.")).toBeVisible();
  await page.getByLabel("Catatan").fill("Lampirkan kontrak cabang");
  await page.getByRole("button", { name: "Kembalikan" }).click();
  await expect(page.getByText("1 baris diproses.")).toBeVisible();

  await page.getByLabel("Pilih semua SCM").check();
  await page.getByRole("button", { name: "Kirim ke Division Owner" }).click();
  await expect(page.getByText("2 baris diproses.")).toBeVisible();
});

test("Requestor sees why the line came back, fixes it and resubmits", async ({ page }) => {
  await as("requestor", page, "/rka");
  await expect(page.getByText("Dikembalikan oleh Bayu (Head SCM): “Lampirkan kontrak cabang”")).toBeVisible();
  await page.getByLabel("Dasar perhitungan baris 1").fill("Kontrak cabang No. 12/2027, Rp 1,5 jt per bulan");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Baris tersimpan.")).toBeVisible();
  await page.getByLabel("Pilih baris 1").check();
  await page.getByRole("button", { name: "Kirim ke Default Owner (1)" }).click();
  await expect(page.getByText("1 baris diproses.")).toBeVisible();
});

test("Default Owner consolidates the resubmitted line", async ({ page }) => {
  await as("default_owner", page, "/rka/queue");
  await lineRow(page, "Internet cabang").getByRole("button", { name: "Riwayat" }).click();
  await expect(page.getByText("“Lampirkan kontrak cabang”")).toBeVisible();
  await page.getByLabel("Pilih semua SCM").check();
  await page.getByRole("button", { name: "Kirim ke Division Owner" }).click();
  await expect(page.getByText("1 baris diproses.")).toBeVisible();
});

test("Division Owner approves the division RKA to Finance", async ({ page }) => {
  await as("division_owner", page, "/rka/division");
  await page.getByLabel("Pilih semua SCM").check();
  await page.getByRole("button", { name: "Setujui & kirim ke Finance" }).click();
  await expect(page.getByText("3 baris diproses.")).toBeVisible();
});

test("3. Finance returns the division RKA for clarification", async ({ page }) => {
  await as("finance", page, "/rka/review");
  await page.getByLabel("Pilih semua SCM").check();
  await page.getByLabel("Catatan").fill("Rincian bandwidth per pelanggan?");
  await page.getByRole("button", { name: "Minta klarifikasi" }).click();
  await expect(page.getByText("3 baris diproses.")).toBeVisible();
});

test("Division Owner sees the clarification and approves again", async ({ page }) => {
  await as("division_owner", page, "/rka/division");
  await expect(page.getByText("Dewi (Finance): “Rincian bandwidth per pelanggan?”").first()).toBeVisible();
  await page.getByLabel("Pilih semua SCM").check();
  await page.getByRole("button", { name: "Setujui & kirim ke Finance" }).click();
  await expect(page.getByText("3 baris diproses.")).toBeVisible();
});

test("Finance asks about one line in its discussion; the line stays where it is", async ({ page }) => {
  await as("finance", page, "/rka/review");
  await lineRow(page, "5300").getByRole("link", { name: "Diskusi" }).click();
  await expect(page).toHaveURL(/\/rka\/line\//);
  await page.getByLabel("Komentar", { exact: true }).fill("Kenaikan bandwidth 5300 mengikuti kontrak mana?");
  await page.getByRole("button", { name: "Kirim komentar" }).click();
  await expect(page.getByText("Komentar terkirim.")).toBeVisible();
  await expect(comments(page).filter({ hasText: "Dewi (Finance)" })).toContainText("Kenaikan bandwidth 5300");
  await expect(page.getByText("Review Finance").first()).toBeVisible();
});

test("Requestor answers in the thread from RKA Saya; Finance gets one email without the text", async ({ page }) => {
  await as("requestor", page, "/rka");
  await lineRow(page, "5300").getByRole("link", { name: "Diskusi (1)" }).click();
  await expect(page.getByText("Kenaikan bandwidth 5300 mengikuti kontrak mana?")).toBeVisible();
  await page.getByLabel("Komentar", { exact: true }).fill("Kontrak Telkom 2027, tarif naik 5%.");
  await page.getByRole("button", { name: "Kirim komentar" }).click();
  await expect(page.getByText("Komentar terkirim.")).toBeVisible();
  await expect(comments(page)).toHaveCount(2);

  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const mails = await sql<{ to_email: string; payload: Record<string, string> }[]>`
      select to_email, payload from email_outbox where template = 'line_comment' order by created_at`;
    expect(mails.map((m) => m.to_email)).toEqual(["e2e.requestor@estrada.test", "e2e.finance@estrada.test"]);
    expect(JSON.stringify(mails)).not.toMatch(/Telkom|kontrak mana/);
  } finally {
    await sql.end();
  }
});

test("The Default Owner, not emailed, still finds the whole thread on the line", async ({ page }) => {
  await as("default_owner", page, "/rka");
  await lineRow(page, "5300").getByRole("link", { name: "Diskusi (2)" }).click();
  await expect(comments(page).filter({ hasText: "Rina (SCM)" })).toContainText("Kontrak Telkom 2027");
  await expect(page.getByLabel("Komentar", { exact: true })).toBeVisible();
});

test("Finance splits a shared cost across the entities by headcount; the Summary shows each entity's share", async ({ page }) => {
  await as("finance", page, "/rka/allocation");
  await page.getByLabel("Headcount ESTRADA").fill("3");
  await page.getByLabel("Headcount MATRIK").fill("1");
  await page.getByRole("button", { name: "Simpan headcount" }).click();
  await expect(page.getByText("Headcount disimpan.")).toBeVisible();

  await page.getByLabel("Cari COA atau uraian").fill("6241");
  await lineRow(page, "237.855.840").getByLabel(/Dasar alokasi baris/).selectOption("headcount");
  await page.getByRole("button", { name: "Simpan (1)" }).click();
  await expect(page.getByText("1 baris disimpan.")).toBeVisible();

  await as("finance", page, "/summary");
  // 6241: 19.821.320 x 12 = 237.855.840, carried by ESTRADA; MATRIK has 1 of 4 heads, so a quarter moves to it.
  await expect(page.getByTestId("allocation-MATRIK").getByTestId("allocated")).toHaveText("59,5");
  await expect(page.getByTestId("allocation-ESTRADA").getByTestId("allocated")).toHaveText("(59,5)");

  await as("requestor", page, "/rka/allocation");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("4. Finance finalises", async ({ page }) => {
  await as("finance", page, "/rka/review");
  await page.getByLabel("Pilih semua SCM").check();
  await page.getByRole("button", { name: "Finalisasi" }).click();
  await expect(page.getByText("3 baris diproses.")).toBeVisible();

});

test("5. Head Finance locks the version; the Director reads the Management Summary", async ({ page }) => {
  // The lock belongs to Head Finance (client answer 3): the Director sees the lines but cannot lock them.
  await as("director", page, "/rka/lock");
  await expect(page.getByLabel("Pilih semua SCM")).toBeDisabled();

  await as("finance", page, "/rka/lock");
  await page.getByLabel("Pilih semua SCM").check();
  await page.getByRole("button", { name: "Kunci versi" }).click();
  await expect(page.getByText("3 baris diproses.")).toBeVisible();

  await as("director", page, "/summary");
  await expect(page.getByText("3 baris, 3 terkunci")).toBeVisible();
  // 6241: 19.821.320 x 12 + 5300: 390.686.823,67 x 12 + new line 1.500.000 x 12
  await expect(page.getByText("Rp 4.944,1 jt").first()).toBeVisible();

  // The viewer picks the unit; the choice holds on the next screen too.
  await page.getByLabel("Satuan").selectOption("miliar");
  await expect(page.getByText("Rp 4,94 M").first()).toBeVisible();
  await page.goto("/rka/lock");
  await expect(page.getByLabel("Satuan")).toHaveValue("miliar");
  await page.goto("/summary");
  await page.getByLabel("Satuan").selectOption("juta");
  await expect(page.getByText("Rp 4.944,1 jt").first()).toBeVisible();

  await page.getByLabel("Divisi").selectOption("PDMS");
  await expect(page).toHaveURL(/division=PDMS/);
  await expect(page.getByTestId("contribution-PDMS").first()).toBeVisible();
});

test("Director downloads the filtered summary as Excel, in the workbook's layout", async ({ page }) => {
  await as("director", page, "/summary?division=PDMS");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Unduh Excel" }).click()]);
  expect(download.suggestedFilename()).toBe("RKA 2027 (demo).xlsx");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  expect(wb.worksheets.map((w) => w.name)).toEqual(["RKA 2027 Data", "Rekap", "Kontribusi Divisi", "Per Entitas"]);
  const data = wb.getWorksheet("RKA 2027 Data")!;
  const statuses = data.getColumn((data.getRow(4).values as string[]).indexOf("Status")).values.slice(5);
  expect(statuses).toEqual(["Terkunci", "Terkunci", "Terkunci"]);
  const total = wb.getWorksheet("Rekap")!.getRow(13).values as unknown[];
  expect(total[1]).toBe("Total Biaya");
  expect(Math.round(Number(total[14]) / 1e5) / 10).toBe(4944.1);
});

test("Locking the last line locks the version; the Director sees it but cannot revise", async ({ page }) => {
  await as("director", page, "/rka/cycle");
  const row = page.getByRole("row").filter({ hasText: "RKA 2027 (demo)" });
  await expect(row.getByText("Terkunci", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buat revisi" })).toHaveCount(0);
});

test("Finance opens a revision of the locked version and adjusts it alone", async ({ page }) => {
  // A planned position on a locked line: the journey deletes its own hire, so give one line a plan here.
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`
      insert into headcount_plan (line_id, position, head_count, start_month, cost_per_head)
      select l.id, 'Network Engineer', 2, 1, 9910660 from budget_line l join budget_version v on v.id = l.version_id
      where v.name = 'RKA 2027 (demo)' and l.coa_code = '6241' and l.shared_basis is null limit 1`;
  } finally {
    await sql.end();
  }

  await as("finance", page, "/rka/cycle");
  const row = page.getByRole("row").filter({ hasText: "RKA 2027 (demo)" });
  await row.getByLabel("Mulai revisi di").selectOption("finance_review");
  await row.getByRole("button", { name: "Buat revisi" }).click();
  await expect(page.getByText("RKA 2027 (demo) v2 dibuka dari RKA 2027 (demo).")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "RKA 2027 (demo) v2" }).getByText("Review Finance 3")).toBeVisible();

  // The locked version is untouched; the copy waits in Finance's queue.
  await page.goto("/rka/review");
  await expect(page.getByText("RKA 2027 (demo) v2", { exact: true })).toBeVisible();
  await expect(page.getByText("SCM · 3 baris")).toBeVisible();

  // The copy keeps what reports and the plan need: positions, shared-cost bases and head counts per entity.
  const db2 = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const [copy] = await db2<{ plans: number; shared: number; heads: number }[]>`
      select
        (select count(*)::int from headcount_plan h join budget_line l on l.id = h.line_id where l.version_id = v.id) as plans,
        (select count(*)::int from budget_line l where l.version_id = v.id and l.shared_basis = 'headcount') as shared,
        (select coalesce(sum(heads), 0)::int from entity_headcount e where e.version_id = v.id) as heads
      from budget_version v where v.name = 'RKA 2027 (demo) v2'`;
    expect(copy).toEqual({ plans: 1, shared: 1, heads: 4 });
  } finally {
    await db2.end();
  }
});
