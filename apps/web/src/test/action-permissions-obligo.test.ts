import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, queued, rows, signInAs } from "./action-harness";
import { issueDrawing, recordFacilityPayment, rejectDrawing, releaseGuarantee, requestDrawing, reverseFacilityPayment, saveFacility } from "@/app/(app)/obligo/actions";

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
vi.mock("@/lib/obligo", () => ({ coversEntity: () => true, cashManagers: async () => [], notifyObligo: async () => {} }));
vi.mock("@/lib/storage", () => ({ putFile: async () => {} }));

const ID = "11111111-1111-4111-8111-111111111111";
const facility = { id: "", bankName: "Mandiri", name: "M71", type: "kmk" as const, entityCode: "ESTRADA", plafon: "1.000", expiresOn: "", contractNo: "", interestDay: "15", escrowAccount: "", active: true };
const payment = { facilityId: ID, drawingId: "", entityCode: "ESTRADA", paidOn: "2020-01-15", principal: "", interest: "1.000", reference: "TRX" };
const drawing = () => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ facilityId: ID, entityCode: "ESTRADA", kind: "loan", bgType: "", projectId: "", amount: "10", underlying: "KL 1" })) f.set(k, v);
  return f;
};

beforeEach(() => {
  rows.current = [];
  queued.current = [];
});

const MANAGE = "Fasilitas bank dikelola Cash Management.";
describe.each([
  ["saveFacility", () => saveFacility(facility)],
  ["issueDrawing", () => issueDrawing({ id: ID, reference: "BG-1", issuedOn: "2020-01-01", dueOn: "2020-06-01" })],
  ["rejectDrawing", () => rejectDrawing(ID, "dokumen kurang")],
  ["releaseGuarantee", () => releaseGuarantee(ID)],
  ["recordFacilityPayment", () => recordFacilityPayment(payment)],
  ["reverseFacilityPayment", () => reverseFacilityPayment(ID, "salah catat")],
])("%s", (_name, call) => {
  it.each(everyRole.map((r) => [r]))("as %s", async (role) => {
    signInAs(role);
    const out = await outcome(call);
    if (role === "cash_manager") expect(out).toHaveProperty("pastGate");
    else expect(out).toEqual({ message: MANAGE });
  });
});

describe("requestDrawing", () => {
  it.each(everyRole.map((r) => [r]))("as %s outside PMO", async (role) => {
    signInAs(role);
    const out = await outcome(() => requestDrawing(drawing()));
    if (role === "finance") expect(out).toHaveProperty("pastGate");
    else expect(out).toEqual({ message: "Permintaan obligo diajukan PMO atau Finance." });
  });
  it("is open to PMO staff", async () => {
    signInAs("requestor", { orgUnit: "PMO" });
    expect(await outcome(() => requestDrawing(drawing()))).toHaveProperty("pastGate");
  });
});

describe("amounts", () => {
  it("must be readable", async () => {
    signInAs("cash_manager");
    expect(await outcome(() => saveFacility({ ...facility, plafon: "banyak" }))).toEqual({ message: "Isi plafon lebih dari 0." });
    expect(await outcome(() => recordFacilityPayment({ ...payment, interest: "x" }))).toEqual({ message: "Nominal tidak terbaca." });
  });
});
