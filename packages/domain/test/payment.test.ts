import { describe, expect, it } from "vitest";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import {
  budgetHeadroom,
  canViewPayment,
  documentProblem,
  chargeableVersion,
  paymentRecipients,
  nettAmount,
  paymentActions,
  paymentNumber,
  paymentNotice,
  paymentRecap,
  paymentTransition,
  readyToSubmit,
  recapPeriod,
  terbilang,
  realisasiAmount,
  realisasiByLine,
  type PaymentRequestLike,
} from "../src/payment";

// Permintaan Pembayaran, from the client's hand-drawn flow (Nov 2026):
// Staff → Approval Atasan → Pemeriksaan BFP → Approval Head Divisi → Pembayaran (CM) → Informasi Pembayaran.
const org = new OrgTree([
  { code: "DIR", parent: null, type: "company" },
  { code: "SGV", parent: "DIR", type: "department" },
  { code: "PDMS", parent: "DIR", type: "division" },
  { code: "PDMS-SCM", parent: "PDMS", type: "department" },
  { code: "PDMS-SCM-PRC", parent: "PDMS-SCM", type: "unit" },
  { code: "FRM", parent: "DIR", type: "division" },
  { code: "FRM-FIN", parent: "FRM", type: "department" },
  { code: "FRM-FIN-BFP", parent: "FRM-FIN", type: "unit" },
  { code: "FRM-FIN-TCM", parent: "FRM-FIN", type: "unit" },
]);

const actor = (over: Partial<Actor>): Actor => ({ userId: "x", role: "requestor", orgUnit: "PDMS-SCM-PRC", entities: ["ESTRADA"], ...over });
const staff = actor({ userId: "staff" });
const scmHead = actor({ userId: "scm-head", role: "default_owner", orgUnit: "PDMS-SCM" });
const pdmsHead = actor({ userId: "pdms-head", role: "division_owner", orgUnit: "PDMS" });
const frmHead = actor({ userId: "frm-head", role: "division_owner", orgUnit: "FRM" });
const director = actor({ userId: "dir", role: "director", orgUnit: "DIR", entities: ["*"] });
const bfp = actor({ userId: "rini", role: "bfp", orgUnit: "FRM-FIN-BFP", entities: ["*"] });
const cm = actor({ userId: "nur", role: "cash_manager", orgUnit: "FRM-FIN-TCM", entities: ["*"] });

const req = (over: Partial<PaymentRequestLike> = {}): PaymentRequestLike => ({
  state: "draft",
  requesterId: "staff",
  requesterUnit: "PDMS-SCM-PRC",
  requesterRole: "requestor",
  entity: "ESTRADA",
  ...over,
});

describe("nettAmount: Nominal Pembayaran (nett)", () => {
  it("adds PPN and takes off the PPh withheld", () => {
    expect(nettAmount({ gross: money("10000000"), ppn: money("1100000"), pph: money("200000") }).toFixed(2)).toBe("10900000.00");
  });

  it("refuses a zero gross, a negative tax or PPh above the bill", () => {
    expect(() => nettAmount({ gross: money(0), ppn: money(0), pph: money(0) })).toThrow();
    expect(() => nettAmount({ gross: money(100), ppn: money(-1), pph: money(0) })).toThrow();
    expect(() => nettAmount({ gross: money(100), ppn: money(0), pph: money(101) })).toThrow();
  });
});

describe("realisasiAmount: what Paid books against the RKA line", () => {
  it("books the gross (DPP): PPN masukan is recoverable and PPh withheld is still the company's cost", () => {
    expect(realisasiAmount({ gross: money("10000000"), ppn: money("1100000"), pph: money("200000") }).toFixed(2)).toBe("10000000.00");
  });
});

describe("readyToSubmit: the documents the sketch asks for", () => {
  const base = { kind: "payment" as const, entity: "ESTRADA", budgetLineId: "line-1", description: "Sewa server Oktober", gross: money(100) };

  it("accepts a payment with an invoice-type document", () => {
    expect(readyToSubmit({ ...base, documents: ["invoice", "faktur_pajak"] })).toEqual([]);
  });

  it("lists what is missing", () => {
    expect(readyToSubmit({ ...base, budgetLineId: null, description: " ", documents: [] })).toEqual([
      "Pilih baris RKA",
      "Isi deskripsi pembayaran",
      "Lampirkan minimal satu dokumen",
    ]);
  });

  it("needs a Permohonan CA for a cash advance, and a supporting document for a payment", () => {
    expect(readyToSubmit({ ...base, kind: "cash_advance", documents: ["invoice"] })).toEqual(["Lampirkan Permohonan CA"]);
    expect(readyToSubmit({ ...base, kind: "cash_advance", documents: ["cash_advance"] })).toEqual([]);
    expect(readyToSubmit({ ...base, documents: ["cash_advance"] })).toEqual(["Lampirkan dokumen tagihan (Invoice, PO/WO/PKS, Faktur Pajak, BAST/Kwitansi atau Delivery Note)"]);
  });
});

