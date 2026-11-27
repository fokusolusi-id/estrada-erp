import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, queued, rows, signInAs } from "./action-harness";
import { recordReceipt, reverseReceipt } from "@/app/(app)/invoice/receipt-actions";

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

const ID = "11111111-1111-4111-8111-111111111111";
const input = { invoiceId: ID, receivedOn: "2020-02-01", amount: "1.000", bankAccountId: ID, reference: "TRX-1", note: "" };

beforeEach(() => {
  rows.current = [];
  queued.current = [];
});

describe("recordReceipt", () => {
  it.each(everyRole.map((r) => [r]))("as %s", async (role) => {
    signInAs(role);
    const out = await outcome(() => recordReceipt(input));
    if (role === "cash_manager") expect(out).toHaveProperty("pastGate");
    else expect(out).toEqual({ message: "Penerimaan dicatat oleh Cash Management." });
  });

  it("refuses an amount it cannot read", async () => {
    signInAs("cash_manager");
    expect(await outcome(() => recordReceipt({ ...input, amount: "seribu" }))).toEqual({ message: "Nominal tidak terbaca." });
  });
});

describe("reverseReceipt", () => {
  it("is Cash Management's, with a reason", async () => {
    signInAs("finance");
    expect(await outcome(() => reverseReceipt(ID, "salah invoice"))).toEqual({ message: "Penerimaan dicatat oleh Cash Management." });
    signInAs("cash_manager");
    expect(await outcome(() => reverseReceipt(ID, " "))).toEqual({ message: "Tulis alasan pembatalan." });
  });
});
