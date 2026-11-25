import { readFileSync } from "node:fs";
import { expect, test, type Cookie, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DATABASE_URL } from "../playwright.config";
import { authFile, type E2eRole } from "./users";

/**
 * The Admin screens: users and invitations, units and entities, positions and the pjs for a vacant seat. Named to
 * run after the other journeys, because it adds people, units and positions their counts and emails must not see.
 */
test.describe.configure({ mode: "serial" });

async function as(role: E2eRole, page: Page, path: string) {
  const state = JSON.parse(readFileSync(authFile(role), "utf8")) as { cookies: Cookie[] };
  await page.context().clearCookies();
  await page.context().addCookies(state.cookies);
  await page.goto(path);
}

const sql = () => postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
const NOT_FOUND = "Halaman tidak ditemukan atau tidak dapat diakses";

test("Only Admin opens the admin screens: everyone else is sent away or told the page does not exist", async ({ page }) => {
  for (const role of ["requestor", "finance", "director"] as const) {
    for (const path of ["/admin/users", "/admin/positions", "/admin/master"]) {
      // A redirect away from the page aborts the first navigation, which is the answer being tested.
      await as(role, page, "/").catch(() => {});
      await page.goto(path).catch(() => {});
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByText("Undang pengguna"), `${role} ${path}`).toHaveCount(0);
      await expect(page.getByText("Pilihan Unit dan Entitas di seluruh aplikasi"), `${role} ${path}`).toHaveCount(0);
      await expect(page.getByText("Klik orang atau posisi untuk menetapkan pemegang"), `${role} ${path}`).toHaveCount(0);
    }
  }
  await as("admin", page, "/admin/users");
  await expect(page.getByText("Undang pengguna")).toBeVisible();
});

test("Admin sees no budget figures: no rupiah amount on any RKA, finance or project screen", async ({ page }) => {
  for (const path of ["/rka", "/rka/review", "/rka/cycle", "/summary", "/pipeline", "/cash", "/coa", "/pembayaran", "/implementasi"]) {
    await as("admin", page, path).catch(() => {});
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main"), path).not.toContainText(/Rp\s?\d/);
  }
});

/** The user's own edit form: the page has other forms with a Simpan button of their own. */
const userForm = (page: Page) => page.locator("form").filter({ has: page.locator("#u-name") });

const NEW_USER = "Rahma Uji";
const NEW_EMAIL = "rahma.uji@estrada.test";

test("Admin invites a user into a position; a second invitation to the same email is refused", async ({ page }) => {
  await as("admin", page, "/admin/users");
  await page.getByLabel("Nama", { exact: true }).fill(NEW_USER);
  await page.getByLabel("Email").fill(NEW_EMAIL);
  await page.getByLabel("Jabatan").fill("Staff SCM Uji");
  await page.getByLabel("Unit", { exact: true }).selectOption("SCM");
  await page.getByLabel("Role").selectOption("requestor");
  await page.getByRole("button", { name: "Kirim undangan" }).click();
  await expect(page.getByText(`Undangan dikirim ke ${NEW_EMAIL}.`)).toBeVisible();

  const db = sql();
  const [user] = await db<{ id: string; active: boolean }[]>`select id, active from "user" where email = ${NEW_EMAIL}`;
  const [pos] = await db<{ org_unit_code: string; role: string; title: string }[]>`select org_unit_code, role, title from position where holder_user_id = ${user!.id}`;
  // The invitation carries a set-password link; no password exists until the person sets one.
  const [account] = await db<{ n: number }[]>`select count(*)::int n from account where user_id = ${user!.id}`;
  const [audit] = await db<{ n: number }[]>`select count(*)::int n from audit_log where action = 'user.invite' and subject_id = ${user!.id}`;
  await db.end();
  expect(user!.active).toBe(true);
  expect(pos).toEqual({ org_unit_code: "SCM", role: "requestor", title: "Staff SCM Uji" });
  expect(account!.n).toBe(0);
  expect(audit!.n).toBe(1);

  await page.getByLabel("Nama", { exact: true }).fill("Orang Lain");
  await page.getByLabel("Email").fill(NEW_EMAIL);
  await page.getByLabel("Jabatan").fill("Staff Lain");
  await page.getByLabel("Unit", { exact: true }).selectOption("SCM");
  await page.getByRole("button", { name: "Kirim undangan" }).click();
  await expect(page.getByText("Email sudah terdaftar.")).toBeVisible();
});

test("Admin renames a user and deactivates the account, but not their own", async ({ page }) => {
  await as("admin", page, "/admin/users");
  await page.getByRole("row", { name: new RegExp(NEW_EMAIL) }).getByRole("link").click();
  // Let the page hydrate first: text typed into the form before that is lost when React takes it over.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Nama", { exact: true }).fill("Rahma Uji Baru");
  await expect(page.getByLabel("Nama", { exact: true })).toHaveValue("Rahma Uji Baru");
  await page.getByLabel("Akun aktif").uncheck();
  await userForm(page).getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Pengguna disimpan.")).toBeVisible();

  await as("admin", page, "/admin/users");
  const row = page.getByRole("row", { name: new RegExp(NEW_EMAIL) });
  await expect(row).toContainText("Rahma Uji Baru");
  await expect(row).toContainText(/nonaktif/i);

  // The signed-in Admin cannot switch their own account off.
  await page.getByRole("row", { name: /e2e\.admin@estrada\.test/ }).getByRole("link").click();
  await page.getByLabel("Akun aktif").uncheck();
  await userForm(page).getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Anda tidak dapat menonaktifkan akun sendiri.")).toBeVisible();
});

