import { describe, expect, it, vi } from "vitest";
import { everyRole, outcome, signInAs } from "./action-harness";
import { generateReport } from "@/app/(app)/laporan/actions";

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
vi.mock("@/lib/workflow", () => ({ WorkflowError: class extends Error {}, loadOrg: async () => ({}) }));
vi.mock("@/lib/report", () => ({ buildReport: async () => ({ sheets: [] }), closedMonths: async () => [] }));
vi.mock("@/lib/payment", () => ({ loadSeats: async () => [], todayJakarta: () => "2027-06-30" }));

const form = () => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ kind: "pnl", periodType: "month", periodNo: "6", year: "2027", company: "ESTRADA" })) f.set(k, v);
  return f;
};

describe("generateReport", () => {
  it.each(everyRole.filter((r) => r !== "finance").map((r) => [r]))("refuses %s", async (role) => {
    signInAs(role);
    expect(await outcome(() => generateReport(form()))).toEqual({ message: "Laporan disiapkan Finance untuk perusahaan dalam cakupannya." });
  });
});
