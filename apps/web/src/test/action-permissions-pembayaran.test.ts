import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor, Role } from "@estrada/domain";
import { actorOf, outcome, rows, session } from "./action-harness";
import { removeDocument, runPaymentAction, savePayment, uploadDocument } from "@/app/(app)/pembayaran/actions";

// A payment request moves only by the people its state names, and only its requester edits or attaches to it. Each
// action is called by each kind of seat against one request row and a database that refuses writes: a wrong seat must
// get the action's own refusal, and the right one must get past it.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/email/outbox", () => ({ enqueueEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/fiscal-year", () => ({ activeYear: async () => 2027 }));
vi.mock("@estrada/db", async () => {
  const h = await import("./action-harness");
  return { db: h.fakeDb(), schema: h.fakeSchema() };
});
vi.mock("@/lib/session", async () => {
  const h = await import("./action-harness");
  return { requireUser: async () => ({ id: h.session.current.userId, name: "Uji", email: "uji@estrada.test", actor: h.session.current, realRole: h.session.current.role, positions: [], activePositionId: null }) };
});
vi.mock("@/lib/workflow", async () => {
  const h = await import("./action-harness");
  class WorkflowError extends Error {}
  return { loadOrg: async () => h.ORG, WorkflowError };
});
// Keep the real asLike; a transition that is attempted is a transition that got past the check.
vi.mock("@/lib/payment", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/payment")>()),
  applyPaymentTransition: async () => {
    throw new Error("transition reached");
  },
  storeDocument: async () => {
    throw new Error("store reached");
  },
  lineOptions: async () => ({ lines: [] }),
}));

const ACTORS: Record<string, { role: Role; over: Partial<Actor> }> = {
  requester: { role: "requestor", over: { orgUnit: "SCM", userId: "req-1", entities: ["ESTRADA"] } },
  otherStaff: { role: "requestor", over: { orgUnit: "SCM", userId: "other-1", entities: ["ESTRADA"] } },
  head: { role: "default_owner", over: { orgUnit: "SCM", userId: "head-1", entities: ["ESTRADA"] } },
  bfp: { role: "bfp", over: { userId: "bfp-1" } },
  cashManager: { role: "cash_manager", over: { userId: "cash-1" } },
  finance: { role: "finance", over: { userId: "fin-1" } },
  director: { role: "director", over: { userId: "dir-1" } },
  auditor: { role: "auditor", over: { userId: "aud-1" } },
  admin: { role: "admin", over: { userId: "adm-1" } },
};
const sit = (who: string) => {
  const { role, over } = ACTORS[who]!;
  session.current = actorOf(role, over);
};

