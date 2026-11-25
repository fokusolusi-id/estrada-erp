import { describe, expect, it, vi } from "vitest";
import type { Role } from "@estrada/domain";
import { everyRole, outcome, signInAs, rows } from "./action-harness";
import { inviteUser, updateUser } from "@/app/(app)/admin/users/actions";
import { createPosition, setActing, updatePosition } from "@/app/(app)/admin/positions/actions";
import { saveEntity, saveUnit } from "@/app/(app)/admin/master/actions";
import { openCycle, reviseVersion, setDeadline } from "@/app/(app)/rka/cycle/actions";
import { confirmCoa, remapCoa, saveCoa } from "@/app/(app)/coa/actions";
import { carryCashFromPrior, deleteLoan, saveCashAssumptions, saveLoan } from "@/app/(app)/cash/actions";
import { saveBankAccount } from "@/app/(app)/pembayaran/rekening/actions";
import { saveEntityHeadcount } from "@/app/(app)/rka/allocation/actions";
import { deleteDeal, saveRecoveryPlan } from "@/app/(app)/pipeline/actions";

// Every action below checks who is asking on the server, whatever the menu shows. The tests call each one as every
// role against a database that reads as empty and refuses writes: a wrong role must get the action's own refusal
// and never reach a write, and the right role must get past it.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { requestPasswordReset: vi.fn(async () => {}) } } }));
vi.mock("@/lib/email/outbox", () => ({ enqueueEmail: vi.fn(async () => {}) }));
vi.mock("@estrada/db", async () => {
  const h = await import("./action-harness");
  return { db: h.fakeDb(), schema: h.fakeSchema() };
});
vi.mock("@/lib/session", async () => {
  const h = await import("./action-harness");
  return {
    VIEW_AS_COOKIE: "view_as",
    requireUser: async () => ({ id: h.session.current.userId, name: "Uji", email: "uji@estrada.test", actor: h.session.current, realRole: h.session.current.role, positions: [] }),
  };
});
vi.mock("@/lib/workflow", async () => {
  const h = await import("./action-harness");
  return { loadOrg: async () => h.ORG };
});

const UUID = "11111111-1111-4111-8111-111111111111";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const state = { ok: false, message: "" };

type Case = { name: string; call: () => Promise<{ ok: boolean; message: string }>; allowed: readonly Role[]; refusal: string };

const CASES: Case[] = [
  // Admin: users, positions, units and entities.
  { name: "inviteUser", allowed: ["admin"], refusal: "Hanya Admin yang dapat mengundang pengguna.", call: () => inviteUser(state, form({ name: "Rahma Uji", email: "rahma@estrada.test", title: "Staff", orgUnit: "SCM", role: "requestor" })) },
  { name: "updateUser", allowed: ["admin"], refusal: "Hanya Admin yang dapat mengubah pengguna.", call: () => updateUser(state, form({ userId: "u1", name: "Rahma Uji", active: "on" })) },
  { name: "createPosition", allowed: ["admin"], refusal: "Hanya Admin yang dapat mengelola posisi.", call: () => createPosition(state, form({ orgUnit: "SCM", title: "Head of Uji", role: "default_owner" })) },
  { name: "setActing", allowed: ["admin"], refusal: "Hanya Admin yang dapat mengelola posisi.", call: () => setActing(state, form({ positionId: UUID })) },
  { name: "updatePosition", allowed: ["admin"], refusal: "Hanya Admin yang dapat mengelola posisi.", call: () => updatePosition(state, form({ positionId: UUID, orgUnit: "SCM", title: "Head of Uji", role: "default_owner", entities: "*" })) },
  { name: "saveUnit", allowed: ["admin"], refusal: "Hanya Admin yang dapat mengelola master.", call: () => saveUnit(state, form({ code: "UJI", name: "Unit Uji", type: "unit", isNew: "1" })) },
  { name: "saveEntity", allowed: ["admin"], refusal: "Hanya Admin yang dapat mengelola master.", call: () => saveEntity(state, form({ code: "UJI", name: "Entitas Uji", costType: "direct", isNew: "1" })) },
  // Finance: the cycle, COA Master and the cash forecast.
  { name: "openCycle", allowed: ["finance"], refusal: "Hanya Finance yang dapat mengelola siklus RKA.", call: () => openCycle(state, form({ fiscalYear: "2028", name: "RKA 2028 Uji", deadline: "2027-12-31", start: "empty" })) },
  { name: "setDeadline", allowed: ["finance"], refusal: "Hanya Finance yang dapat mengelola siklus RKA.", call: () => setDeadline(state, form({ versionId: UUID, deadline: "2027-12-31" })) },
  { name: "reviseVersion", allowed: ["finance"], refusal: "Hanya Finance yang dapat mengelola siklus RKA.", call: () => reviseVersion(state, form({ versionId: UUID, start: "draft" })) },
  { name: "saveCoa", allowed: ["finance"], refusal: "Hanya Finance yang dapat mengubah COA Master.", call: () => saveCoa(state, form({ code: "4999", name: "Uji" })) },
  { name: "confirmCoa", allowed: ["finance"], refusal: "Hanya Finance yang dapat mengubah COA Master.", call: () => confirmCoa("4999") },
  { name: "remapCoa", allowed: ["finance"], refusal: "Hanya Finance yang dapat mengubah COA Master.", call: () => remapCoa("4999", "4100") },
  { name: "saveCashAssumptions", allowed: ["finance"], refusal: "Hanya Finance yang dapat mengubah arus kas.", call: () => saveCashAssumptions({} as never) },
  { name: "saveLoan", allowed: ["finance"], refusal: "Hanya Finance yang dapat mengubah arus kas.", call: () => saveLoan({} as never) },
  { name: "deleteLoan", allowed: ["finance"], refusal: "Hanya Finance yang dapat mengubah arus kas.", call: () => deleteLoan(UUID) },
  { name: "carryCashFromPrior", allowed: ["finance"], refusal: "Hanya Finance yang dapat mengubah arus kas.", call: () => carryCashFromPrior() },
  { name: "saveEntityHeadcount", allowed: ["finance"], refusal: "Hanya Finance yang dapat mengisi headcount.", call: () => saveEntityHeadcount({}) },
  // Cash Management keeps the bank accounts; Admin may too.
  { name: "saveBankAccount", allowed: ["cash_manager", "admin"], refusal: "Hanya Cash Management atau Admin yang dapat mengelola rekening.", call: () => saveBankAccount({} as never) },
];

