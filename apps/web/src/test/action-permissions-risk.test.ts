import { describe, expect, it, vi } from "vitest";
import { everyRole, outcome, signInAs } from "./action-harness";
import { saveRisk } from "@/app/(app)/risiko/actions";

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
vi.mock("@/lib/risk", () => ({ insertRisk: async () => ({ id: "x" }) }));
vi.mock("@/lib/payment", () => ({ todayJakarta: () => "2027-06-30" }));

const form = (over: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ id: "", entityCode: "ESTRADA", category: "financial", title: "Uji", description: "", likelihood: "3", impact: "3", ownerUserId: "u", actionPlan: "", dueOn: "", ...over })) f.set(k, v);
  return f;
};
const REFUSAL = "Register risiko diisi Finance, Head FRM atau Direktur untuk perusahaannya.";

describe("saveRisk", () => {
  it.each(everyRole.filter((r) => r !== "finance" && r !== "director").map((r) => [r]))("refuses %s outside FRM", async (role) => {
    signInAs(role, { orgUnit: "BCD" });
    expect(await outcome(() => saveRisk(form()))).toEqual({ message: REFUSAL });
  });
  it("keeps a Direktur to their companies and checks the plan", async () => {
    signInAs("director", { entities: ["ESTRADA"] });
    expect(await outcome(() => saveRisk(form({ entityCode: "" })))).toEqual({ message: REFUSAL });
    expect(await outcome(() => saveRisk(form({ likelihood: "5", impact: "4" })))).toEqual({ message: "Risiko High dan Critical wajib punya rencana aksi dan tenggat." });
  });
});
