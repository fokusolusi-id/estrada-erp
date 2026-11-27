import { describe, expect, it, vi } from "vitest";
import { everyRole, outcome, signInAs } from "./action-harness";
import { saveKpi } from "@/app/(app)/kpi/actions";

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
vi.mock("@/lib/workflow", () => ({ WorkflowError: class extends Error {} }));
vi.mock("@/lib/kpi", () => ({ targetsOf: () => ({}) }));
vi.mock("@/lib/payment", () => ({ loadSeats: async () => [] }));

const form = (over: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ year: "2027", entityCode: "ESTRADA", revenue: "1.000", revenueDirect: "0", ebitdaPct: "20", cashIn: "800", netMarginPct: "15", ...over })) f.set(k, v);
  return f;
};
const REFUSAL = "Target KPI disiapkan Direktur PT untuk perusahaannya.";

describe("saveKpi", () => {
  it.each(everyRole.map((r) => [r]))("as %s covering all companies", async (role) => {
    signInAs(role);
    expect(await outcome(() => saveKpi(form()))).toEqual({ message: REFUSAL });
  });
  it("is the company Direktur's, and checks the figures", async () => {
    signInAs("director", { entities: ["ESTRADA"] });
    expect(await outcome(() => saveKpi(form()))).toHaveProperty("pastGate");
    expect(await outcome(() => saveKpi(form({ revenue: "0" })))).toEqual({ message: "Target revenue harus lebih dari 0." });
    expect(await outcome(() => saveKpi(form({ entityCode: "MATRIK" })))).toEqual({ message: REFUSAL });
  });
});
