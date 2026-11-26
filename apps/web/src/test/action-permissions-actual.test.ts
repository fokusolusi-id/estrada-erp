import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, rows, signInAs } from "./action-harness";
import { saveActuals } from "@/app/(app)/rka/actual/actions";

// Realisasi is typed in by Finance alone, within its entities, and one line it may not touch refuses the whole save.
// Called as every role against a database that refuses writes: a wrong seat gets the refusal, Finance gets to the write.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@estrada/db", async () => {
  const h = await import("./action-harness");
  return { db: h.fakeDb(), schema: h.fakeSchema() };
});
vi.mock("@/lib/session", async () => {
  const h = await import("./action-harness");
  return { requireUser: async () => ({ id: h.session.current.userId, name: "Uji", email: "uji@estrada.test", actor: h.session.current, realRole: h.session.current.role, positions: [] }) };
});
vi.mock("@/lib/workflow", async () => {
  const h = await import("./action-harness");
  return { loadOrg: async () => h.ORG };
});

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const line = (id: string, over: Record<string, unknown> = {}) => ({ id, requestorUnit: "SCM", ownerUnit: "SCM", entityCode: "ESTRADA", state: "locked", priorActual: null, ...over });
const REFUSAL = "Anda tidak berwenang mengisi realisasi untuk sebagian baris ini.";

beforeEach(() => {
  rows.current = [line(A)];
});

describe("saveActuals", () => {
  it.each(everyRole.map((r) => [r]))("as %s", async (role) => {
    signInAs(role);
    const out = await outcome(() => saveActuals([{ id: A, actual: "1000000" }]));
    if (role === "finance") expect(out).toEqual({ pastGate: "database transaction reached" });
    else expect(out).toEqual({ message: REFUSAL });
  });

  it("lets Finance fill a line at any stage, a locked one included", async () => {
    signInAs("finance");
    for (const state of ["draft", "consolidation", "finance_review", "locked"]) {
      rows.current = [line(A, { state })];
      expect(await outcome(() => saveActuals([{ id: A, actual: "5" }])), state).toEqual({ pastGate: "database transaction reached" });
    }
  });

  it("refuses Finance outside the line's entity", async () => {
    signInAs("finance", { entities: ["MATRIK"] });
    expect(await outcome(() => saveActuals([{ id: A, actual: "5" }]))).toEqual({ message: REFUSAL });
  });

  it("refuses the whole save when one line is out of reach or missing", async () => {
    signInAs("finance", { entities: ["ESTRADA"] });
    rows.current = [line(A), line(B, { entityCode: "MATRIK" })];
    expect(await outcome(() => saveActuals([{ id: A, actual: "5" }, { id: B, actual: "5" }]))).toEqual({ message: REFUSAL });
    rows.current = [line(A)];
    expect(await outcome(() => saveActuals([{ id: A, actual: "5" }, { id: B, actual: "5" }]))).toEqual({ message: REFUSAL });
  });

  it("refuses an empty, oversized or unreadable save before looking at any line", async () => {
    signInAs("finance");
    expect(await outcome(() => saveActuals([]))).toEqual({ message: "Nominal tidak valid." });
    expect(await outcome(() => saveActuals([{ id: A, actual: "abc" }]))).toEqual({ message: "Nominal tidak valid." });
    expect(await outcome(() => saveActuals([{ id: "bukan-uuid", actual: "5" }]))).toEqual({ message: "Nominal tidak valid." });
  });
});
