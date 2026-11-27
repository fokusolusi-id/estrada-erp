import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, rows, signInAs } from "./action-harness";
import { changePeriod } from "@/app/(app)/master/periode/actions";

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

beforeEach(() => {
  rows.current = [{ code: "ESTRADA" }];
});

describe("changePeriod", () => {
  it.each(everyRole.map((r) => [r]))("as %s outside FRM's division seat", async (role) => {
    signInAs(role, { orgUnit: "BCD" });
    const out = await outcome(() => changePeriod("ESTRADA", 2027, 1, "start_closing", ""));
    if (role === "finance") expect(out).toHaveProperty("pastGate");
    else expect(out).toEqual({ message: "Anda tidak berwenang mengubah periode ini." });
  });

  it("refuses a month that does not exist", async () => {
    signInAs("finance");
    expect(await outcome(() => changePeriod("ESTRADA", 2027, 13, "start_closing", ""))).toEqual({ message: "Permintaan tidak valid." });
  });
});