describe("paymentActions: who acts at each step", () => {
  it("lets only the requester submit, from Draft or Returned", () => {
    expect(paymentActions(staff, req(), org)).toEqual(["submit"]);
    expect(paymentActions(staff, req({ state: "returned" }), org)).toEqual(["submit"]);
    expect(paymentActions(scmHead, req(), org)).toEqual([]);
  });

  it("sends Submitted to an atasan above the requester: Manager, Kepala Divisi or Direktur", () => {
    const r = req({ state: "submitted" });
    expect(paymentActions(scmHead, r, org)).toEqual(["approve", "return"]);
    expect(paymentActions(pdmsHead, r, org)).toEqual(["approve", "return"]);
    expect(paymentActions(director, r, org)).toEqual(["approve", "return"]);
    expect(paymentActions(frmHead, r, org)).toEqual([]);
    expect(paymentActions(bfp, r, org)).toEqual([]);
  });

  it("never lets a head approve their own request", () => {
    expect(paymentActions(scmHead, req({ state: "submitted", requesterId: "scm-head", requesterUnit: "PDMS-SCM", requesterRole: "default_owner" }), org)).toEqual([]);
  });

  it("gives Under Review to BFP, within the entities it covers", () => {
    expect(paymentActions(bfp, req({ state: "under_review" }), org)).toEqual(["verify", "return"]);
    expect(paymentActions(actor({ ...bfp, entities: ["PAS"] }), req({ state: "under_review" }), org)).toEqual([]);
    expect(paymentActions(scmHead, req({ state: "under_review" }), org)).toEqual([]);
  });

  it("gives Pending Approval to the head of the requester's own division", () => {
    const r = req({ state: "pending_approval" });
    expect(paymentActions(pdmsHead, r, org)).toEqual(["approve", "return"]);
    expect(paymentActions(frmHead, r, org)).toEqual([]);
    expect(paymentActions(scmHead, r, org)).toEqual([]);
    expect(paymentActions(director, r, org)).toEqual([]);
  });

  it("gives Pending Approval to the Direktur when the requester heads the division or sits outside any division", () => {
    expect(paymentActions(director, req({ state: "pending_approval", requesterId: "pdms-head", requesterUnit: "PDMS", requesterRole: "division_owner" }), org)).toEqual(["approve", "return"]);
    expect(paymentActions(pdmsHead, req({ state: "pending_approval", requesterId: "pdms-head", requesterUnit: "PDMS", requesterRole: "division_owner" }), org)).toEqual([]);
    expect(paymentActions(director, req({ state: "pending_approval", requesterUnit: "SGV" }), org)).toEqual(["approve", "return"]);
  });

  it("gives Approved and Scheduled to Cash Management", () => {
    expect(paymentActions(cm, req({ state: "approved" }), org)).toEqual(["schedule"]);
    expect(paymentActions(cm, req({ state: "scheduled" }), org)).toEqual(["pay"]);
    expect(paymentActions(bfp, req({ state: "approved" }), org)).toEqual([]);
  });

  it("closes a Paid request", () => {
    for (const a of [staff, scmHead, pdmsHead, director, bfp, cm]) expect(paymentActions(a, req({ state: "paid" }), org)).toEqual([]);
  });
});

