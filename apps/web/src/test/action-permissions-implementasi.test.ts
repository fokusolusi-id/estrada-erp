import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor, Role } from "@estrada/domain";
import { actorOf, outcome, rows, session } from "./action-harness";
import {
  approveSignoff, assignTeam, baiStep, changeContractSites, declareRfs, deleteSite, dropProject, openProject,
  prepareBast, recordTelkomDoc, saveSite, setTelkomScheme,
} from "@/app/(app)/implementasi/actions";

// The delivery flow is gated by who sits where on the project: the Head PMO, the three team seats, BCD. Each action is
// called by each of those and by seats that have no part in it, against one fixed project and a database that refuses
// writes: a wrong seat must get the action's own refusal, the right one must get past it.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/project-notify", () => ({ notifyProject: vi.fn(async () => {}) }));
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
vi.mock("@/lib/implementasi", () => ({
  deliveryPeople: async () => [],
  loadProjects: async () => [
    {
      id: "11111111-1111-4111-8111-111111111111",
      entity: "ESTRADA",
      status: "Implementasi",
      telkomScheme: true,
      team: { pm: "pm-1", deliveryControl: "dc-1", projectAdmin: "pa-1" },
      rfs: { on: null, proposedOn: null },
      bast: { on: null, proposedOn: null },
      sites: [],
    },
  ],
}));

const P = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";

const ACTORS: Record<string, { role: Role; over: Partial<Actor> }> = {
  headPmo: { role: "division_owner", over: { orgUnit: "PMO", userId: "head-1" } },
  pm: { role: "requestor", over: { orgUnit: "PMO", userId: "pm-1" } },
  deliveryControl: { role: "requestor", over: { orgUnit: "PMO", userId: "dc-1" } },
  projectAdmin: { role: "requestor", over: { orgUnit: "PMO", userId: "pa-1" } },
  bcd: { role: "requestor", over: { orgUnit: "BCD", userId: "bcd-1" } },
  bcdOtherEntity: { role: "requestor", over: { orgUnit: "BCD", userId: "bcd-2", entities: ["MATRIK"] } },
  otherStaff: { role: "requestor", over: { orgUnit: "SCM", userId: "other-1" } },
  finance: { role: "finance", over: { userId: "fin-1" } },
  director: { role: "director", over: { userId: "dir-1" } },
  auditor: { role: "auditor", over: { userId: "aud-1" } },
  admin: { role: "admin", over: { userId: "adm-1" } },
};

type Case = { name: string; allowed: string[]; refusal: string; call: () => Promise<{ ok: boolean; message: string }> };

const site = { kode: "S1", nama: "Lokasi Uji", alamat: "Jl. Uji 1", status: "Belum_Mulai", tglPlanSelesai: "2027-06-30" };
const CASES: Case[] = [
  { name: "openProject", allowed: ["bcd"], refusal: "Proyek dibuka oleh BCD untuk entitasnya.", call: () => openProject(P, 3) },
  { name: "assignTeam", allowed: ["headPmo"], refusal: "Tim proyek ditetapkan oleh Head PMO.", call: () => assignTeam(P, { pm: "pm-1", deliveryControl: "dc-1", projectAdmin: "pa-1" }) },
  { name: "saveSite (add)", allowed: ["pm"], refusal: "Lokasi didaftarkan oleh Project Manager proyek ini.", call: () => saveSite(P, { id: null, ...site } as never) },
  { name: "saveSite (edit)", allowed: ["pm", "projectAdmin"], refusal: "Lokasi diubah oleh Project Manager atau Project Admin proyek ini.", call: () => saveSite(P, { id: S, ...site } as never) },
  { name: "baiStep collect", allowed: ["deliveryControl"], refusal: "BAI dikumpulkan oleh Delivery Control proyek ini.", call: () => baiStep(P, S, { step: "collect" }) },
  { name: "baiStep compile", allowed: ["projectAdmin"], refusal: "BAI dikompilasi oleh Project Admin proyek ini.", call: () => baiStep(P, S, { step: "compile" }) },
  { name: "baiStep verify", allowed: ["bcd"], refusal: "BAI diverifikasi oleh Assurance (BCD) untuk entitasnya.", call: () => baiStep(P, S, { step: "verify" }) },
  { name: "declareRfs", allowed: ["pm"], refusal: "RFS dinyatakan oleh Project Manager proyek ini.", call: () => declareRfs(P, "2027-01-15") },
  { name: "prepareBast", allowed: ["projectAdmin"], refusal: "BAST disiapkan oleh Project Admin proyek ini.", call: () => prepareBast(P, "BAST-001", "2027-02-15") },
  { name: "approveSignoff rfs", allowed: ["headPmo"], refusal: "Pengesahan dilakukan oleh Head PMO.", call: () => approveSignoff(P, "rfs") },
  { name: "approveSignoff bast", allowed: ["headPmo"], refusal: "Pengesahan dilakukan oleh Head PMO.", call: () => approveSignoff(P, "bast") },
  { name: "deleteSite", allowed: ["pm"], refusal: "Lokasi dihapus oleh Project Manager proyek ini.", call: () => deleteSite(P, S) },
  { name: "changeContractSites", allowed: ["bcd"], refusal: "Jumlah lokasi kontrak diubah oleh BCD untuk entitasnya.", call: () => changeContractSites(P, 5, "Addendum kontrak") },
  { name: "dropProject", allowed: ["headPmo"], refusal: "Proyek dihentikan oleh Head PMO.", call: () => dropProject(P, "Kontrak dibatalkan pelanggan") },
  { name: "setTelkomScheme", allowed: ["bcd"], refusal: "Skema pelanggan diatur oleh BCD untuk entitasnya.", call: () => setTelkomScheme(P, true) },
  { name: "recordTelkomDoc", allowed: ["bcd"], refusal: "BARD dan BAUT dicatat oleh Assurance (BCD) untuk entitasnya.", call: () => recordTelkomDoc(P, "bard", { nomor: "BARD-1", tanggal: "2027-03-01" }) },
];

beforeEach(() => {
  // openProject reads the deal it opens from the database.
  rows.current = [{ entityCode: "ESTRADA", status: "CW" }];
});

describe("Implementasi actions check who is asking, whatever the menu shows", () => {
  for (const c of CASES) {
    describe(c.name, () => {
      it.each(Object.keys(ACTORS).map((a) => [a]))("as %s", async (who) => {
        const { role, over } = ACTORS[who]!;
        session.current = actorOf(role, over);
        const out = await outcome(c.call);
        if (c.allowed.includes(who)) expect(out).not.toEqual({ message: c.refusal });
        else expect(out).toEqual({ message: c.refusal });
      });
    });
  }
});
