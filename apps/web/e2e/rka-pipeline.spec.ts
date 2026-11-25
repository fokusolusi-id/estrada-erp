import { readFileSync } from "node:fs";
import { expect, test, type Cookie, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DATABASE_URL } from "../playwright.config";
import { authFile, type E2eRole } from "./users";

/**
 * The Pipeline register beyond its first journeys (those live in rka-approval.spec.ts): a deal's whole life, what a
 * deal with a project may no longer do, and the entity scope of BCD's people. The file name sorts after
 * rka-approval.spec.ts on purpose: its Pipeline figures are exact, and these tests add deals of their own.
 */
test.describe.configure({ mode: "serial" });

/** Switches the page to a role's saved session (from auth.setup.ts) and opens a path. */
async function as(role: E2eRole, page: Page, path: string) {
  const state = JSON.parse(readFileSync(authFile(role), "utf8")) as { cookies: Cookie[] };
  await page.context().clearCookies();
  await page.context().addCookies(state.cookies);
  await page.goto(path);
}

const LIFECYCLE = "Uji Siklus Hidup Deal";
const WITH_PROJECT = "Uji Deal Dengan Proyek";

const dealRow = (page: Page, project: string) => page.getByTestId(/^deal-/).filter({ hasText: project });

test("BCD adds a deal, changes it, and deletes it; every step is in the audit trail", async ({ page }) => {
  await as("sales", page, "/pipeline");
  await page.getByRole("button", { name: "Tambah deal" }).click();
  let form = page.getByRole("form", { name: "Deal" });
  await form.getByLabel("Customer", { exact: true }).fill("Pemda Uji");
  await form.getByLabel("Project").fill(LIFECYCLE);
  await form.getByLabel("COA deal").selectOption("4100");
  await form.getByLabel("Nilai (exclude PPN)").fill("200.000.000");
  await form.getByLabel("Status deal").selectOption("WB");
  await form.getByLabel("Probabilitas (%)").fill("80");
  await form.getByRole("button", { name: "Simpan deal" }).click();
  await expect(page.getByText("Deal disimpan.")).toBeVisible();
  // 200.000.000 x 80% = 160.000.000.
  await expect(dealRow(page, LIFECYCLE).getByTestId("weighted")).toContainText("160.000.000");

  await page.getByRole("button", { name: `Ubah ${LIFECYCLE}` }).click();
  form = page.getByRole("form", { name: "Deal" });
  await form.getByLabel("Nilai (exclude PPN)").fill("300.000.000");
  await form.getByLabel("Probabilitas (%)").fill("90");
  await form.getByRole("button", { name: "Simpan deal" }).click();
  await expect(dealRow(page, LIFECYCLE).getByTestId("weighted")).toContainText("270.000.000");

  await page.getByRole("button", { name: `Ubah ${LIFECYCLE}` }).click();
  await page.getByRole("form", { name: "Deal" }).getByRole("button", { name: "Hapus deal" }).click();
  await expect(page.getByText("Deal dihapus.")).toBeVisible();
  await expect(dealRow(page, LIFECYCLE)).toHaveCount(0);

  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  const actions = await sql<{ action: string }[]>`
    select action from audit_log where subject_type = 'pipeline_deal' and (after->>'project' = ${LIFECYCLE} or before->>'project' = ${LIFECYCLE}) order by created_at`;
  await sql.end();
  expect(actions.map((a) => a.action)).toEqual(["pipeline.create", "pipeline.update", "pipeline.delete"]);
});

test("A deal that has a project stays Closed Won and cannot be deleted", async ({ page }) => {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  const [version] = await sql<{ fiscal_year: number }[]>`select fiscal_year from budget_version order by fiscal_year desc limit 1`;
  await sql`
    insert into pipeline_deal (fiscal_year, entity_code, customer, segment, project, coa_code, value, status, probability, type, start_month, end_month)
    values (${version!.fiscal_year}, 'ESTRADA', 'Pemkot Uji', 'Telco Business', ${WITH_PROJECT}, '4100', 120000000, 'CW', 100, 'new', 1, 6)`;
  await sql.end();

  // BCD opens the project from the Closed Won deal.
  await as("sales", page, "/implementasi");
  await page.getByLabel(`Jumlah lokasi kontrak ${WITH_PROJECT}`).fill("1");
  await page.getByTestId(/^awaiting-/).filter({ hasText: WITH_PROJECT }).getByRole("button", { name: "Buka proyek" }).click();
  await expect(page.getByRole("link", { name: WITH_PROJECT })).toBeVisible();

  await as("sales", page, "/pipeline");
  await page.getByRole("button", { name: `Ubah ${WITH_PROJECT}` }).click();
  const form = page.getByRole("form", { name: "Deal" });
  await form.getByLabel("Status deal").selectOption("WB");
  await form.getByLabel("Probabilitas (%)").fill("90");
  await form.getByRole("button", { name: "Simpan deal" }).click();
  await expect(page.getByText("Deal ini sudah memiliki proyek di Implementasi; statusnya tetap Closed Won.")).toBeVisible();

  await form.getByRole("button", { name: "Hapus deal" }).click();
  await expect(page.getByText("Deal ini sudah memiliki proyek di Implementasi dan tidak dapat dihapus.")).toBeVisible();
  await expect(dealRow(page, WITH_PROJECT)).toHaveCount(1);
});

test("Entity scope: a BCD person outside ESTRADA reads its deals but cannot change them, nor file a deal there", async ({ page }) => {
  await as("sales_matrik", page, "/pipeline");
  await expect(dealRow(page, WITH_PROJECT)).toHaveCount(1);
  await expect(page.getByRole("button", { name: `Ubah ${WITH_PROJECT}` })).toHaveCount(0);

  await page.getByRole("button", { name: "Tambah deal" }).click();
  const entities = await page.getByRole("form", { name: "Deal" }).getByLabel("Entitas deal").locator("option").allTextContents();
  expect(entities.map((e) => e.trim())).toEqual(["MATRIK"]);
});
