import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Migrations need a session connection; the app itself may use the transaction pooler through DATABASE_URL.
  dbCredentials: { url: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://estrada:estrada@localhost:5432/estrada" },
});