describe("paymentTransition: the status the app shows", () => {
  it("walks Draft → Submitted → Under Review → Pending Approval → Approved → Scheduled → Paid", () => {
    let r = req();
    const step = (a: Actor, action: Parameters<typeof paymentTransition>[1]["action"], extra = {}) => {
      r = { ...r, state: paymentTransition(r, { action, actor: a, ...extra }, org).to };
      return r.state;
    };
    expect(step(staff, "submit")).toBe("submitted");
    expect(step(scmHead, "approve")).toBe("under_review");
    expect(step(bfp, "verify")).toBe("pending_approval");
    expect(step(pdmsHead, "approve")).toBe("approved");
    expect(step(cm, "schedule", { scheduledOn: "2026-11-20", bankAccountId: "bca-1" })).toBe("scheduled");
    expect(step(cm, "pay", { paidOn: "2026-11-20", proof: true })).toBe("paid");
  });

  it("returns to the requester with a reason, from any approval step", () => {
    expect(paymentTransition(req({ state: "under_review" }), { action: "return", actor: bfp, comment: "Faktur pajak belum ada" }, org)).toEqual({
      from: "under_review",
      to: "returned",
      action: "return",
      comment: "Faktur pajak belum ada",
    });
    expect(() => paymentTransition(req({ state: "submitted" }), { action: "return", actor: scmHead }, org)).toThrow(/alasan/);
  });

  it("needs a date and a bank to schedule, and a date and proof to mark Paid", () => {
    expect(() => paymentTransition(req({ state: "approved" }), { action: "schedule", actor: cm, scheduledOn: "2026-11-20" }, org)).toThrow(/bank/i);
    expect(() => paymentTransition(req({ state: "scheduled" }), { action: "pay", actor: cm, paidOn: "2026-11-20" }, org)).toThrow(/bukti/i);
    expect(() => paymentTransition(req({ state: "scheduled" }), { action: "pay", actor: cm, proof: true }, org)).toThrow(/tanggal/i);
  });

  it("refuses an action out of turn", () => {
    expect(() => paymentTransition(req({ state: "submitted" }), { action: "verify", actor: bfp }, org)).toThrow();
  });
});

describe("paymentNotice: one email per handoff, never an amount", () => {
  it("tells the next person in the flow", () => {
    expect(paymentNotice({ from: "draft", to: "submitted", action: "submit" })).toEqual({ template: "payment_submitted", to: "atasan" });
    expect(paymentNotice({ from: "returned", to: "submitted", action: "submit" })).toEqual({ template: "payment_submitted", to: "atasan" });
    expect(paymentNotice({ from: "submitted", to: "under_review", action: "approve" })).toEqual({ template: "payment_review", to: "bfp" });
    expect(paymentNotice({ from: "under_review", to: "pending_approval", action: "verify" })).toEqual({ template: "payment_approval", to: "division_head" });
    expect(paymentNotice({ from: "pending_approval", to: "approved", action: "approve" })).toEqual({ template: "payment_approved", to: "cash_manager" });
    expect(paymentNotice({ from: "approved", to: "scheduled", action: "schedule" })).toEqual({ template: "payment_scheduled", to: "requester" });
    expect(paymentNotice({ from: "scheduled", to: "paid", action: "pay" })).toEqual({ template: "payment_paid", to: "requester" });
    expect(paymentNotice({ from: "under_review", to: "returned", action: "return", comment: "Kurang BAST" })).toEqual({
      template: "payment_returned",
      to: "requester",
      comment: "Kurang BAST",
    });
  });
});

describe("budgetHeadroom: what BFP sees while checking", () => {
  it("takes Realisasi and other approved, unpaid requests off the plan", () => {
    const h = budgetHeadroom({ planned: money(1000), realised: money(300), committed: money(200), request: money(400) });
    expect(h.remaining.toFixed(0)).toBe("500");
    expect(h.after.toFixed(0)).toBe("100");
    expect(h.over).toBe(false);
  });

  it("flags a request that would go over the line", () => {
    expect(budgetHeadroom({ planned: money(1000), realised: money(900), committed: money(0), request: money(200) }).over).toBe(true);
  });
});

describe("paymentRecap: Rekap Pembayaran per hari / bulan", () => {
  const paid = [
    { paidOn: "2026-11-03", description: "Sewa server", nett: money("1000"), bank: "BCA 123" },
    { paidOn: "2026-11-03", description: "ATK", nett: money("250.50"), bank: "Mandiri 9" },
    { paidOn: "2026-11-15", description: "Vendor SCM", nett: money("4000"), bank: "BCA 123" },
    { paidOn: "2026-12-01", description: "Konsultan", nett: money("500"), bank: "BCA 123" },
  ];

  it("groups by day, oldest first, with a total for each day", () => {
    const r = paymentRecap(paid, "day");
    expect(r.groups.map((g) => [g.key, g.rows.length, g.total.toFixed(2)])).toEqual([
      ["2026-11-03", 2, "1250.50"],
      ["2026-11-15", 1, "4000.00"],
      ["2026-12-01", 1, "500.00"],
    ]);
    expect(r.total.toFixed(2)).toBe("5750.50");
  });

  it("groups by month and totals each bank", () => {
    const r = paymentRecap(paid, "month");
    expect(r.groups.map((g) => [g.key, g.total.toFixed(2)])).toEqual([
      ["2026-11", "5250.50"],
      ["2026-12", "500.00"],
    ]);
    expect(r.byBank.map((b) => [b.bank, b.total.toFixed(2)])).toEqual([
      ["BCA 123", "5500.00"],
      ["Mandiri 9", "250.50"],
    ]);
  });
});

