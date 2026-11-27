import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, rows, signInAs } from "./action-harness";
import { saveVarianceNote } from "@/app/(app)/rka/variance/actions";

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
  const h = await import("./action-harness");
  return { loadOrg: async () => h.ORG };
});
vi.mock("@/lib/rka", () => ({ reportVersions: async () => [{ id: "v1", status: "open" }] }));

beforeEach(() => {
  rows.current = [{ id: "line" }];
});

describe("saveVarianceNote", () => {
  it.each(everyRole.map((r) => [r]))("as %s of the unit's division", async (role) => {
    signInAs(role, { orgUnit: "PDMS" });
    const out = await outcome(() => saveVarianceNote("SCM", null, "Pengadaan mundur ke kuartal berikutnya."));
    if (role === "default_owner" || role === "division_owner") expect(out).toHaveProperty("pastGate");
    else expect(out).toEqual({ message: "Catatan varians ditulis pemilik cost center." });
  });

  it("refuses a note too short to explain anything", async () => {
    signInAs("division_owner", { orgUnit: "PDMS" });
    expect(await outcome(() => saveVarianceNote("SCM", null, "ok"))).toEqual({ message: "Tulis penyebabnya, minimal 10 karakter." });
  });

  it("refuses a cost center without budget lines", async () => {
    signInAs("division_owner", { orgUnit: "PDMS" });
    rows.current = [];
    expect(await outcome(() => saveVarianceNote("SCM", "6241", "Pengadaan mundur ke kuartal berikutnya."))).toEqual({ message: "Tidak ada anggaran untuk cost center atau COA ini." });
  });
});
