import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, queued, rows, signInAs } from "./action-harness";
import { saveCompliance } from "@/app/(app)/kepatuhan/actions";

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
  return { loadOrg: async () => h.ORG };
});

const input = { code: "ppn", status: "implemented" as const, evidenceUrl: "https://example.test/bukti", note: "" };
const REFUSAL = "Status kepatuhan diubah oleh Head FRM atau Auditor.";

beforeEach(() => {
  rows.current = [];
  queued.current = [];
});

describe("saveCompliance", () => {
  it.each(everyRole.map((r) => [r]))("as %s", async (role) => {
    signInAs(role);
    const out = await outcome(() => saveCompliance(input));
    if (role === "auditor") expect(out).toHaveProperty("pastGate");
    else expect(out).toEqual({ message: REFUSAL });
  });
  it("is the Head of FRM's too", async () => {
    signInAs("division_owner", { orgUnit: "FRM" });
    expect(await outcome(() => saveCompliance(input))).toHaveProperty("pastGate");
  });
  it("takes only a web link", async () => {
    signInAs("auditor");
    expect(await outcome(() => saveCompliance({ ...input, evidenceUrl: "javascript:alert(1)" }))).toEqual({ message: "Tautan bukti harus alamat web (https://…)." });
  });
});
