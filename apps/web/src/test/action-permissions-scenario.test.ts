import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SCENARIOS, DEFAULT_SEASONALITY } from "@estrada/domain";
import { everyRole, outcome, queued, rows, signInAs } from "./action-harness";
import { saveScenarios } from "@/app/(app)/cash/skenario/actions";

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
vi.mock("@/lib/rka", () => ({ reportVersions: async () => [{ fiscalYear: 2027 }] }));

const input = { scenarios: DEFAULT_SCENARIOS, seasonality: [...DEFAULT_SEASONALITY] };

beforeEach(() => {
  rows.current = [];
  queued.current = [];
});

describe("saveScenarios", () => {
  it.each(everyRole.map((r) => [r]))("as %s", async (role) => {
    signInAs(role);
    const out = await outcome(() => saveScenarios(input));
    if (role === "finance") expect(out).toHaveProperty("pastGate");
    else expect(out).toEqual({ message: "Hanya Finance yang dapat mengubah skenario." });
  });
  it("checks the figures", async () => {
    signInAs("finance");
    expect(await outcome(() => saveScenarios({ ...input, seasonality: input.seasonality.map(() => "1") }))).toEqual({ message: "Persentase 12 bulan harus berjumlah 100." });
    expect(await outcome(() => saveScenarios({ ...input, scenarios: { ...DEFAULT_SCENARIOS, normal: { ...DEFAULT_SCENARIOS.normal, revenue: "banyak" } } }))).toEqual({ message: "Pendapatan dan CapEx harus angka 0 atau lebih." });
  });
});
