import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, queued, rows, signInAs } from "./action-harness";
import { recordCashEntry, reverseCashEntry } from "@/app/(app)/cash/mingguan/actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@estrada/db", async () => {
  const h = await import("./action-harness");
  return { db: h.fakeDb(), schema: h.fakeSchema() };
});
vi.mock("@/lib/session", async () => {
  const h = await import("./action-harness");
  return { requireUser: async () => ({ id: h.session.current.userId, actor: h.session.current }) };
});
vi.mock("@/lib/workflow", async () => {
  const h = await import("./action-harness");
  class WorkflowError extends Error {}
  return { loadOrg: async () => h.ORG, WorkflowError };
});
vi.mock("@/lib/period", () => ({ assertOpenPeriod: async () => null }));

const input = { entityCode: "ESTRADA", onDate: "2020-02-01", kind: "other_in" as const, amount: "1.000", coaCode: "", description: "Setoran pemilik" };
const REFUSAL = "Transaksi kas dicatat oleh Cash Management.";

beforeEach(() => {
  rows.current = [];
  queued.current = [];
});

describe("recordCashEntry", () => {
  it.each(everyRole.map((r) => [r]))("as %s", async (role) => {
    signInAs(role);
    rows.current = [{ code: "ESTRADA", active: true }];
    const out = await outcome(() => recordCashEntry(input));
    if (role === "cash_manager") expect(out).toHaveProperty("pastGate");
    else expect(out).toEqual({ message: REFUSAL });
  });

  it("refuses an amount it cannot read, a future date and a cost without an account", async () => {
    signInAs("cash_manager");
    expect(await outcome(() => recordCashEntry({ ...input, amount: "seribu" }))).toEqual({ message: "Nominal tidak terbaca." });
    expect(await outcome(() => recordCashEntry({ ...input, onDate: "2999-01-01" }))).toEqual({ message: "Tanggal tidak boleh setelah hari ini." });
    expect(await outcome(() => recordCashEntry({ ...input, kind: "cost" }))).toEqual({ message: "Pilih akun COA untuk biaya." });
  });

  it("refuses a company outside the person's scope", async () => {
    signInAs("cash_manager", { entities: ["MATRIK"] });
    expect(await outcome(() => recordCashEntry(input))).toEqual({ message: "Entitas tidak dikenal." });
  });
});

describe("reverseCashEntry", () => {
  it("is Cash Management's, with a reason", async () => {
    const ID = "11111111-1111-4111-8111-111111111111";
    signInAs("finance");
    expect(await outcome(() => reverseCashEntry(ID, "salah catat"))).toEqual({ message: REFUSAL });
    signInAs("cash_manager");
    expect(await outcome(() => reverseCashEntry(ID, " "))).toEqual({ message: "Tulis alasan pembatalan." });
  });
});
