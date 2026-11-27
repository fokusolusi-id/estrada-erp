import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, queued, rows, signInAs } from "./action-harness";
import { completeStage, saveAssurance, startTracking } from "@/app/(app)/tracker-telkom/actions";

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
vi.mock("@/lib/payment", () => ({ todayJakarta: () => "2027-01-10" }));
vi.mock("@/lib/storage", () => ({ putFile: async () => {} }));

const ID = "11111111-1111-4111-8111-111111111111";
const stage = (n: number) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ projectId: ID, stage: String(n), doneOn: "2027-01-10", notApplicable: "", note: "" })) f.set(k, v);
  return f;
};

beforeEach(() => {
  rows.current = [{ id: ID, entity: "ESTRADA", telkom: true, status: "Initiation" }];
  queued.current = [];
});

describe.each(everyRole.map((r) => [r]))("as %s outside the stage's unit", (role) => {
  it("cannot start, complete the contract stage or set JPMB", async () => {
    signInAs(role, { orgUnit: "SCM" });
    expect(await outcome(() => startTracking(ID, "2027-01-01"))).toEqual({ message: "Pelacakan dimulai Sales (BCD)." });
    expect(await outcome(() => completeStage(stage(3)))).toEqual({ message: "Tahap ini diisi unit penanggung jawabnya." });
    expect(await outcome(() => saveAssurance(ID, "legal", "done"))).toEqual({ message: "Status JPMB diisi tim delivery." });
  });
});

describe("the owners", () => {
  it("let Sales start and complete its stage, and delivery set JPMB", async () => {
    signInAs("requestor", { orgUnit: "BCD" });
    expect(await outcome(() => startTracking(ID, "2027-01-01"))).toHaveProperty("pastGate");
    expect(await outcome(() => completeStage(stage(1)))).toHaveProperty("pastGate");
    signInAs("requestor", { orgUnit: "PMO" });
    expect(await outcome(() => saveAssurance(ID, "legal", "done"))).toHaveProperty("pastGate");
  });
});
