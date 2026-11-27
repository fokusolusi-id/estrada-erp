import { beforeEach, describe, expect, it, vi } from "vitest";
import { actorOf, everyRole, outcome, rows, session, signInAs } from "./action-harness";
import { saveDeal } from "@/app/(app)/pipeline/actions";

// A deal is written by BCD alone, within its entities, and a deal that already exists is checked again against the
// entity it is in now, not the one the form sends. Called as every role against a database that refuses writes.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@estrada/db", async () => {
  const h = await import("./action-harness");
  return { db: h.fakeDb(), schema: h.fakeSchema() };
});
vi.mock("@/lib/session", async () => {
  const h = await import("./action-harness");
  return { requireUser: async () => ({ id: h.session.current.userId, name: "Uji", email: "uji@estrada.test", actor: h.session.current, realRole: h.session.current.role, positions: [] }) };
});
vi.mock("@/lib/workflow", async () => {
  const h = await import("./action-harness");
  return { loadOrg: async () => h.ORG };
});
vi.mock("@/lib/pipeline", () => ({ pipelineYear: async () => 2027, loadPipeline: async () => [] }));

const ID = "11111111-1111-4111-8111-111111111111";
const deal = {
  id: null,
  entity: "ESTRADA",
  customer: "PT Uji",
  customerId: "Cust-001",
  segment: "Telco Business",
  project: "Proyek Uji",
  coaCode: "4101",
  value: "1000000000",
  status: "QO" as const,
  probability: "50",
  type: "new" as const,
  startMonth: 1,
  endMonth: 12,
};
const REFUSAL = "Anda tidak berwenang mengubah pipeline untuk entitas ini.";
// What the fake database returns for the COA lookup, the customers, the other deals and the deal being edited, all in one.
const REVENUE_COA = { id: "Cust-001", category: "Revenue", active: true, entityCode: "MATRIK", project: "Proyek Lain", nickname: "PT Lain", legalName: "PT Lain" };

beforeEach(() => {
  rows.current = [REVENUE_COA];
});

describe("saveDeal: BCD alone, within its entities", () => {
  it("lets a BCD seat in the deal's entity past the check", async () => {
    signInAs("requestor", { orgUnit: "BCD", entities: ["ESTRADA"] });
    expect(await outcome(() => saveDeal(deal))).toEqual({ pastGate: "database transaction reached" });
  });

  it.each(everyRole.map((r) => [r]))("refuses %s outside BCD", async (role) => {
    signInAs(role);
    expect(await outcome(() => saveDeal(deal))).toEqual({ message: REFUSAL });
  });

  it("refuses BCD outside the deal's entity", async () => {
    signInAs("requestor", { orgUnit: "BCD", entities: ["MATRIK"] });
    expect(await outcome(() => saveDeal(deal))).toEqual({ message: REFUSAL });
  });

  it("checks an existing deal against the entity it is in now, not the one the form sends", async () => {
    // BCD of ESTRADA edits a MATRIK deal by sending it as an ESTRADA one.
    signInAs("requestor", { orgUnit: "BCD", entities: ["ESTRADA"] });
    expect(await outcome(() => saveDeal({ ...deal, id: ID }))).toEqual({ message: "Anda tidak berwenang mengubah deal ini." });
    session.current = actorOf("requestor", { orgUnit: "BCD", entities: ["MATRIK"] });
    expect(await outcome(() => saveDeal({ ...deal, id: ID, entity: "MATRIK" }))).not.toEqual({ message: "Anda tidak berwenang mengubah deal ini." });
  });

  it("BR-SP-002: refuses a deal without a customer from the master", async () => {
    signInAs("requestor", { orgUnit: "BCD", entities: ["ESTRADA"] });
    expect(await outcome(() => saveDeal({ ...deal, customerId: null }))).toEqual({ message: "Pilih customer dari Master Customer." });
  });

  it("refuses a customer that is not in Master Customer", async () => {
    signInAs("requestor", { orgUnit: "BCD", entities: ["ESTRADA"] });
    expect(await outcome(() => saveDeal({ ...deal, customerId: "Cust-999" }))).toEqual({ message: "Customer tidak ada di Master Customer." });
  });

  it("refuses a deal that is incomplete or not a revenue COA before any write", async () => {
    signInAs("requestor", { orgUnit: "BCD", entities: ["ESTRADA"] });
    expect(await outcome(() => saveDeal({ ...deal, customer: "" }))).toEqual({ message: "Lengkapi data deal terlebih dahulu." });
    rows.current = [{ ...REVENUE_COA, category: "OPEX" }];
    expect(await outcome(() => saveDeal(deal))).toEqual({ message: "COA harus akun pendapatan yang aktif di COA Master." });
  });
});
