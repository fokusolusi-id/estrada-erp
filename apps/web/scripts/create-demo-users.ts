/**
 * Dev only: one user per approval role on the seeded org, so the RKA flow can be walked end to end.
 * Passwords are generated and written to .dev-users.txt at the repo root (never printed).
 *   pnpm --filter web create-demo-users
 */
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db, schema } from "@estrada/db";
import type { Role } from "@estrada/domain";

const DEMO: { email: string; name: string; title: string; orgUnit: string; role: Role; entities: string[] }[] = [
  { email: "requestor.scm@estrada.local", name: "Rina (SCM)", title: "Staff SCM", orgUnit: "SCM", role: "requestor", entities: ["ESTRADA"] },
  { email: "head.scm@estrada.local", name: "Bayu (Head SCM)", title: "Head of SCM", orgUnit: "SCM", role: "default_owner", entities: ["ESTRADA"] },
  { email: "head.pdms@estrada.local", name: "Sari (Head PDMS)", title: "Head of PDMS", orgUnit: "PDMS", role: "division_owner", entities: ["ESTRADA"] },
  { email: "finance@estrada.local", name: "Dewi (Finance)", title: "Business Finance", orgUnit: "FRM", role: "finance", entities: ["*"] },
  { email: "direktur@estrada.local", name: "Direktur", title: "Direktur", orgUnit: "DIR", role: "director", entities: ["*"] },
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo users are for development only");
  const lines: string[] = [];
  for (const d of DEMO) {
    const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, d.email));
    if (existing) continue;
    const password = randomBytes(9).toString("base64url");
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(schema.user).values({ id, email: d.email, name: d.name, emailVerified: true });
      await tx.insert(schema.account).values({ id: randomUUID(), userId: id, accountId: id, providerId: "credential", password: await hashPassword(password) });
      const [pos] = await tx
        .insert(schema.position)
        .values({ orgUnitCode: d.orgUnit, title: d.title, role: d.role, holderUserId: id })
        .returning({ id: schema.position.id });
      await tx.insert(schema.positionEntityScope).values(d.entities.map((entityCode) => ({ positionId: pos!.id, entityCode })));
    });
    lines.push(`${d.role}\t${d.email}\t${password}`);
  }
  if (lines.length) writeFileSync(resolve(import.meta.dirname, "../../../.dev-users.txt"), lines.join("\n") + "\n", { mode: 0o600, flag: "a" });
  console.log(`${lines.length} demo users created; credentials in .dev-users.txt`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
