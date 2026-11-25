import { beforeEach, describe, expect, it, vi } from "vitest";
import { actorOf, everyRole, outcome, rows, session, signInAs } from "./action-harness";
import { deleteLine, moveLines, saveHeadcount, saveLine } from "@/app/(app)/rka/actions";

// RKA lines are written by the Requestor who owns them, and every approval step is decided by the workflow. Each action
// is called as every role against a database that refuses writes: a wrong seat gets the action's own refusal, and the
// right one gets past it.

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
vi.mock("@/lib/rka", () => ({ openVersion: async () => ({ id: "v1", fiscalYear: 2027 }) }));
const applyTransition = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/workflow", async () => {
  const h = await import("./action-harness");
  class WorkflowError extends Error {}
  return { loadOrg: async () => h.ORG, WorkflowError, applyTransition: (...a: unknown[]) => applyTransition(...a) };
});

const A = "11111111-1111-4111-8111-111111111111";
const months = Array.from({ length: 12 }, () => "1000000");
const newLine = { coaCode: "6241", entityCode: "ESTRADA", ownerUnit: "SCM", item: "Internet", basis: "Kontrak", months };
const draft = (over: Record<string, unknown> = {}) => ({ id: A, state: "draft", requestorUnit: "SCM", ownerUnit: "SCM", entityCode: "ESTRADA", ...over });

beforeEach(() => {
  rows.current = [];
  applyTransition.mockClear();
});

describe("saveLine: only a Requestor adds a line", () => {
  it.each(everyRole.map((r) => [r]))("as %s", async (role) => {
    signInAs(role);
    const out = await outcome(() => saveLine(newLine));
    if (role === "requestor") expect(out).not.toEqual({ message: "Hanya Requestor yang dapat menambah baris." });
    else expect(out).toEqual({ message: "Hanya Requestor yang dapat menambah baris." });
  });

  it("refuses a Requestor adding a line for an entity outside their scope", async () => {
    signInAs("requestor", { entities: ["MATRIK"] });
    expect(await outcome(() => saveLine(newLine))).toEqual({ message: "Anda tidak berwenang mengubah baris ini." });
  });

  it("refuses a line that a headcount plan owns, for everyone", async () => {
    rows.current = [{ lineId: A }];
    for (const role of everyRole) {
      signInAs(role);
      expect(await outcome(() => saveLine({ ...newLine, id: A })), role).toEqual({ message: "Baris ini diatur dari Rencana headcount." });
    }
  });
});

describe("saveHeadcount: a position becomes a line, so the same rule applies", () => {
  const position = { position: "Staff SCM", coaCode: "6221", entityCode: "ESTRADA", count: 2, startMonth: 3, costPerHead: "8000000" };

  it.each(everyRole.map((r) => [r]))("as %s", async (role) => {
    signInAs(role);
    rows.current = [{ defaultOwnerUnit: "SCM" }];
    const out = await outcome(() => saveHeadcount(position));
    if (role === "requestor") expect(out).not.toEqual({ message: "Hanya Requestor yang dapat menambah baris." });
    else expect(out).toEqual({ message: "Hanya Requestor yang dapat menambah baris." });
  });
});

describe("deleteLine: a Requestor deletes their own draft and nothing else", () => {
  const REFUSAL = "Anda tidak berwenang menghapus baris ini.";

  it.each(everyRole.map((r) => [r]))("as %s", async (role) => {
    signInAs(role);
    rows.current = [draft()];
    const out = await outcome(() => deleteLine(A));
    if (role === "requestor") expect(out).toEqual({ pastGate: "database transaction reached" });
    else expect(out).toEqual({ message: REFUSAL });
  });

  it("refuses a Requestor of another unit, or outside the line's entity", async () => {
    rows.current = [draft()];
    signInAs("requestor", { orgUnit: "FRM" });
    expect(await outcome(() => deleteLine(A))).toEqual({ message: REFUSAL });
    signInAs("requestor", { entities: ["MATRIK"] });
    expect(await outcome(() => deleteLine(A))).toEqual({ message: REFUSAL });
  });

  it("deletes nothing that has left Draft, or that does not exist", async () => {
    signInAs("requestor");
    for (const state of ["consolidation", "division_approval", "finance_review", "awaiting_lock", "locked"]) {
      rows.current = [draft({ state })];
      expect(await outcome(() => deleteLine(A)), state).toEqual({ message: "Hanya baris draft yang dapat dihapus." });
    }
    rows.current = [];
    expect(await outcome(() => deleteLine(A))).toEqual({ message: "Hanya baris draft yang dapat dihapus." });
  });
});

describe("moveLines: every step is decided by the workflow, as the signed-in seat", () => {
  it("hands the caller's own seat to the workflow, never one the request names", async () => {
    session.current = actorOf("default_owner", { userId: "owner-1" });
    await moveLines({ ids: [A], action: "consolidate" });
    expect(applyTransition).toHaveBeenCalledTimes(1);
    expect(applyTransition.mock.calls[0]![0]).toMatchObject({ userId: "owner-1", role: "default_owner" });
  });

  it("refuses an action that is not an approval step, and an empty selection, before the workflow", async () => {
    signInAs("admin");
    expect((await moveLines({ ids: [A], action: "delete" as never })).ok).toBe(false);
    expect((await moveLines({ ids: [], action: "submit" })).ok).toBe(false);
    expect((await moveLines({ ids: ["bukan-uuid"], action: "submit" })).ok).toBe(false);
    expect(applyTransition).not.toHaveBeenCalled();
  });

  it("reports a workflow refusal as the action's own message", async () => {
    const { WorkflowError } = await import("@/lib/workflow");
    applyTransition.mockRejectedValueOnce(new WorkflowError("Baris tidak dapat diproses oleh posisi Anda."));
    signInAs("auditor");
    expect(await moveLines({ ids: [A], action: "approve" })).toEqual({ ok: false, message: "Baris tidak dapat diproses oleh posisi Anda." });
  });
});
