/**
 * Creates the first Admin so someone can log in and invite everyone else.
 *   pnpm --filter web create-admin -- admin@estrada.co.id "Nama Admin" 'password-min-10'
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db, schema } from "@estrada/db";

async function main() {
  const [email, name, password] = process.argv.slice(2).filter((a) => a !== "--");
  if (!email || !name || !password || password.length < 10) {
    console.error('Usage: create-admin <email> "<name>" <password, min 10 chars>');
    process.exit(1);
  }

  const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, email.toLowerCase()));
  if (existing) {
    console.error(`User ${email} already exists`);
    process.exit(1);
  }

  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.user).values({ id, email: email.toLowerCase(), name, emailVerified: true });
    await tx.insert(schema.account).values({
      id: randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: await hashPassword(password),
    });
    const [pos] = await tx
      .insert(schema.position)
      .values({ orgUnitCode: "FRM", title: "System Admin", role: "admin", holderUserId: id })
      .returning({ id: schema.position.id });
    await tx.insert(schema.positionEntityScope).values({ positionId: pos!.id, entityCode: "*" });
  });

  console.log(`Admin ${email} created`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
