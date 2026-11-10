import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export * as schema from "./schema/index";

const url = process.env.DATABASE_URL ?? "postgres://estrada:estrada@localhost:5432/estrada";

const globalForDb = globalThis as unknown as { __estradaSql?: ReturnType<typeof postgres> };
const sql = globalForDb.__estradaSql ?? postgres(url, { max: process.env.NODE_ENV === "production" ? 5 : 10, prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.__estradaSql = sql;

export const db = drizzle(sql, { schema, casing: "snake_case" });
export type Db = typeof db;
