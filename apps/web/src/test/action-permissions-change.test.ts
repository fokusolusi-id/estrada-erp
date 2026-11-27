import { beforeEach, describe, expect, it, vi } from "vitest";
import { actorOf, everyRole, outcome, queued, rows, session, signInAs } from "./action-harness";
import { cancelRequest, decideRequest } from "@/app/(app)/master/persetujuan/actions";
import { saveEntity } from "@/app/(app)/admin/master/actions";
import { saveCoa } from "@/app/(app)/coa/actions";

// Plan A6: a sensitive master changes only after the Finance Controller approves, and never by the requester.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/outbox", () => ({ enqueueEmail: vi.fn(async () => {}) }));
vi.mock("@estrada/db", async () => {
  const h = await import("./action-harness");
  return { db: h.fakeDb(), schema: h.fakeSchema() };
});
vi.mock("@/lib/session", async () => {
  const h = await import("./action-harness");
  return { requireUser: async () => ({ id: h.session.current.userId, name: "Uji", email: "uji@estrada.test", actor: h.session.current }) };
});
vi.mock("@/lib/workflow", async () => {
  const h = await import("./action-harness");
  return { loadOrg: async () => h.ORG };
});

const ID = "11111111-1111-4111-8111-111111111111";
const pending = { id: ID, status: "pending", requesterId: "user-finance", master: "coa", subjectId: "4999" };

beforeEach(() => {
  rows.current = [pending];
  queued.current = [];
});

describe("decideRequest", () => {
  it("lets the FRM Division Owner past the check", async () => {
    signInAs("division_owner", { orgUnit: "FRM" });
    expect(await outcome(() => decideRequest(ID, "approve", ""))).toHaveProperty("pastGate");
  });

  it.each(everyRole.map((r) => [r]))("refuses %s outside that seat", async (role) => {
    signInAs(role);
    expect(await outcome(() => decideRequest(ID, "approve", ""))).toEqual({ message: "Hanya Finance Controller (Division Owner FRM) yang memutuskan." });
  });

  it("refuses the requester deciding their own request", async () => {
    session.current = actorOf("division_owner", { orgUnit: "FRM", userId: "user-finance" });
    expect(await outcome(() => decideRequest(ID, "approve", ""))).toEqual({ message: "Pemohon tidak dapat memutuskan permintaannya sendiri." });
  });

  it("refuses a rejection without a note", async () => {
    signInAs("division_owner", { orgUnit: "FRM" });
    expect(await outcome(() => decideRequest(ID, "reject", " "))).toEqual({ message: "Tulis alasan penolakan." });
  });

  it("lets only the requester cancel", async () => {
    signInAs("admin");
    expect(await outcome(() => cancelRequest(ID))).toEqual({ message: "Hanya pemohon yang dapat membatalkan." });
  });
});

describe("saveCoa asks for approval", () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ mode: "create", code: "4999", name: "Uji Coba", category: "Revenue", ...fields })) f.set(k, v);
    return f;
  };
  const state = { ok: false, message: "" };

  it("refuses a change without a reason or with a past effective date, before any write", async () => {
    signInAs("finance");
    rows.current = [];
    expect(await outcome(() => saveCoa(state, form({ reason: "", effectiveOn: "2999-01-01" })))).toEqual({ message: "Alasan perubahan wajib diisi." });
    expect(await outcome(() => saveCoa(state, form({ reason: "Akun baru", effectiveOn: "2000-01-01" })))).toEqual({ message: "Tanggal berlaku tidak boleh sebelum hari ini." });
  });

  it("refuses a second request while one is open for the same code", async () => {
    signInAs("finance");
    queued.current = [[], [], [pending]];
    expect(await outcome(() => saveCoa(state, form({ reason: "Akun baru", effectiveOn: "2999-01-01" })))).toEqual({ message: "Masih ada permintaan yang terbuka untuk 4999." });
  });
});

describe("saveEntity (A7: company master fields)", () => {
  it("refuses an authorised capital it cannot read, before any write", async () => {
    signInAs("admin");
    rows.current = [];
    const f = new FormData();
    for (const [k, v] of Object.entries({ code: "UJI", name: "PT Uji", costType: "direct", isNew: "1", authorisedCapital: "dua miliar", reason: "Uji", effectiveOn: "2999-01-01" })) f.set(k, v);
    expect(await outcome(() => saveEntity({ ok: false, message: "" }, f))).toEqual({ message: "Modal dasar tidak terbaca." });
  });
});
