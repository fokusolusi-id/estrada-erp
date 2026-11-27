import { describe, expect, it, vi } from "vitest";

// The check the two transition paths run before they write (plan A11).

vi.mock("server-only", () => ({}));
vi.mock("@estrada/db", () => ({ db: {}, schema: {} }));
vi.mock("@/lib/workflow", () => ({ WorkflowError: class WorkflowError extends Error {} }));

describe("assertSeparated", () => {
  const cashier = { userId: "u1", role: "cash_manager" as const, orgUnit: "FRM-FIN-TCM", entities: ["*"] };

  it("refuses a step that conflicts with one the same person already took", async () => {
    const { assertSeparated } = await import("@/lib/sod");
    expect(() => assertSeparated(cashier, [{ actorUserId: "u1", actorRole: "bfp", actorUnit: "FRM", action: "verify" }])).toThrow(/Pemisahan tugas.*Finance-Pricing.*Finance-CashMgmt/);
  });

  it("ignores other people, and steps that only sent the record back", async () => {
    const { assertSeparated } = await import("@/lib/sod");
    expect(() => assertSeparated(cashier, [{ actorUserId: "u2", actorRole: "bfp", actorUnit: "FRM", action: "verify" }])).not.toThrow();
    expect(() => assertSeparated(cashier, [{ actorUserId: "u1", actorRole: "bfp", actorUnit: "FRM", action: "return" }])).not.toThrow();
  });
});