describe("paymentNumber: the number printed on the Formulir", () => {
  it("numbers per entity and month, from 1", () => {
    expect(paymentNumber("ESTRADA", "2026-11-03", 1)).toBe("PP/ESTRADA/2026/11/0001");
    expect(paymentNumber("PAS", "2027-01-31", 125)).toBe("PP/PAS/2027/01/0125");
  });
});

describe("canViewPayment: who may open a request", () => {
  it("shows it to the requester, the heads above, Finance-side roles, the Direktur and the Auditor", () => {
    const r = req({ state: "under_review" });
    for (const a of [staff, scmHead, pdmsHead, director, bfp, cm, actor({ role: "finance", orgUnit: "FRM", entities: ["*"] }), actor({ role: "auditor", orgUnit: "DIR", entities: ["*"] })]) {
      expect(canViewPayment(a, r, org)).toBe(true);
    }
  });

  it("hides it from other units, other entities and Admin", () => {
    const r = req({ state: "under_review" });
    expect(canViewPayment(actor({ userId: "other", orgUnit: "PDMS-SCM-PRC" }), r, org)).toBe(false);
    expect(canViewPayment(frmHead, r, org)).toBe(false);
    expect(canViewPayment(actor({ ...bfp, entities: ["PAS"] }), r, org)).toBe(false);
    expect(canViewPayment(actor({ role: "admin", orgUnit: "DIR", entities: ["*"] }), r, org)).toBe(false);
  });

  it("keeps a draft to the requester", () => {
    expect(canViewPayment(scmHead, req(), org)).toBe(false);
    expect(canViewPayment(staff, req(), org)).toBe(true);
  });
});

describe("paymentRecipients: who gets the handoff email", () => {
  const seats = [
    { orgUnit: "PDMS-SCM", role: "default_owner" as const, occupant: "scm-head", entities: ["ESTRADA"] },
    { orgUnit: "PDMS", role: "division_owner" as const, occupant: "pdms-head", entities: ["ESTRADA"] },
    { orgUnit: "FRM", role: "division_owner" as const, occupant: "frm-head", entities: ["*"] },
    { orgUnit: "DIR", role: "director" as const, occupant: "dir", entities: ["*"] },
    { orgUnit: "FRM-FIN-BFP", role: "bfp" as const, occupant: "rini", entities: ["*"] },
    { orgUnit: "FRM-FIN-BFP", role: "bfp" as const, occupant: null, entities: ["*"] },
    { orgUnit: "FRM-FIN-TCM", role: "cash_manager" as const, occupant: "nur", entities: ["PAS"] },
  ];

  it("sends Submitted to the nearest head above the requester", () => {
    expect(paymentRecipients("atasan", req(), seats, org)).toEqual(["scm-head"]);
    expect(paymentRecipients("atasan", req({ requesterId: "scm-head", requesterUnit: "PDMS-SCM", requesterRole: "default_owner" }), seats, org)).toEqual(["pdms-head"]);
    expect(paymentRecipients("atasan", req({ requesterUnit: "PDMS-SCM-PRC" }), seats.slice(1), org)).toEqual(["pdms-head"]);
  });

  it("sends Pending Approval to the division head, or the Direktur", () => {
    expect(paymentRecipients("division_head", req(), seats, org)).toEqual(["pdms-head"]);
    expect(paymentRecipients("division_head", req({ requesterId: "pdms-head", requesterUnit: "PDMS", requesterRole: "division_owner" }), seats, org)).toEqual(["dir"]);
  });

  it("sends review and payment to everyone in that role covering the entity, and skips empty seats", () => {
    expect(paymentRecipients("bfp", req(), seats, org)).toEqual(["rini"]);
    expect(paymentRecipients("cash_manager", req(), seats, org)).toEqual([]);
    expect(paymentRecipients("cash_manager", req({ entity: "PAS" }), seats, org)).toEqual(["nur"]);
    expect(paymentRecipients("requester", req(), seats, org)).toEqual(["staff"]);
  });
});

describe("chargeableVersion: the RKA a payment is charged to", () => {
  it("takes the year's locked version, else its open one", () => {
    const v = [
      { id: "a", fiscalYear: 2026, status: "locked" as const },
      { id: "b", fiscalYear: 2027, status: "open" as const },
      { id: "c", fiscalYear: 2027, status: "archived" as const },
    ];
    expect(chargeableVersion(v, 2026)).toEqual({ id: "a", locked: true });
    expect(chargeableVersion(v, 2027)).toEqual({ id: "b", locked: false });
    expect(chargeableVersion(v, 2028)).toBeNull();
  });
});

