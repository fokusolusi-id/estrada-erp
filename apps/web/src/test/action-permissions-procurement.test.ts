import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, queued, rows, signInAs } from "./action-harness";
import { createPurchaseRequest, decidePurchaseRequest, recordReceiptOfGoods, savePurchaseOrder } from "@/app/(app)/pengadaan/actions";

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
vi.mock("@/lib/payment", () => ({ lineOptions: async () => ({ lines: [] }), loadSeats: async () => [], todayJakarta: () => "2027-01-01" }));

const ID = "11111111-1111-4111-8111-111111111111";
const request = { projectId: ID, budgetLineId: ID, description: "Kamera CCTV", estimate: "1.000" };
const order = { id: null, requestId: ID, partnerId: "Mitra-001", productId: "", description: "Kamera", qty: "1", unitPrice: "100", orderedOn: "2027-01-01" };
const receipt = { orderId: ID, receivedOn: "2027-01-01", amount: "100", bastNumber: "BAST-1", note: "" };

beforeEach(() => {
  rows.current = [{ entity: "ESTRADA", entityCode: "ESTRADA", pm: null, status: "Initiation", year: 2027 }];
  queued.current = [];
});

describe.each(everyRole.map((r) => [r]))("as %s outside PMO and SCM", (role) => {
  it("cannot request, order or receive", async () => {
    signInAs(role, { orgUnit: "BCD" });
    expect(await outcome(() => createPurchaseRequest(request))).toEqual({ message: "Permintaan pengadaan diajukan PM proyek atau PMO." });
    expect(await outcome(() => savePurchaseOrder(order))).toEqual({ message: "PO dibuat SCM untuk entitasnya." });
    expect(await outcome(() => recordReceiptOfGoods(receipt))).toEqual({ message: "Penerimaan dicatat PM proyek atau PMO." });
  });
  it("checks a budget only as BFP or Finance", async () => {
    signInAs(role);
    const out = await outcome(() => decidePurchaseRequest(ID, true, ""));
    if (role === "bfp" || role === "finance") expect(out).toHaveProperty("pastGate");
    else expect(out).toEqual({ message: "Cek budget dilakukan BFP atau Finance." });
  });
});

describe("the owners", () => {
  it("let PMO request and SCM order", async () => {
    signInAs("requestor", { orgUnit: "PMO" });
    expect(await outcome(() => createPurchaseRequest(request))).toEqual({ message: "Baris RKA tidak tersedia untuk Anda pada entitas proyek ini." });
    signInAs("requestor", { orgUnit: "SCM" });
    expect(await outcome(() => savePurchaseOrder(order))).toHaveProperty("pastGate");
  });
});
