import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, rows, signInAs } from "./action-harness";
import { saveAdjustment } from "@/app/(app)/rka/monitor/actions";

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
  const { OrgTree } = await import("@estrada/domain");
  class WorkflowError extends Error {}
  return { loadOrg: async () => new OrgTree([{ code: "FRM", parent: null }, { code: "FRM-FIN-ATM", parent: "FRM" }]), WorkflowError };
});
vi.mock("@/lib/rka", () => ({ reportVersions: async () => [{ id: "v1", fiscalYear: 2020, status: "open" }] }));
vi.mock("@/lib/period", () => ({ assertOpenPeriod: async () => null }));

const input = { entity: "ESTRADA", unit: "SCM", coaCode: "6241", date: "2020-03-10", kind: "accrual" as const, amount: "50000", reason: "Akrual tagihan listrik Februari" };

beforeEach(() => {
  rows.current = [{ code: "x" }];
});

describe("saveAdjustment", () => {
  it.each(everyRole.map((r) => [r]))("as %s in Accounting", async (role) => {
    signInAs(role, { orgUnit: "FRM-FIN-ATM" });
    const out = await outcome(() => saveAdjustment(input));
    if (["requestor", "default_owner", "division_owner"].includes(role)) expect(out).toHaveProperty("pastGate");
    else expect(out).toEqual({ message: "Penyesuaian dicatat oleh Accounting." });
  });

  it("refuses a date outside the budget year", async () => {
    signInAs("requestor", { orgUnit: "FRM-FIN-ATM" });
    expect(await outcome(() => saveAdjustment({ ...input, date: "2019-12-31" }))).toEqual({ message: "Tanggal di luar tahun anggaran 2020." });
  });

  it("refuses a future date before any write", async () => {
    signInAs("requestor", { orgUnit: "FRM-FIN-ATM" });
    expect(await outcome(() => saveAdjustment({ ...input, date: "2999-01-01" }))).toEqual({ message: "Tanggal tidak boleh sesudah hari ini." });
  });
});
