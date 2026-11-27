import { describe, expect, it, vi } from "vitest";
import { everyRole, outcome, signInAs } from "./action-harness";
import { checkWarnings } from "@/app/(app)/peringatan/actions";

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
  return { WorkflowError: class extends Error {}, loadOrg: async () => new OrgTree([{ code: "FRM", parent: null }]) };
});
vi.mock("@/lib/early-warning", () => ({ runEarlyWarning: async () => ({ opened: 0, cleared: 0, escalated: 0 }) }));
vi.mock("@/lib/payment", () => ({ todayJakarta: () => "2027-06-30" }));

describe("checkWarnings", () => {
  it.each(everyRole.filter((r) => r !== "finance").map((r) => [r]))("refuses %s outside FRM", async (role) => {
    signInAs(role, { orgUnit: "BCD" });
    expect(await outcome(() => checkWarnings())).toEqual({ message: "Pemeriksaan dijalankan Finance atau Head FRM." });
  });
});
