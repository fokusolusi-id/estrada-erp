import { describe, expect, it, vi } from "vitest";
import { everyRole, outcome, signInAs } from "./action-harness";
import { saveHighlight } from "@/app/(app)/dashboard/actions";

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
  return { loadOrg: async () => new OrgTree([{ code: "FRM", parent: null }]) };
});

const form = (scope = "ESTRADA") => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ scope, year: "2027", month: "6", body: "Cash in di bawah rencana." })) f.set(k, v);
  return f;
};
const REFUSAL = "Highlight ditulis Direktur atau Head FRM untuk perusahaannya.";

describe("saveHighlight", () => {
  it.each(everyRole.filter((r) => r !== "director").map((r) => [r]))("refuses %s outside FRM", async (role) => {
    signInAs(role, { orgUnit: "BCD" });
    expect(await outcome(() => saveHighlight(form()))).toEqual({ message: REFUSAL });
  });
  it("lets a Direktur write for their own companies only", async () => {
    signInAs("director", { entities: ["ESTRADA"] });
    expect(await outcome(() => saveHighlight(form()))).toHaveProperty("pastGate");
    expect(await outcome(() => saveHighlight(form("ESTRADA+PAS")))).toEqual({ message: REFUSAL });
  });
});