describe("documentProblem: what an attachment may be", () => {
  it("takes PDF and photos up to 4 MB", () => {
    expect(documentProblem({ name: "invoice.pdf", type: "application/pdf", size: 1_000_000 })).toBeNull();
    expect(documentProblem({ name: "kwitansi.jpg", type: "image/jpeg", size: 4 * 1024 * 1024 })).toBeNull();
  });

  it("refuses an empty file, a big one, or another type", () => {
    expect(documentProblem({ name: "a.pdf", type: "application/pdf", size: 0 })).toBe("File kosong.");
    expect(documentProblem({ name: "a.pdf", type: "application/pdf", size: 4 * 1024 * 1024 + 1 })).toBe("Ukuran file maksimal 4 MB.");
    expect(documentProblem({ name: "a.exe", type: "application/x-msdownload", size: 10 })).toBe("Hanya PDF, JPG, PNG atau WEBP.");
  });
});

describe("terbilang: the amount in words on the Formulir", () => {
  it("writes rupiah the Indonesian way", () => {
    expect(terbilang(money("10900000"))).toBe("sepuluh juta sembilan ratus ribu rupiah");
    expect(terbilang(money("1"))).toBe("satu rupiah");
    expect(terbilang(money("11"))).toBe("sebelas rupiah");
    expect(terbilang(money("100"))).toBe("seratus rupiah");
    expect(terbilang(money("1000"))).toBe("seribu rupiah");
    expect(terbilang(money("1115"))).toBe("seribu seratus lima belas rupiah");
    expect(terbilang(money("2021750"))).toBe("dua juta dua puluh satu ribu tujuh ratus lima puluh rupiah");
    expect(terbilang(money("1000000000"))).toBe("satu miliar rupiah");
    expect(terbilang(money("3250000000000"))).toBe("tiga triliun dua ratus lima puluh miliar rupiah");
    expect(terbilang(money("0"))).toBe("nol rupiah");
  });

  it("says the sen when there are any", () => {
    expect(terbilang(money("250.50"))).toBe("dua ratus lima puluh rupiah lima puluh sen");
  });
});

describe("recapPeriod: the dates a Rekap covers", () => {
  it("defaults to this month per day, and this year per month", () => {
    expect(recapPeriod("day", undefined, undefined, "2026-11-12")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(recapPeriod("day", undefined, undefined, "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(recapPeriod("month", undefined, undefined, "2026-11-12")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("takes valid dates as given and swaps them when reversed", () => {
    expect(recapPeriod("day", "2026-10-15", "2026-11-05", "2026-11-12")).toEqual({ from: "2026-10-15", to: "2026-11-05" });
    expect(recapPeriod("day", "2026-11-05", "2026-10-15", "2026-11-12")).toEqual({ from: "2026-10-15", to: "2026-11-05" });
    expect(recapPeriod("day", "kemarin", "2026-13-40", "2026-11-12")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });
});

describe("realisasiByLine: what payments have used of each RKA line", () => {
  const p = (lineId: string | null, state: PaymentRequestLike["state"], gross: string, paidOn: string | null = null) => ({ lineId, state, gross: money(gross), paidOn });

  it("books Paid requests at their DPP in the month paid, and counts the ones in flight apart", () => {
    const r = realisasiByLine([
      p("a", "paid", "1000", "2027-01-15"),
      p("a", "paid", "500", "2027-03-02"),
      p("a", "scheduled", "300"),
      p("a", "pending_approval", "200"),
      p("a", "submitted", "999"),
      p("a", "draft", "999"),
      p("b", "returned", "999"),
      p(null, "paid", "50", "2027-01-01"),
    ]);
    const a = r.get("a")!;
    expect(a.paid.toFixed(0)).toBe("1500");
    expect(a.committed.toFixed(0)).toBe("500");
    expect(a.months.map((m) => m.toFixed(0))).toEqual(["1000", "0", "500", "0", "0", "0", "0", "0", "0", "0", "0", "0"]);
    expect(r.has("b")).toBe(false);
    expect(r.size).toBe(1);
  });

  it("keeps each year's payments to that year's lines", () => {
    const r = realisasiByLine([p("a", "paid", "100", "2027-12-31"), p("a", "paid", "70", "2028-01-02")], 2027);
    expect(r.get("a")!.paid.toFixed(0)).toBe("100");
    expect(r.get("a")!.outsideYear.toFixed(0)).toBe("70");
  });
});
