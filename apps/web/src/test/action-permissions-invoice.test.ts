import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, rows, signInAs } from "./action-harness";
import { runInvoiceAction, saveInvoice } from "@/app/(app)/invoice/actions";

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
vi.mock("@/lib/invoice", () => ({
  billableTermins: async () => [],
  covers: () => true,
  tellInvoice: async () => {},
  applyInvoiceStep: async () => {
    throw new Error("step reached");
  },
}));

const form = { dealId: "11111111-1111-4111-8111-111111111111", terminNo: 1, description: "Termin 1", penalty: "", fine: "", pphType: "pph23" as const, pphRate: "2", invoicedOn: "2020-01-10", bankAccountId: "" };

beforeEach(() => {
  rows.current = [];
});

describe("saveInvoice", () => {
  it.each(everyRole.map((r) => [r]))("as %s outside Accounting", async (role) => {
    signInAs(role, { orgUnit: "FRM" });
    expect(await outcome(() => saveInvoice(null, form))).toEqual({ message: "Invoice dibuat oleh Accounting." });
  });

  it("refuses a termin that is not billable", async () => {
    signInAs("requestor", { orgUnit: "FRM-FIN-ATM" });
    expect(await outcome(() => saveInvoice(null, form))).toEqual({ message: "Termin ini sudah ditagih atau tidak dapat ditagih." });
  });
});

describe("runInvoiceAction", () => {
  const run = () => outcome(() => runInvoiceAction(form.dealId, "approve", ""));

  it("lets Accounting and the FRM Division Owner reach the rules, and nobody else", async () => {
    signInAs("requestor", { orgUnit: "FRM-FIN-ATM" });
    expect(await run()).toHaveProperty("pastGate");
    signInAs("division_owner", { orgUnit: "FRM" });
    expect(await run()).toHaveProperty("pastGate");
    signInAs("director", { orgUnit: "FRM" });
    expect(await run()).toEqual({ message: "Anda tidak berwenang atas langkah ini." });
  });
});
