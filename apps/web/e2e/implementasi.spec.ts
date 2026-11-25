import { readFileSync } from "node:fs";
import { expect, test, type Cookie, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DATABASE_URL } from "../playwright.config";
import { authFile, type E2eRole } from "./users";

/**
 * The delivery journey from the Panduan, run in order against one fresh database: a Closed Won deal becomes a
 * project, the Head PMO assigns the team, and the project goes through sites, planning gates, BAI, RFS, BAST and
 * the handover to MSO and ISO. Everyone signs in as themselves, so each step also proves who may do it.
 * The deal sits in fiscal year 2028 so it stays out of the 2027 Pipeline figures the RKA journeys check.
 */
test.describe.configure({ mode: "serial" });

const PROJECT = "Instalasi SC Kota Uji 2027";

/** A date `n` days before today, as the date inputs take it; the closing step needs the warranty to have run out. */
const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** Switches the page to a role's saved session (from auth.setup.ts) and opens a path. */
async function as(role: E2eRole, page: Page, path: string) {
  const state = JSON.parse(readFileSync(authFile(role), "utf8")) as { cookies: Cookie[] };
  await page.context().clearCookies();
  await page.context().addCookies(state.cookies);
  await page.goto(path);
}

/** The project's own page, found from the list the way a person would. */
async function openProject(role: E2eRole, page: Page, name = PROJECT) {
  await as(role, page, "/implementasi");
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("A Closed Won deal waits for a project; only BCD opens it", async ({ page }) => {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  await sql`
    insert into pipeline_deal (fiscal_year, entity_code, customer, segment, project, coa_code, value, status, probability, type, start_month, end_month)
    values (2028, 'ESTRADA', 'Pemkot Uji', 'Telco Business', ${PROJECT}, '4100', 900000000, 'CW', 100, 'new', 1, 6)`;
  await sql.end();

  await as("head_pmo", page, "/implementasi");
  await expect(page.getByText(PROJECT)).toBeVisible();
  await expect(page.getByTestId(/^awaiting-/).getByText("Dibuka oleh BCD")).toBeVisible();
  await expect(page.getByRole("button", { name: "Buka proyek" })).toHaveCount(0);

  await as("sales", page, "/implementasi");
  await page.getByLabel(`Jumlah lokasi kontrak ${PROJECT}`).fill("2");
  await page.getByRole("button", { name: "Buka proyek" }).click();
  await expect(page.getByRole("link", { name: PROJECT })).toBeVisible();
});

test("The Head PMO assigns the team; Delivery Control cannot also be Project Manager", async ({ page }) => {
  await openProject("head_pmo", page);
  await page.getByLabel("Delivery Control").selectOption({ label: "Dika (Delivery Control) · Staff Delivery Control" });
  await page.getByLabel("Project Manager").selectOption({ label: "Dika (Delivery Control) · Staff Delivery Control" });
  await expect(page.getByText("Delivery Control tidak boleh merangkap Project Manager.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Simpan tim" })).toBeDisabled();

  await page.getByLabel("Project Manager").selectOption({ label: "Pandu (Project Manager) · Project Manager" });
  await page.getByLabel("Project Admin").selectOption({ label: "Puri (Project Admin) · Staff Project Admin" });
  await page.getByRole("button", { name: "Simpan tim" }).click();
  await expect(page.getByText("Tim proyek disimpan.")).toBeVisible();
});

const SITES = [
  { kode: "SC-01", nama: "Kantor Kelurahan Utara", wilayah: "Jakarta", alamat: "Jl. Utara No. 1", pic: "Bu Ani" },
  { kode: "SC-02", nama: "Kantor Kelurahan Selatan", wilayah: "Jakarta", alamat: "Jl. Selatan No. 2", pic: "Pak Budi" },
];

