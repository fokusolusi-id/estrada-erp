/**
 * Local test data for the Implementasi module: one account per job the module needs, and one Closed Won deal to
 * open a project from. Safe to run again; it skips what exists. Never run against production.
 *
 *   pnpm --filter @estrada/db exec tsx ../../apps/web/scripts/seed-implementasi.ts
 *
 * Accounts share the e2e test password (apps/web/e2e/users.ts).
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";
import { E2E_PASSWORD } from "../e2e/users";

const url = process.env.DATABASE_URL ?? "postgres://estrada:estrada@localhost:5432/estrada";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("seed-implementasi only runs against a local database.");

const USERS = [
  { email: "impl.head.pmo@estrada.test", name: "Hadi (Head PMO)", title: "Head of PMO", orgUnit: "PMO", role: "default_owner" },
  { email: "impl.pm@estrada.test", name: "Rina (Project Manager)", title: "Staff Project Manager", orgUnit: "PMO-PM", role: "requestor" },
  { email: "impl.dc@estrada.test", name: "Dewi (Delivery Control)", title: "Staff Delivery Control", orgUnit: "PMO-DCA", role: "requestor" },
  { email: "impl.pa@estrada.test", name: "Putra (Project Admin)", title: "Staff Project Admin", orgUnit: "PMO-DCA", role: "requestor" },
  { email: "impl.bcd@estrada.test", name: "Andi (BCD / Assurance)", title: "Sales Ops", orgUnit: "BCD", role: "requestor" },
  { email: "impl.head.mso@estrada.test", name: "Maya (Head MSO)", title: "Head of MSO", orgUnit: "MSO", role: "default_owner" },
  { email: "impl.eos@estrada.test", name: "Eko (Operational EOS)", title: "Staff Operational EOS", orgUnit: "MSO-EOS", role: "requestor" },
  { email: "impl.head.iso@estrada.test", name: "Indra (Head ISO)", title: "Head of ISO", orgUnit: "ISO", role: "default_owner" },
  { email: "impl.iso.ph@estrada.test", name: "Sari (Problem Handling)", title: "Staff Problem Handling", orgUnit: "ISO-PH", role: "requestor" },
];

const DEAL = { project: "[UJI] Sewa CPE SBST Online Korlantas", customer: "Telkom", endCustomer: "Korlantas", value: "577320000" };

async function main() {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const password = await hashPassword(E2E_PASSWORD);
  for (const u of USERS) {
    const [existing] = await sql`select id from "user" where email = ${u.email}`;
    if (existing) continue;
    const id = randomUUID();
    await sql`insert into "user" (id, email, name, email_verified) values (${id}, ${u.email}, ${u.name}, true)`;
    await sql`insert into account (id, user_id, account_id, provider_id, password) values (${randomUUID()}, ${id}, ${id}, 'credential', ${password})`;
    const [pos] = await sql<{ id: string }[]>`
      insert into position (org_unit_code, title, role, holder_user_id) values (${u.orgUnit}, ${u.title}, ${u.role}, ${id}) returning id`;
    await sql`insert into position_entity_scope (position_id, entity_code) values (${pos!.id}, '*')`;
    console.log("user", u.email);
  }

  const [year] = await sql<{ fiscal_year: number }[]>`select fiscal_year from budget_version order by (status = 'open') desc, fiscal_year desc limit 1`;
  const [coa] = await sql<{ code: string }[]>`select code from coa_account where category = 'Revenue' and active order by code limit 1`;
  const [deal] = await sql`select id from pipeline_deal where project = ${DEAL.project}`;
  if (year && coa && !deal) {
    const [row] = await sql<{ id: string }[]>`
      insert into pipeline_deal (fiscal_year, entity_code, customer, end_customer, segment, project, coa_code, value, status, probability, type, start_month, end_month, source_ref)
      values (${year.fiscal_year}, 'ESTRADA', ${DEAL.customer}, ${DEAL.endCustomer}, 'Telco Business', ${DEAL.project}, ${coa.code}, ${DEAL.value}, 'CW', 100, 'renewal', 1, 12, 'seed-implementasi')
      returning id`;
    await sql`insert into billing_termin (deal_id, no, description, amount, planned_on) values (${row!.id}, 1, 'Termin tunggal', ${DEAL.value}, ${`${year.fiscal_year}-06-30`})`;
    console.log("deal", DEAL.project);
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
