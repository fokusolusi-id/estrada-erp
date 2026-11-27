import { describe, expect, it, vi } from "vitest";
import { everyRole, outcome, signInAs } from "./action-harness";
import { saveContractRecord, saveP8, savePics } from "@/app/(app)/implementasi/contract-actions";

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
vi.mock("@/lib/implementasi", () => ({
  loadProjects: async () => [{ id: "p", dealId: "d", entity: "ESTRADA", status: "Initiation", team: { pm: null, deliveryControl: null, projectAdmin: null }, contract: { p8On: "2020-01-01", number: null, date: null, duration: null, term: null, pics: {} } }],
}));

const ID = "11111111-1111-4111-8111-111111111111";
const pics = { legal: "", scm: "", pm: "", ops: "", hrd: "", finance: "" };

describe.each(everyRole.map((r) => [r]))("as %s outside the owning unit", (role) => {
  it("cannot record the contract", async () => {
    signInAs(role, { orgUnit: "SCM" });
    expect(await outcome(() => saveContractRecord(ID, { number: "K1", date: "2020-02-01", duration: "setahun", term: "lumpsum" }))).toEqual({ message: "Data kontrak dicatat Legal & Contract Management." });
  });
});

describe("the owners", () => {
  it("BCD records the P8, the Head PMO the PICs", async () => {
    signInAs("requestor", { orgUnit: "BCD" });
    expect(await outcome(() => saveP8(ID, "2020-01-02"))).toHaveProperty("pastGate");
    expect(await outcome(() => savePics(ID, pics))).toEqual({ message: "PIC proyek ditetapkan Head PMO." });
    signInAs("division_owner", { orgUnit: "PDMS" });
    expect(await outcome(() => savePics(ID, pics))).toHaveProperty("pastGate");
  });
  it("refuses a date in the future", async () => {
    signInAs("requestor", { orgUnit: "BCD" });
    expect(await outcome(() => saveP8(ID, "2999-01-01"))).toEqual({ message: "Isi tanggal terima, tidak sesudah hari ini." });
  });
});