test("The Project Manager registers the contract's sites, no more than the contract says", async ({ page }) => {
  await openProject("pm", page);
  await expect(page.getByTestId("site-count")).toHaveText("0 dari 2 lokasi kontrak terdaftar");
  for (const s of SITES) {
    await page.getByRole("button", { name: "Tambah lokasi" }).click();
    await page.getByLabel("Kode lokasi").fill(s.kode);
    await page.getByLabel("Nama lokasi").fill(s.nama);
    await page.getByLabel("Wilayah").fill(s.wilayah);
    await page.getByLabel("Alamat").fill(s.alamat);
    await page.getByLabel("PIC pelanggan").fill(s.pic);
    await page.getByLabel("Rencana selesai").fill("2027-03-31");
    await page.getByRole("button", { name: "Simpan lokasi" }).click();
    await expect(page.getByRole("row", { name: new RegExp(s.kode) })).toBeVisible();
  }
  await expect(page.getByTestId("site-count")).toHaveText("2 dari 2 lokasi kontrak terdaftar");
  await expect(page.getByRole("button", { name: "Tambah lokasi" })).toBeDisabled();
});

/** A page of the project (Perencanaan, Serah terima, ...), opened from the project's header. */
async function openPage(role: E2eRole, page: Page, link: string) {
  await openProject(role, page);
  await page.getByRole("link", { name: link, exact: true }).click();
}

/** Records the reference of one planning item, as its owner. */
async function record(page: Page, key: string, reference: string) {
  const item = page.getByTestId(`plan-${key}`);
  await item.getByLabel("Rujukan (tempat berkas disimpan)").fill(reference);
  await item.getByRole("button", { name: "Catat" }).click();
  await expect(item.getByText("Tercatat")).toBeVisible();
}