describe("server actions check who is asking, whatever the menu shows", () => {
  for (const c of CASES) {
    describe(c.name, () => {
      it.each(everyRole.map((r) => [r]))("as %s", async (role) => {
        signInAs(role);
        const out = await outcome(c.call);
        if (c.allowed.includes(role)) expect(out).not.toEqual({ message: c.refusal });
        else expect(out).toEqual({ message: c.refusal });
      });
    });
  }
});

describe("Pipeline: BCD alone, within its entities", () => {
  const plan = () => saveRecoveryPlan("Telco Business", "Kejar dua tender Telkom bulan depan");
  const REFUSAL = "Rencana pemulihan ditulis oleh Sales Head (Division Owner BCD).";

  it("lets the Sales Head, the Division Owner of BCD, past the check", async () => {
    signInAs("division_owner", { orgUnit: "BCD" });
    expect(await outcome(plan)).not.toEqual({ message: REFUSAL });
  });

  it.each(everyRole.map((r) => [r]))("refuses %s, and a Division Owner of another division", async (role) => {
    signInAs(role);
    expect(await outcome(plan)).toEqual({ message: REFUSAL });
  });

  const DEAL_ROW = [{ entityCode: "ESTRADA" }];
  it("refuses to delete a deal for anyone outside BCD, or BCD outside the deal's entity", async () => {
    rows.current = DEAL_ROW;
    for (const [role, over] of [
      ["requestor", { orgUnit: "SCM" }],
      ["default_owner", { orgUnit: "SCM" }],
      ["division_owner", { orgUnit: "PDMS" }],
      ["finance", {}],
      ["director", {}],
      ["auditor", {}],
      ["admin", {}],
      ["requestor", { orgUnit: "BCD", entities: ["MATRIK"] }],
    ] as const) {
      signInAs(role, over);
      expect(await outcome(() => deleteDeal(UUID)), `${role} ${JSON.stringify(over)}`).toEqual({ message: "Anda tidak berwenang menghapus deal ini." });
    }
    rows.current = [];
  });

  it("lets BCD within the deal's entity past the check", async () => {
    rows.current = DEAL_ROW;
    signInAs("requestor", { orgUnit: "BCD", entities: ["ESTRADA"] });
    // The mocked rows also read as "has a project", so the next rule answers: the point is that the first one did not.
    expect(await outcome(() => deleteDeal(UUID))).not.toEqual({ message: "Anda tidak berwenang menghapus deal ini." });
    rows.current = [];
  });
});
