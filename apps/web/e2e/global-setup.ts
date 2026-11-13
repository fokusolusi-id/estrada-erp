import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";
import { E2E_DATABASE_URL } from "../playwright.config";
import { E2E_PASSWORD, E2E_USERS } from "./users";

// Playwright loads this file as CommonJS (the web package is not "type": "module").
const repo = resolve(__dirname, "../../..");

/** Recreates estrada_e2e from migrations and the seed, then adds one account per approval role. */
export default async function globalSetup() {
  const admin = postgres(E2E_DATABASE_URL.replace(/\/estrada_e2e$/, "/postgres"), { max: 1, onnotice: () => {} });
  await admin.unsafe("DROP DATABASE IF EXISTS estrada_e2e WITH (FORCE)");
  await admin.unsafe("CREATE DATABASE estrada_e2e");
  await admin.end();

  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL };
  for (const script of ["migrate", "seed"]) {
    execFileSync("pnpm", ["--filter", "@estrada/db", script], { cwd: repo, env, stdio: "ignore" });
  }

  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  const password = await hashPassword(E2E_PASSWORD);
  for (const u of Object.values(E2E_USERS)) {
    const id = randomUUID();
    await sql`insert into "user" (id, email, name, email_verified) values (${id}, ${u.email}, ${u.name}, true)`;
    await sql`insert into account (id, user_id, account_id, provider_id, password) values (${randomUUID()}, ${id}, ${id}, 'credential', ${password})`;
    const [pos] = await sql<{ id: string }[]>`
      insert into position (org_unit_code, title, role, holder_user_id) values (${u.orgUnit}, ${u.title}, ${u.role}, ${id}) returning id`;
    for (const entity of u.entities) {
      await sql`insert into position_entity_scope (position_id, entity_code) values (${pos!.id}, ${entity})`;
    }
  }
  // BCD's segment target, so the Pipeline shows coverage whatever year the cycle runs for.
  for (const year of [2026, 2027, 2028]) await sql`insert into pipeline_target (fiscal_year, segment, target) values (${year}, 'Telco Business', 1000000000)`;
  await sql.end();
}
