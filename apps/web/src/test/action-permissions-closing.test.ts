import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, queued, rows, signInAs } from "./action-harness";
import { saveBalanceSheet } from "@/app/(app)/closing/actions";

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

const input = { entityCode: "ESTRADA", period: "2020-01", currentAssets: "40", totalAssets: "100", currentLiabilities: "20", totalLiabilities: "70", equity: "30" };
const REFUSAL = "Total neraca diisi Accounting & Tax.";

beforeEach(() => {
  rows.current = [];
  queued.current = [];
});

describe("saveBalanceSheet", () => {
  it.each(everyRole.map((r) => [r]))("as %s outside Accounting", async (role) => {
    signInAs(role);
    expect(await outcome(() => saveBalanceSheet(input))).toEqual({ message: REFUSAL });
  });
  it("is open to Accounting", async () => {
    signInAs("requestor", { orgUnit: "FRM-FIN-ATM" });
    expect(await outcome(() => saveBalanceSheet(input))).toHaveProperty("pastGate");
  });
  it("checks the figures first", async () => {
    signInAs("requestor", { orgUnit: "FRM-FIN-ATM" });
    expect(await outcome(() => saveBalanceSheet({ ...input, equity: "x" }))).toEqual({ message: "Nominal tidak terbaca." });
    expect(await outcome(() => saveBalanceSheet({ ...input, currentAssets: "101" }))).toEqual({ message: "Bagian lancar tidak boleh melebihi totalnya." });
    expect(await outcome(() => saveBalanceSheet({ ...input, period: "2999-01" }))).toEqual({ message: "Bulan belum berjalan." });
  });
});
