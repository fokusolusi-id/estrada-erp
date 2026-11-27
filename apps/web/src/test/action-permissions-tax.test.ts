import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, queued, rows, signInAs } from "./action-harness";
import { savePph21, saveTaxDocument } from "@/app/(app)/pajak/actions";

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

const document = { kind: "faktur_out" as const, sourceId: "11111111-1111-4111-8111-111111111111", number: "010.000-20.00000001", date: "2020-01-10", status: "recorded" as const };
const pph = { entityCode: "ESTRADA", period: "2020-01", amount: "1.000" };
const REFUSAL = "Data pajak dicatat oleh Accounting & Tax.";

beforeEach(() => {
  rows.current = [];
  queued.current = [];
});

describe.each([
  ["saveTaxDocument", () => saveTaxDocument(document)],
  ["savePph21", () => savePph21(pph)],
])("%s", (_name, call) => {
  it.each(everyRole.map((r) => [r]))("as %s outside Accounting", async (role) => {
    signInAs(role);
    expect(await outcome(call)).toEqual({ message: REFUSAL });
  });
  it("is open to Accounting", async () => {
    signInAs("requestor", { orgUnit: "FRM-FIN-ATM" });
    expect(await outcome(call)).toHaveProperty("pastGate");
  });
});

describe("input", () => {
  it("is checked before anything is written", async () => {
    signInAs("requestor", { orgUnit: "FRM-FIN-ATM" });
    expect(await outcome(() => saveTaxDocument({ ...document, date: "2999-01-01" }))).toEqual({ message: "Tanggal dokumen tidak boleh setelah hari ini." });
    expect(await outcome(() => savePph21({ ...pph, amount: "x" }))).toEqual({ message: "Nominal tidak terbaca." });
    expect(await outcome(() => savePph21({ ...pph, period: "2999-01" }))).toEqual({ message: "Bulan belum berjalan." });
  });
});