test("Planning: each owner records their own files, and only the Head PMO signs the gates", async ({ page }) => {
  await openPage("pm", page, "Perencanaan");
  await expect(page.getByTestId("plan-mom").getByLabel("Rujukan (tempat berkas disimpan)")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sahkan Kick-Off Gate" })).toHaveCount(0);
  await record(page, "kickoff", "drive://proyek-uji/kickoff");
  await record(page, "charter", "drive://proyek-uji/charter");
  await record(page, "risk", "drive://proyek-uji/risk");

  await openPage("project_admin", page, "Perencanaan");
  await expect(page.getByTestId("plan-charter").getByLabel("Rujukan (tempat berkas disimpan)")).toHaveCount(0);
  await record(page, "mom", "drive://proyek-uji/mom");
  await record(page, "requirements", "drive://proyek-uji/administrasi");

  await openPage("head_pmo", page, "Perencanaan");
  await page.getByRole("button", { name: "Sahkan Kick-Off Gate" }).click();
  await expect(page.getByTestId("gate-kickoff").getByTestId("state")).toContainText("Disahkan");
  await page.getByLabel("Target RFS").fill("2027-05-31");
  await page.getByRole("button", { name: "Sahkan baseline" }).click();
  await expect(page.getByTestId("gate-baseline").getByTestId("state")).toContainText("Disahkan");
});

const bai = (page: Page, kode: string) => page.getByTestId(/^bai-/).filter({ hasText: kode });

test("The Project Admin moves both sites to Uji after the baseline, marking one for the uji petik sample", async ({ page }) => {
  await openProject("project_admin", page);
  for (const [kode, sample] of [["SC-01", false], ["SC-02", true]] as const) {
    await page.getByRole("button", { name: `Ubah ${kode}` }).click();
    await page.getByLabel("Status", { exact: true }).selectOption("Uji");
    if (sample) await page.getByLabel("Sampel uji petik").check();
    await page.getByRole("button", { name: "Simpan lokasi" }).click();
    await expect(page.getByRole("button", { name: `Ubah ${kode}` })).toBeVisible();
  }
  // The first site past Staging takes the project from Initiation to Implementasi.
  await expect(page.getByText("Implementasi", { exact: true }).first()).toBeVisible();
  await expect(bai(page, "SC-01")).toContainText("Menunggu Delivery Control");
});

test("BAI has three hands: Delivery Control records, Project Admin compiles, Assurance verifies", async ({ page }) => {
  // The Project Manager verifies the installation but does not hold the BAI.
  await openProject("pm", page);
  await expect(page.getByRole("button", { name: "Catat BAI SC-01" })).toHaveCount(0);

  await openProject("delivery_control", page);
  for (const [kode, n] of [["SC-01", "1"], ["SC-02", "2"]] as const) {
    await page.getByRole("button", { name: `Catat BAI ${kode}` }).click();
    await page.getByLabel("Nomor BAI").fill(`BAI/UJI/2027/00${n}`);
    await page.getByLabel("Tanggal BAI").fill(ago(60));
    await page.getByLabel("Rujukan evidence").fill(`drive://proyek-uji/bai-${kode}`);
    await page.getByRole("button", { name: "Simpan BAI" }).click();
    await expect(bai(page, kode)).toContainText("BAI terbit");
  }

  // The Project Admin finds the evidence for SC-02 incomplete and sends the BAI back: the site returns to Uji.
  await openProject("project_admin", page);
  await page.getByRole("button", { name: "Kembalikan BAI SC-02" }).click();
  await page.getByLabel("Alasan pengembalian").fill("Foto hasil uji belum lengkap");
  await page.getByRole("button", { name: "Kembalikan BAI", exact: true }).click();
  await expect(bai(page, "SC-02").getByTestId("return-note")).toContainText("Foto hasil uji belum lengkap");
  await expect(bai(page, "SC-02")).toContainText("Menunggu Delivery Control");

  await openProject("delivery_control", page);
  await expect(bai(page, "SC-02").getByTestId("return-note")).toContainText("Foto hasil uji belum lengkap");
  await page.getByRole("button", { name: "Catat BAI SC-02" }).click();
  await page.getByLabel("Nomor BAI").fill("BAI/UJI/2027/002-R");
  await page.getByLabel("Tanggal BAI").fill(ago(60));
  await page.getByLabel("Rujukan evidence").fill("drive://proyek-uji/bai-SC-02-lengkap");
  await page.getByRole("button", { name: "Simpan BAI" }).click();
  await expect(bai(page, "SC-02")).toContainText("BAI terbit");

  await openProject("project_admin", page);
  await page.getByRole("button", { name: "Kompilasi BAI SC-01" }).click();
  await expect(bai(page, "SC-01")).toContainText("Menunggu Assurance (BCD)");
  // The sample site cannot be compiled before its uji petik is confirmed.
  await expect(page.getByRole("button", { name: "Kompilasi BAI SC-02" })).toBeDisabled();
  await page.getByLabel("Uji petik lulus").check();
  await page.getByRole("button", { name: "Kompilasi BAI SC-02" }).click();

  await openProject("sales", page);
  await page.getByRole("button", { name: "Verifikasi BAI SC-01" }).click();
  await page.getByRole("button", { name: "Verifikasi BAI SC-02" }).click();
  await expect(bai(page, "SC-01")).toContainText("Selesai");
  await expect(bai(page, "SC-02")).toContainText("Selesai");
  await expect(page.getByText("2 / 2")).toBeVisible();
});

test("RFS and BAST: for a TELKOM customer BARD and BAUT come first; the Head PMO signs RFS and BAST", async ({ page }) => {
  // BCD marks the customer as TELKOM scheme; BARD and BAUT then wait for RFS.
  await openProject("sales", page);
  // The box follows the saved value, so click it and wait for the server rather than asserting an instant toggle.
  const scheme = page.getByLabel("Pelanggan skema TELKOM (BARD dan BAUT dibutuhkan sebelum BAST)");
  await scheme.click();
  await expect(scheme).toBeChecked();
  await expect(page.getByText("BARD dan BAUT dicatat setelah RFS disahkan.")).toBeVisible();

  await openProject("pm", page);
  const rfs = page.getByTestId("signoff-rfs");
  await rfs.getByLabel("Tanggal RFS").fill(ago(40));
  await rfs.getByRole("button", { name: "Nyatakan RFS" }).click();
  await expect(rfs.getByRole("button", { name: "Sahkan RFS" })).toHaveCount(0);

  await openProject("head_pmo", page);
  await page.getByTestId("signoff-rfs").getByRole("button", { name: "Sahkan RFS" }).click();
  await expect(page.getByTestId("signoff-rfs").getByTestId("state")).toContainText("Disahkan");

  // The BAST is held back until Assurance has recorded both documents.
  await openProject("project_admin", page);
  await expect(page.getByTestId("signoff-bast").getByTestId("blockers")).toContainText(/BARD|BAUT/);

  await openProject("sales", page);
  await page.getByTestId("telkom-bard").getByLabel("Nomor BARD").fill("BARD/UJI/001");
  await page.getByTestId("telkom-bard").getByLabel("Tanggal BARD").fill(ago(35));
  await page.getByTestId("telkom-bard").getByRole("button", { name: "Catat BARD" }).click();
  await expect(page.getByTestId("telkom-bard")).toContainText("BARD/UJI/001");
  await page.getByTestId("telkom-baut").getByLabel("Nomor BAUT").fill("BAUT/UJI/001");
  await page.getByTestId("telkom-baut").getByLabel("Tanggal BAUT").fill(ago(35));
  await page.getByTestId("telkom-baut").getByRole("button", { name: "Catat BAUT" }).click();
  await expect(page.getByTestId("telkom-baut")).toContainText("BAUT/UJI/001");

  await openProject("project_admin", page);
  const bast = page.getByTestId("signoff-bast");
  await bast.getByLabel("Nomor BAST").fill("BAST/UJI/2027/001");
  await bast.getByLabel("Tanggal BAST").fill(ago(30));
  await bast.getByRole("button", { name: "Siapkan BAST" }).click();

  await openProject("head_pmo", page);
  await page.getByTestId("signoff-bast").getByRole("button", { name: "Sahkan BAST" }).click();
  await expect(page.getByTestId("signoff-bast").getByTestId("state")).toContainText("Disahkan");
  // An approved BAST takes the project to Penagihan.
  await expect(page.getByText("Penagihan", { exact: true }).first()).toBeVisible();
});

const MSO_CRITERIA = ["Ruang lingkup kontrak", "Ambang batas SLA", "Ketersediaan spare parts", "Topologi dan konfigurasi teknis", "Kelengkapan administrasi"];
const EOS_CHECKLIST = ["Ketersediaan perangkat cadangan", "Lisensi", "Topologi jaringan", "Akses remote"];

test("Handover: the PMO fills the package; MSO sends it back once, then accepts it", async ({ page }) => {
  await openPage("pm", page, "Serah terima");
  const pkg = page.getByTestId("handover-package");
  await expect(pkg.getByTestId("missing")).toContainText("artefak wajib belum diisi");
  for (let no = 1; no <= 15; no++) await pkg.getByLabel(`Rujukan artefak ${no}`, { exact: true }).fill(`drive://proyek-uji/artefak-${no}`);
  await pkg.getByRole("button", { name: "Simpan paket" }).click();
  await expect(pkg.getByTestId("missing")).toContainText("Semua artef");
  await pkg.getByRole("button", { name: "Ajukan ke MSO" }).click();
  await expect(pkg.getByTestId("handover-status")).toContainText("Diajukan");

  await openPage("head_mso", page, "Serah terima");
  const mso = page.getByTestId("handover-mso");
  // One criterion is not met: the package goes back with a note.
  for (const c of MSO_CRITERIA.slice(0, 4)) await mso.getByRole("checkbox", { name: new RegExp(`^${c}`) }).check();
  await expect(mso.getByRole("button", { name: "Terima serah terima" })).toBeDisabled();
  await mso.getByLabel("Catatan kekurangan (wajib bila dikembalikan)").fill("Dokumen administrasi belum lengkap");
  await mso.getByRole("button", { name: "Kembalikan ke PMO" }).click();
  await expect(page.getByTestId("handover-status")).toContainText("Dikembalikan");

  await openPage("pm", page, "Serah terima");
  await expect(page.getByTestId("return-note")).toContainText("Dokumen administrasi belum lengkap");
  await page.getByTestId("handover-package").getByRole("button", { name: "Ajukan ke MSO" }).click();
  await expect(page.getByTestId("handover-status")).toContainText("Diajukan");

  await openPage("head_mso", page, "Serah terima");
  for (const c of MSO_CRITERIA) await page.getByTestId("handover-mso").getByRole("checkbox", { name: new RegExp(`^${c}`) }).check();
  await page.getByTestId("handover-mso").getByRole("button", { name: "Terima serah terima" }).click();
  await expect(page.getByTestId("handover-status")).toContainText("Diterima");
});

test("Handover: Staff Operational EOS completes the checklist, then the Head ISO accepts the technical hand-off", async ({ page }) => {
  await openPage("head_iso", page, "Serah terima");
  await expect(page.getByTestId("handover-iso").getByRole("button", { name: "Terima turunan teknis" })).toHaveCount(0);

  await openPage("eos", page, "Serah terima");
  for (const c of EOS_CHECKLIST) await page.getByTestId("handover-eos").getByRole("checkbox", { name: new RegExp(`^${c}`) }).check();
  await page.getByTestId("handover-eos").getByRole("button", { name: "Simpan checklist" }).click();
  await expect(page.getByTestId("handover-eos")).toContainText("Terakhir diisi");

  await openPage("head_iso", page, "Serah terima");
  await page.getByTestId("handover-iso").getByRole("button", { name: "Terima turunan teknis" }).click();
  await expect(page.getByTestId("handover-iso")).toContainText("Diterima");
  await expect(page.getByTestId("handover-status")).toContainText("Diterima ISO");
});

const defect = (page: Page, text: string) => page.getByTestId(/^defect-/).filter({ hasText: text });

test("Warranty defects: only a defect both heads confirm is paid by the project, fixed by Delivery Control and closed by the Head PMO", async ({ page }) => {
  // Reports open once MSO has accepted the handover; ISO, MSO and EOS people report.
  await openPage("eos", page, "Garansi & penutupan");
  for (const [text, site] of [["Router SC-01 mati total", "SC-01"], ["Lampu indikator SC-02 redup", "SC-02"]] as const) {
    await page.getByLabel("Uraian gangguan").fill(text);
    await page.getByLabel("Lokasi").selectOption(site);
    await page.getByRole("button", { name: "Laporkan" }).click();
    await expect(defect(page, text).getByTestId("status")).toContainText("Menunggu penetapan");
  }
  // The reporter does not settle it: no classification buttons on their own report.
  await expect(defect(page, "Router SC-01").getByRole("button", { name: /Tetapkan cacat bawaan|Gangguan operasional/ })).toHaveCount(0);

  // One head alone is not enough for the first defect.
  await openPage("head_iso", page, "Garansi & penutupan");
  await defect(page, "Router SC-01").getByRole("button", { name: "Tetapkan cacat bawaan (ISO)" }).click();
  await expect(defect(page, "Router SC-01").getByTestId("status")).toContainText("Menunggu penetapan");
  // The second is not an inherited defect: Head ISO rules it operational, with a reason.
  await defect(page, "Lampu indikator").getByRole("button", { name: "Gangguan operasional" }).click();
  await page.getByLabel("Alasan bukan cacat bawaan").fill("Redup karena usia lampu, bukan instalasi");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(defect(page, "Lampu indikator").getByTestId("status")).toContainText("Gangguan operasional");

  await openPage("head_pmo", page, "Garansi & penutupan");
  await defect(page, "Router SC-01").getByRole("button", { name: "Tetapkan cacat bawaan (PMO)" }).click();
  await expect(defect(page, "Router SC-01").getByTestId("status")).toContainText("Cacat bawaan proyek");
  await expect(defect(page, "Router SC-01").getByTestId("cost")).toBeVisible();
  // An open inherited defect keeps the project from closing.
  await expect(page.getByTestId("warranty-closure").getByTestId("closure-state")).toContainText("Belum dapat ditutup");

  await openPage("delivery_control", page, "Garansi & penutupan");
  await defect(page, "Router SC-01").getByRole("button", { name: "Catat perbaikan" }).click();
  await page.getByLabel("Perbaikan yang dilakukan").fill("Router diganti dengan unit cadangan");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(defect(page, "Router SC-01").getByTestId("status")).toContainText("Diperbaiki");

  await openPage("head_pmo", page, "Garansi & penutupan");
  await defect(page, "Router SC-01").getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(defect(page, "Router SC-01").getByTestId("status")).toContainText("Ditutup");
});

test("Closing: BCD sets the warranty end; the project cannot close while it runs, then the Head PMO closes it and it turns read-only", async ({ page }) => {
  await openPage("sales", page, "Garansi & penutupan");
  await expect(page.getByTestId("warranty-closure").getByRole("button", { name: "Nyatakan proyek ditutup" })).toHaveCount(0);
  await page.getByLabel("Tanggal akhir garansi terakhir").fill("2099-12-31");
  await page.getByRole("button", { name: "Simpan akhir garansi" }).click();
  // Saved: the date now matches the project's, so the button has nothing left to save.
  await expect(page.getByRole("button", { name: "Simpan akhir garansi" })).toBeDisabled();

  await openPage("head_pmo", page, "Garansi & penutupan");
  const closure = page.getByTestId("warranty-closure");
  await expect(closure.getByTestId("closure-state")).toContainText("Belum dapat ditutup");
  await expect(closure.getByTestId("closure-blockers")).toBeVisible();
  await expect(closure.getByRole("button", { name: "Nyatakan proyek ditutup" })).toHaveCount(0);

  // The warranty has now run out: it ended yesterday.
  await openPage("sales", page, "Garansi & penutupan");
  await page.getByLabel("Tanggal akhir garansi terakhir").fill(ago(1));
  await page.getByRole("button", { name: "Simpan akhir garansi" }).click();

  await openPage("head_pmo", page, "Garansi & penutupan");
  await expect(page.getByTestId("warranty-closure").getByTestId("closure-state")).toContainText("Siap ditutup");
  await page.getByTestId("warranty-closure").getByRole("button", { name: "Nyatakan proyek ditutup" }).click();
  await expect(page.getByTestId("warranty-closure").getByTestId("closure-state")).toContainText("Ditutup");

  // A closed project is read-only.
  await openProject("pm", page);
  await expect(page.getByRole("button", { name: "Tambah lokasi" })).toHaveCount(0);
});

// A second project, which never gets as far as a BAST: the contract changes, a site is removed, and it is dropped.
const SECOND = "Proyek Uji Dihentikan";

test("A second project is opened for a contract of 3 sites and gets its team", async ({ page }) => {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  await sql`
    insert into pipeline_deal (fiscal_year, entity_code, customer, segment, project, coa_code, value, status, probability, type, start_month, end_month)
    values (2028, 'ESTRADA', 'Pemkab Uji', 'Telco Business', ${SECOND}, '4100', 300000000, 'CW', 100, 'new', 1, 6)`;
  await sql.end();

  await as("sales", page, "/implementasi");
  await page.getByLabel(`Jumlah lokasi kontrak ${SECOND}`).fill("3");
  await page.getByRole("button", { name: "Buka proyek" }).click();
  await expect(page.getByRole("link", { name: SECOND })).toBeVisible();

  await openProject("head_pmo", page, SECOND);
  await page.getByLabel("Project Manager").selectOption({ label: "Pandu (Project Manager) · Project Manager" });
  await page.getByLabel("Delivery Control").selectOption({ label: "Dika (Delivery Control) · Staff Delivery Control" });
  await page.getByLabel("Project Admin").selectOption({ label: "Puri (Project Admin) · Staff Project Admin" });
  await page.getByRole("button", { name: "Simpan tim" }).click();
  await expect(page.getByText("Tim proyek disimpan.")).toBeVisible();
});

test("Contract addendum: BCD may not go below the registered sites and must give the basis", async ({ page }) => {
  await openProject("pm", page, SECOND);
  for (const [kode, nama] of [["A-01", "Gudang Utara"], ["A-02", "Gudang Selatan"]]) {
    await page.getByRole("button", { name: "Tambah lokasi" }).click();
    await page.getByLabel("Kode lokasi").fill(kode);
    await page.getByLabel("Nama lokasi").fill(nama);
    await page.getByLabel("Alamat").fill(`Jl. ${nama} No. 9`);
    await page.getByLabel("Rencana selesai").fill("2027-06-30");
    await page.getByRole("button", { name: "Simpan lokasi" }).click();
    await expect(page.getByRole("row", { name: new RegExp(kode) })).toBeVisible();
  }

  await openProject("sales", page, SECOND);
  const contract = page.getByTestId("project-contract");
  await expect(contract).toContainText("2 terdaftar");
  // Fewer than the 2 registered sites is refused, and so is a change without its basis.
  await contract.getByLabel("Jumlah baru").fill("1");
  await contract.getByLabel("Dasar perubahan").fill("Addendum 01/2027");
  await expect(contract.getByRole("button", { name: "Ubah jumlah lokasi" })).toBeDisabled();
  await contract.getByLabel("Jumlah baru").fill("4");
  await contract.getByLabel("Dasar perubahan").fill("");
  await expect(contract.getByRole("button", { name: "Ubah jumlah lokasi" })).toBeDisabled();
  await contract.getByLabel("Dasar perubahan").fill("Addendum 01/2027: tambah satu lokasi");
  await contract.getByRole("button", { name: "Ubah jumlah lokasi" }).click();
  await expect(contract).toContainText("Jumlah lokasi kontrak 4");

  // Only BCD changes the contract; the Project Manager sees the number but has no form.
  await openProject("pm", page, SECOND);
  await expect(page.getByTestId("project-contract").getByRole("button", { name: "Ubah jumlah lokasi" })).toHaveCount(0);
  await expect(page.getByTestId("site-count")).toHaveText("2 dari 4 lokasi kontrak terdaftar");
});

test("A site registered by mistake is deleted by the Project Manager, after a confirmation", async ({ page }) => {
  await openProject("project_admin", page, SECOND);
  await expect(page.getByRole("button", { name: "Hapus A-02" })).toHaveCount(0);

  await openProject("pm", page, SECOND);
  await page.getByRole("button", { name: "Hapus A-02" }).click();
  await page.getByRole("button", { name: "Batal" }).click();
  await expect(page.getByTestId("site-count")).toHaveText("2 dari 4 lokasi kontrak terdaftar");
  await page.getByRole("button", { name: "Hapus A-02" }).click();
  await page.getByRole("button", { name: "Yakin hapus A-02" }).click();
  await expect(page.getByTestId("site-count")).toHaveText("1 dari 4 lokasi kontrak terdaftar");
});

test("Drop: only the Head PMO stops a project, with a reason and a confirmation; it then turns read-only", async ({ page }) => {
  await openProject("pm", page, SECOND);
  await expect(page.getByTestId("project-drop")).toHaveCount(0);

  await openProject("head_pmo", page, SECOND);
  const drop = page.getByTestId("project-drop");
  await expect(drop.getByRole("button", { name: "Hentikan proyek (Drop)" })).toBeDisabled();
  await drop.getByLabel("Alasan proyek dihentikan").fill("Kontrak dibatalkan pelanggan");
  await drop.getByRole("button", { name: "Hentikan proyek (Drop)" }).click();
  await expect(drop).toContainText("tidak dapat diubah lagi");
  await drop.getByRole("button", { name: "Ya, hentikan proyek" }).click();
  await expect(page.getByText("Drop", { exact: true }).first()).toBeVisible();

  // Dropped: no one can register sites or change the contract any more.
  await openProject("pm", page, SECOND);
  await expect(page.getByRole("button", { name: "Tambah lokasi" })).toHaveCount(0);
  await openProject("sales", page, SECOND);
  await expect(page.getByTestId("project-contract").getByRole("button", { name: "Ubah jumlah lokasi" })).toHaveCount(0);
});
