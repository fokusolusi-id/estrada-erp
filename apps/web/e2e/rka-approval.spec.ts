import { readFileSync } from "node:fs";
import { expect, test, type Cookie, type Page } from "@playwright/test";
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

test("4. Finance finalises", async ({ page }) => {
  await as("finance", page, "/rka/review");
  await page.getByLabel("Pilih semua SCM").check();
  await page.getByRole("button", { name: "Finalisasi" }).click();
  await expect(page.getByText("3 baris diproses.")).toBeVisible();

  // The lock belongs to the Director: Finance sees the lines but cannot lock them.
  await page.goto("/rka/lock");
  await expect(page.getByLabel("Pilih semua SCM")).toBeDisabled();
});

test("5. Director locks the version and reads the Management Summary", async ({ page }) => {
  await as("director", page, "/rka/lock");
  await page.getByLabel("Pilih semua SCM").check();
  await page.getByRole("button", { name: "Kunci versi" }).click();
  await expect(page.getByText("3 baris diproses.")).toBeVisible();

  await page.goto("/summary");
  await expect(page.getByText("3 baris, 3 terkunci")).toBeVisible();
  // 6241: 19.821.320 x 12 + 5300: 390.686.823,67 x 12 + new line 1.500.000 x 12
  await expect(page.getByText("Rp 4.944,1 jt").first()).toBeVisible();

  await page.getByLabel("Divisi").selectOption("PDMS");
  await expect(page).toHaveURL(/division=PDMS/);
  await expect(page.getByTestId("contribution-PDMS").first()).toBeVisible();
});