test("Admin adds a unit and an entity, renames the unit, and codes stay unique", async ({ page }) => {
  await as("admin", page, "/admin/master");
  const newUnit = page.locator("form").filter({ has: page.getByLabel("Kode unit") });
  await newUnit.getByLabel("Kode unit").fill("uji-adm");
  await newUnit.getByLabel("Nama unit").fill("Unit Uji Admin");
  await newUnit.getByLabel("Tipe").selectOption("unit");
  await newUnit.getByLabel("Induk").selectOption("PMO");
  await newUnit.getByRole("button", { name: "Tambah" }).click();
  await expect(page.getByText("Unit ditambahkan.")).toBeVisible();

  // The code is stored upper-case and cannot be used twice.
  await page.reload();
  const again = page.locator("form").filter({ has: page.getByLabel("Kode unit") });
  await again.getByLabel("Kode unit").fill("UJI-ADM");
  await again.getByLabel("Nama unit").fill("Unit Kembar");
  await again.getByRole("button", { name: "Tambah" }).click();
  await expect(page.getByText("Kode unit sudah ada.")).toBeVisible();

  await page.reload();
  // The code is also a parent option in every row, so find the row by the code shown on its own.
  const row = page.locator("form").filter({ has: page.getByText("UJI-ADM", { exact: true }) });
  await row.getByLabel("Nama unit").fill("Unit Uji Admin Baru");
  await row.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Unit disimpan.")).toBeVisible();

  const newEntity = page.locator("form").filter({ has: page.getByLabel("Kode entitas") });
  await newEntity.getByLabel("Kode entitas").fill("ujient");
  await newEntity.getByLabel("Nama entitas").fill("Entitas Uji");
  await newEntity.getByLabel("Jenis biaya").selectOption("direct");
  await newEntity.getByRole("button", { name: "Tambah" }).click();
  await expect(page.getByText("Entitas ditambahkan.")).toBeVisible();

  const db = sql();
  const [unit] = await db<{ name: string; parent_code: string }[]>`select name, parent_code from org_unit where code = 'UJI-ADM'`;
  const [entity] = await db<{ active: boolean }[]>`select active from company_entity where code = 'UJIENT'`;
  const trail = await db<{ action: string }[]>`select action from audit_log where subject_id in ('UJI-ADM', 'UJIENT') order by created_at`;
  await db.end();
  expect(unit).toEqual({ name: "Unit Uji Admin Baru", parent_code: "PMO" });
  expect(entity!.active).toBe(true);
  expect(trail.map((t) => t.action)).toEqual(["unit.create", "unit.update", "entity.create"]);
});

const SEAT = "Head of Uji";
const HELD_LINE = "Baris untuk kursi kosong";

test("Admin creates a vacant position; a line handed to it tells Admin, who then names a pjs", async ({ page }) => {
  await as("admin", page, "/admin/positions?tampilan=daftar");
  await page.waitForLoadState("networkidle");
  await page.locator("#pos-unit").selectOption("UJI-ADM");
  await page.locator("#pos-role").selectOption("default_owner");
  await page.locator("#pos-title").fill(SEAT);
  await page.getByRole("checkbox", { name: "ESTRADA" }).check();
  await page.getByRole("button", { name: "Buat posisi" }).click();
  await expect(page.getByText(`Posisi ${SEAT} dibuat (kosong).`)).toBeVisible();

  const db = sql();
  const [seat] = await db<{ holder_user_id: string | null; acting_user_id: string | null }[]>`
    select holder_user_id, acting_user_id from position where title = ${SEAT}`;
  expect(seat).toEqual({ holder_user_id: null, acting_user_id: null });

  // A requestor's draft line (in the newest open version, the one RKA Saya shows) is owned by the new unit, whose Default Owner seat is empty.
  const [version] = await db<{ id: string }[]>`select id from budget_version where status = 'open' order by fiscal_year desc, created_at desc limit 1`;
  const [line] = await db<{ id: string }[]>`select id from budget_line where version_id = ${version!.id} and requestor_unit = 'SCM' and state = 'draft' order by id limit 1`;
  await db`update budget_line set owner_unit = 'UJI-ADM', item = ${HELD_LINE} where id = ${line!.id}`;
  await db.end();

  await as("requestor", page, "/rka");
  await page.waitForLoadState("networkidle");
  const row = page.getByRole("row").filter({ has: page.locator(`input[value="${HELD_LINE}"]`) });
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Kirim ke Default Owner (1)" }).click();
  await expect(page.getByText("1 baris diproses.")).toBeVisible();

  // Nobody is escalated to: Admin is told to assign a pjs, and the page lists what is held up.
  const check = sql();
  const [mail] = await check<{ n: number }[]>`select count(*)::int n from email_outbox where template = 'seat_vacant' and to_email = 'e2e.admin@estrada.test'`;
  const [note] = await check<{ n: number }[]>`
    select count(*)::int n from notification n join "user" u on u.id = n.user_id where n.template = 'seat_vacant' and u.email = 'e2e.admin@estrada.test'`;
  await check.end();
  expect(mail!.n).toBe(1);
  expect(note!.n).toBe(1);

  await as("admin", page, "/admin/positions?tampilan=daftar");
  const blocked = page.getByRole("row").filter({ hasText: "UJI-ADM" }).filter({ hasText: "Kosong: tetapkan pjs di tabel posisi" });
  await expect(blocked).toContainText("1");

  await page.waitForLoadState("networkidle");
  const seatRow = page.getByRole("row").filter({ hasText: SEAT });
  await seatRow.getByLabel("Pilih pjs").selectOption({ label: "Pandu (Project Manager) · e2e.pm@estrada.test" });
  await seatRow.getByRole("button", { name: "Simpan pjs" }).click();
  await expect(page.getByText("pjs ditetapkan.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: "UJI-ADM" }).filter({ hasText: "Kosong: tetapkan pjs di tabel posisi" })).toHaveCount(0);
});