const ID = "11111111-1111-4111-8111-111111111111";
const request = (state: string) => ({ id: ID, state, requesterId: "req-1", requesterUnit: "SCM", requesterRole: "requestor", entityCode: "ESTRADA", number: null });
const form = (fields: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const proof = () => new File(["bukti"], "bukti.pdf", { type: "application/pdf" });
const NOT_ALLOWED = "Anda tidak berwenang atas permintaan ini sekarang.";

beforeEach(() => {
  rows.current = [];
});

describe("savePayment: the partner must be in Master Mitra", () => {
  it("refuses an unknown partner before any write", async () => {
    sit("requester");
    const values = { kind: "payment" as const, entity: "ESTRADA", project: "", budgetLineId: "", partnerId: "Mitra-999", description: "", payeeName: "", payeeBank: "", payeeAccount: "", dueOn: "", gross: "", ppn: "", pph: "" };
    expect(await outcome(() => savePayment(null, values))).toEqual({ message: "Mitra tidak ada di Master Mitra." });
  });
});

describe("runPaymentAction: each step belongs to the seat the state names", () => {
  // `allowed` lists who may take the step; everyone else, including the requester approving their own request, is refused.
  const STEPS: { state: string; action: string; allowed: string[]; extra?: () => Record<string, string | File> }[] = [
    { state: "draft", action: "submit", allowed: ["requester"] },
    { state: "returned", action: "submit", allowed: ["requester"] },
    { state: "submitted", action: "approve", allowed: ["head", "director"] },
    { state: "submitted", action: "return", allowed: ["head", "director"] },
    { state: "under_review", action: "verify", allowed: ["bfp"] },
    { state: "under_review", action: "return", allowed: ["bfp"] },
    { state: "pending_approval", action: "approve", allowed: ["director"] },
    { state: "approved", action: "schedule", allowed: ["cashManager"] },
    { state: "scheduled", action: "pay", allowed: ["cashManager"], extra: () => ({ proof: proof() }) },
    { state: "paid", action: "approve", allowed: [] },
  ];
  for (const s of STEPS) {
    describe(`${s.state} → ${s.action}`, () => {
      it.each(Object.keys(ACTORS).map((a) => [a]))("as %s", async (who) => {
        sit(who);
        rows.current = [request(s.state)];
        const out = await outcome(() => runPaymentAction(form({ requestId: ID, action: s.action, ...s.extra?.() })));
        if (s.allowed.includes(who)) expect(out).not.toEqual({ message: NOT_ALLOWED });
        else expect(out).toEqual({ message: NOT_ALLOWED });
      });
    });
  }

  it("refuses a request that does not exist", async () => {
    sit("requester");
    expect(await outcome(() => runPaymentAction(form({ requestId: ID, action: "submit" })))).toEqual({ message: NOT_ALLOWED });
  });

  it("refuses a cash manager outside the request's entity", async () => {
    session.current = actorOf("cash_manager", { entities: ["MATRIK"] });
    rows.current = [request("approved")];
    expect(await outcome(() => runPaymentAction(form({ requestId: ID, action: "schedule" })))).toEqual({ message: NOT_ALLOWED });
  });
});

describe("savePayment", () => {
  const values = { kind: "payment", entity: "ESTRADA", project: "", budgetLineId: "", partnerId: "", description: "Uji", payeeName: "", payeeBank: "", payeeAccount: "", dueOn: "", gross: "1000000", ppn: "0", pph: "0" } as never;

  it.each(Object.keys(ACTORS).map((a) => [a]))("as %s: Admin is refused, everyone else gets past the check", async (who) => {
    sit(who);
    const out = await outcome(() => savePayment(null, values));
    if (who === "admin") expect(out).toEqual({ message: "Admin tidak membuat Permintaan Pembayaran." });
    else expect(out).not.toEqual({ message: "Admin tidak membuat Permintaan Pembayaran." });
  });

  it("refuses an entity outside the seat's scope", async () => {
    session.current = actorOf("requestor", { entities: ["MATRIK"] });
    expect(await outcome(() => savePayment(null, values))).toEqual({ message: "Entitas di luar cakupan posisi Anda." });
  });

  it.each(Object.keys(ACTORS).map((a) => [a]))("as %s: edits only a request they made", async (who) => {
    sit(who);
    rows.current = [request("draft")];
    const out = await outcome(() => savePayment(ID, values));
    if (who === "requester" || who === "admin") {
      // The requester gets past; Admin never reaches the lookup.
      if (who === "requester") expect(out).not.toEqual({ message: "Permintaan tidak ditemukan." });
    } else expect(out).toEqual({ message: "Permintaan tidak ditemukan." });
  });
});

describe("attachments belong to the requester", () => {
  const pdf = () => new File(["isi"], "invoice.pdf", { type: "application/pdf" });

  it.each(Object.keys(ACTORS).map((a) => [a]))("uploadDocument as %s", async (who) => {
    sit(who);
    rows.current = [request("draft")];
    const out = await outcome(() => uploadDocument(form({ requestId: ID, kind: "invoice", file: pdf() })));
    if (who === "requester") expect(out).not.toEqual({ message: "Permintaan tidak ditemukan." });
    else expect(out).toEqual({ message: "Permintaan tidak ditemukan." });
  });

  it.each(Object.keys(ACTORS).map((a) => [a]))("removeDocument as %s", async (who) => {
    sit(who);
    rows.current = [{ doc: { id: ID, kind: "invoice", fileName: "invoice.pdf", storagePath: "p" }, request: request("draft") }];
    const out = await outcome(() => removeDocument(ID));
    if (who === "requester") expect(out).not.toEqual({ message: "Dokumen tidak ditemukan." });
    else expect(out).toEqual({ message: "Dokumen tidak ditemukan." });
  });

  it("will not remove the bank proof, even for the requester", async () => {
    sit("requester");
    rows.current = [{ doc: { id: ID, kind: "proof", fileName: "bukti.pdf", storagePath: "p" }, request: request("draft") }];
    expect(await outcome(() => removeDocument(ID))).toEqual({ message: "Dokumen tidak ditemukan." });
  });

  it("will not attach or remove once the request is sent", async () => {
    sit("requester");
    rows.current = [request("submitted")];
    expect(await outcome(() => uploadDocument(form({ requestId: ID, kind: "invoice", file: pdf() })))).toEqual({ message: "Dokumen hanya bisa ditambah selama Draft atau Returned." });
    rows.current = [{ doc: { id: ID, kind: "invoice", fileName: "i.pdf", storagePath: "p" }, request: request("submitted") }];
    expect(await outcome(() => removeDocument(ID))).toEqual({ message: "Dokumen tidak bisa dihapus setelah dikirim." });
  });
});
