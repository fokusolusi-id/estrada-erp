import { readFileSync } from "node:fs";
import { expect, test, type Cookie, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DATABASE_URL } from "../playwright.config";
import { authFile, type E2eRole } from "./users";

/**
 * The RKA cycle and the daily reminders. It runs last on purpose: it moves lines to other states and sets the
 * deadline, which the approval journeys must not see. By now the RKA 2027 is locked and Finance has opened a revision.
 */
test.describe.configure({ mode: "serial" });

const CRON = { authorization: "Bearer e2e-cron-secret-not-real" };

async function as(role: E2eRole, page: Page, path: string) {
  const state = JSON.parse(readFileSync(authFile(role), "utf8")) as { cookies: Cookie[] };
  await page.context().clearCookies();
  await page.context().addCookies(state.cookies);
  await page.goto(path);
}

const sql = () => postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });

const NEW_YEAR = "RKA 2028 Uji";

/** The new version's id and its form, so the test never mixes it up with the 2027 revision that is also open. */
async function newVersionId() {
  const db = sql();
  const [v] = await db<{ id: string }[]>`select id from budget_version where name = ${NEW_YEAR}`;
  await db.end();
  return v!.id;
}

test("Only Finance opens the cycle: the Director reads it, and other roles cannot see it", async ({ page }) => {
  await as("requestor", page, "/rka/cycle");
  await expect(page.getByText("Halaman tidak ditemukan atau tidak dapat diakses")).toBeVisible();

  await as("director", page, "/rka/cycle");
  await expect(page.getByText("Versi", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Buka siklus dan kirim email ke requestor" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Simpan", exact: true })).toHaveCount(0);
});

test("Finance opens 2028 from the locked 2027: lines copied as Draft, every requestor emailed once with the deadline", async ({ page }) => {
  await as("finance", page, "/rka/cycle");
  // The 2027 revision is open, but a revision does not hold back the next year.
  await page.locator("#cycle-year").fill("2028");
  await page.getByLabel("Nama versi").fill(NEW_YEAR);
  await page.getByLabel("Batas pengajuan (17.00 WIB)").fill("2027-12-31");
  await page.getByLabel("Mulai dari").selectOption("previous");
  await page.getByRole("button", { name: "Buka siklus dan kirim email ke requestor" }).click();
  await expect(page).toHaveURL(/done=opened/);
  await expect(page.getByText(NEW_YEAR).first()).toBeVisible();

  const id = await newVersionId();
  const db = sql();
  const [copied] = await db<{ n: number; drafts: number }[]>`select count(*)::int n, count(*) filter (where state = 'draft')::int drafts from budget_line where version_id = ${id}`;
  expect(copied!.n).toBeGreaterThan(0);
  expect(copied!.drafts).toBe(copied!.n);
  // One cycle_opened email per requestor, with the deadline and no figures.
  const mails = await db<{ to_email: string; payload: Record<string, string> }[]>`
    select to_email, payload from email_outbox where template = 'cycle_opened' and created_at > now() - interval '1 minute'`;
  expect(mails.length).toBeGreaterThan(0);
  expect(new Set(mails.map((m) => m.to_email)).size).toBe(mails.length);
  expect(mails.map((m) => m.to_email)).toContain("e2e.requestor@estrada.test");
  expect(mails.every((m) => m.payload.deadline?.includes("31 Desember 2027"))).toBe(true);
  expect(JSON.stringify(mails.map((m) => m.payload))).not.toMatch(/Rp|\d{6,}/);
  await db.end();

  // The requestor now works in 2028 with the copied lines as drafts.
  await as("requestor", page, "/rka");
  await expect(page.getByText("Draft usulan")).toBeVisible();
});

test("Finance changes the submission deadline of the new version, and it is audited", async ({ page }) => {
  const id = await newVersionId();
  await as("finance", page, "/rka/cycle");
  await page.locator(`#deadline-${id}`).fill("2027-11-30");
  await page.locator("form").filter({ has: page.locator(`#deadline-${id}`) }).getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByText(/Batas waktu: 30 November 2027 pukul 17\.00 WIB/)).toBeVisible();

  const db = sql();
  const [log] = await db<{ n: number }[]>`select count(*)::int n from audit_log where action = 'cycle.deadline' and subject_id = ${id}`;
  await db.end();
  expect(log!.n).toBe(1);
});

test("The reminders endpoint refuses callers without the secret", async ({ request }) => {
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
  expect((await request.get("/api/cron/reminders", { headers: { authorization: "Bearer salah" } })).status()).toBe(401);
});

test("Reminders go out once: the deadline 3 days away to requestors with drafts, a stale line to its holder, never twice", async ({ request }) => {
  const id = await newVersionId();
  const db = sql();
  // The copied lines are Draft; the deadline is 3 days away, and one SCM line has waited 10 days in Konsolidasi.
  await db`update budget_version set submission_deadline = now() + interval '3 days' where id = ${id}`;
  const [stale] = await db<{ id: string }[]>`select id from budget_line where version_id = ${id} and owner_unit = 'SCM' order by id limit 1`;
  await db`update budget_line set state = 'consolidation', updated_at = now() - interval '10 days' where id = ${stale!.id}`;
  const [before] = await db<{ n: number }[]>`select count(*)::int n from email_outbox where template in ('deadline_near', 'reminder_pending')`;

  const first = await request.get("/api/cron/reminders", { headers: CRON });
  expect(first.status()).toBe(200);
  const sent = (await first.json()) as { deadline: number; pending: number };
  expect(sent.deadline).toBeGreaterThanOrEqual(1);
  expect(sent.pending).toBeGreaterThanOrEqual(1);

  const mails = await db<{ template: string; to_email: string; payload: Record<string, string> }[]>`
    select template, to_email, payload from email_outbox where template in ('deadline_near', 'reminder_pending') order by created_at desc limit ${sent.deadline + sent.pending}`;
  expect(mails.find((m) => m.template === "deadline_near" && m.to_email === "e2e.requestor@estrada.test")?.payload.days).toBe("3");
  expect(mails.find((m) => m.template === "reminder_pending" && m.to_email === "e2e.head.scm@estrada.test")?.payload.unit).toContain("SCM");
  expect(JSON.stringify(mails.map((m) => m.payload))).not.toMatch(/Rp|\d{6,}/);

  // The same day's second run sends nothing more.
  const second = await request.get("/api/cron/reminders", { headers: CRON });
  expect(await second.json()).toEqual({ deadline: 0, pending: 0 });
  const [after] = await db<{ n: number }[]>`select count(*)::int n from email_outbox where template in ('deadline_near', 'reminder_pending')`;
  expect(after!.n).toBe(before!.n + sent.deadline + sent.pending);
  await db.end();
});
