import { sum, ZERO, type Money } from "./money";
import type { OrgTree } from "./org";
import type { Actor } from "./policy";
import type { Role } from "./roles";

/**
 * Permintaan Pembayaran, from the client's flow:
 * Staff → Approval Atasan → Pemeriksaan BFP → Approval Head Divisi → Pembayaran (CM) → Informasi Pembayaran.
 * Above the cost center's limit, the FRM head and then the Direktur approve after the Head Divisi.
 */
export const PAYMENT_STATES = ["draft", "submitted", "returned", "under_review", "pending_approval", "frm_approval", "director_approval", "approved", "scheduled", "paid"] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

/** The status names the team wrote on the flow, with their own explanation. */
export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  draft: "Draft",
  submitted: "Submitted",
  returned: "Returned",
  under_review: "Under Review",
  pending_approval: "Pending Approval",
  frm_approval: "Approval FRM",
  director_approval: "Approval Direktur",
  approved: "Approved",
  scheduled: "Scheduled",
  paid: "Paid",
};
export const PAYMENT_STATE_HINT: Record<PaymentState, string> = {
  draft: "Belum dikirim",
  submitted: "Permohonan dikirim, menunggu persetujuan atasan",
  returned: "Dikembalikan untuk perbaikan",
  under_review: "Sedang diperiksa BFP",
  pending_approval: "Menunggu persetujuan Head Divisi",
  frm_approval: "Di atas limit cost center, menunggu persetujuan Head FRM",
  director_approval: "Di atas limit cost center, menunggu persetujuan Direktur",
  approved: "Disetujui, menunggu dijadwalkan Cash Management",
  scheduled: "Sudah masuk jadwal pembayaran",
  paid: "Pembayaran sudah berhasil dilakukan",
};

export type PaymentAction = "submit" | "approve" | "return" | "verify" | "schedule" | "pay";

export type PaymentKind = "payment" | "cash_advance";
export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = { payment: "Pembayaran", cash_advance: "Cash Advance (CA)" };

export const DOCUMENT_KINDS = ["invoice", "po", "faktur_pajak", "bast", "delivery_note", "cash_advance"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  invoice: "Invoice",
  po: "PO/WO/PKS",
  faktur_pajak: "Faktur Pajak",
  bast: "BAST/Kwitansi",
  delivery_note: "Delivery Note",
  cash_advance: "Permohonan CA",
};

export interface PaymentRequestLike {
  state: PaymentState;
  requesterId: string;
  /** The org unit of the position the request was made from. */
  requesterUnit: string;
  requesterRole: Role;
  entity: string;
  /** The amount (DPP) is above the requester's cost center limit; read when a transition picks the next approver. */
  overLimit?: boolean;
}

export interface PaymentAmounts {
  gross: Money;
  ppn: Money;
  pph: Money;
}

/** Nominal Pembayaran (nett): what leaves the bank. Gross plus PPN, less the PPh withheld for the tax office. */
export function nettAmount({ gross, ppn, pph }: PaymentAmounts): Money {
  if (gross.lte(0)) throw new Error("Nominal harus lebih dari nol");
  if (ppn.isNegative() || pph.isNegative()) throw new Error("Pajak tidak boleh negatif");
  if (pph.gt(gross.plus(ppn))) throw new Error("PPh melebihi tagihan");
  return gross.plus(ppn).minus(pph);
}

/** What a Paid request books as Realisasi: the gross (DPP). PPN masukan is recoverable; PPh withheld is still the company's cost. */
export function realisasiAmount({ gross }: PaymentAmounts): Money {
  return gross;
}

export interface SubmitCheck {
  kind: PaymentKind;
  entity: string | null;
  budgetLineId: string | null;
  description: string;
  gross: Money | null;
  documents: readonly DocumentKind[];
  partnerId?: string | null;
  vendorInvoiceNo?: string | null;
  billDate?: string | null;
}

/** A payment that names a Mitra is that vendor's bill (P1-M3; client decision). */
export const isVendorBill = (r: { kind: PaymentKind; partnerId?: string | null | undefined }): boolean => r.kind === "payment" && !!r.partnerId;

/** PPh withheld on the DPP at a percent rate, to the sen. */
export const pphOf = (dpp: Money, rate: Money): Money => dpp.times(rate).div(100).toDecimalPlaces(2);

/** What is still missing before the request can go to the atasan, in the words the form shows. */
export function readyToSubmit(r: SubmitCheck): string[] {
  const missing: string[] = [];
  if (!r.entity) missing.push("Pilih entitas");
  if (!r.budgetLineId) missing.push("Pilih baris RKA");
  if (!r.description.trim()) missing.push("Isi deskripsi pembayaran");
  if (!r.gross || r.gross.lte(0)) missing.push("Isi nominal");
  if (isVendorBill(r)) {
    if (!r.vendorInvoiceNo?.trim()) missing.push("Isi nomor invoice vendor");
    if (!r.billDate) missing.push("Isi tanggal invoice vendor");
  }
  if (!r.documents.length) missing.push("Lampirkan minimal satu dokumen");
  else if (r.kind === "cash_advance" && !r.documents.includes("cash_advance")) missing.push("Lampirkan Permohonan CA");
  else if (r.kind === "payment" && !r.documents.some((d) => d !== "cash_advance")) {
    missing.push("Lampirkan dokumen tagihan (Invoice, PO/WO/PKS, Faktur Pajak, BAST/Kwitansi atau Delivery Note)");
  }
  return missing;
}

const HEADS: readonly Role[] = ["default_owner", "division_owner", "director"];

const covers = (actor: Actor, entity: string) => actor.entities.includes("*") || actor.entities.includes(entity);

/** Step 2: any head above the requester (Manager, Kepala Divisi or Direktur), never the requester. */
function isAtasan(actor: Actor, r: PaymentRequestLike, org: OrgTree): boolean {
  return HEADS.includes(actor.role) && actor.userId !== r.requesterId && covers(actor, r.entity) && org.isWithin(r.requesterUnit, actor.orgUnit);
}

/**
 * Step 4: the head of the requester's own division. The Direktur approves when the requester heads that division
 * or sits outside any division (staff units under the Direktur).
 */
function divisionApprover(r: PaymentRequestLike, org: OrgTree): { role: "director" } | { role: "division_owner"; unit: string } {
  const division = org.divisionOf(r.requesterUnit);
  const toDirector = !org.divisions().includes(division) || r.requesterRole === "division_owner" || r.requesterRole === "director";
  return toDirector ? { role: "director" } : { role: "division_owner", unit: division };
}

function isDivisionApprover(actor: Actor, r: PaymentRequestLike, org: OrgTree): boolean {
  if (actor.userId === r.requesterId || !covers(actor, r.entity)) return false;
  const who = divisionApprover(r, org);
  return actor.role === who.role && (who.role === "director" || actor.orgUnit === who.unit);
}

/** The approval limit of the nearest cost center at or above the unit (33_Master_CostCenter), or null. */
export function limitFor(unit: string, limits: ReadonlyMap<string, Money>, org: OrgTree): Money | null {
  for (let u: string | null = unit; u; u = org.parent(u)) {
    const limit = limits.get(u);
    if (limit) return limit;
  }
  return null;
}

/** The head of Finance & Risk Management, the second approval above a limit. */
const isFrmHead = (actor: Actor, r: PaymentRequestLike) => actor.role === "division_owner" && actor.orgUnit === "FRM" && actor.userId !== r.requesterId && covers(actor, r.entity);

/** The FRM head's step, unless the request is the FRM head's own. */
const frmStep = (r: PaymentRequestLike): PaymentState => (r.requesterUnit === "FRM" && r.requesterRole === "division_owner" ? "director_approval" : "frm_approval");

/**
 * Where a checked or approved request goes next. Above the limit, a Head Divisi who is not FRM's approves first;
 * FRM's own head and the Direktur act once, in their own steps.
 */
function nextApproval(r: PaymentRequestLike, org: OrgTree): PaymentState | null {
  if (!r.overLimit) return null;
  if (r.state === "pending_approval") return frmStep(r);
  if (r.state !== "under_review") return null;
  const head = divisionApprover(r, org);
  return head.role === "division_owner" && head.unit !== "FRM" ? "pending_approval" : frmStep(r);
}

/** The approvals between BFP's check and Cash Management, in order. */
export function approvalSteps(r: PaymentRequestLike, org: OrgTree): PaymentState[] {
  const steps: PaymentState[] = [];
  let state: PaymentState = "under_review";
  while (state !== "approved") {
    state = nextApproval({ ...r, state }, org) ?? NEXT[state]![state === "under_review" ? "verify" : "approve"]!;
    if (state !== "approved") steps.push(state);
  }
  return steps;
}

/** Scheduling or paying a request one raised: allowed, with a warning (client decision). */
export const paysOwnRequest = (action: PaymentAction, userId: string, r: { requesterId: string }) => (action === "schedule" || action === "pay") && r.requesterId === userId;

const READERS: readonly Role[] = ["finance", "bfp", "cash_manager", "director", "auditor"];

/** Who may open a request: the requester, the heads above them, the Finance side, the Direktur and the Auditor. A draft stays the requester's. */
export function canViewPayment(actor: Actor, r: PaymentRequestLike, org: OrgTree): boolean {
  if (actor.role === "admin") return false;
  if (actor.userId === r.requesterId) return true;
  if (r.state === "draft" || !covers(actor, r.entity)) return false;
  if (READERS.includes(actor.role)) return true;
  return HEADS.includes(actor.role) && org.isWithin(r.requesterUnit, actor.orgUnit);
}

export interface PaymentSeat {
  orgUnit: string;
  role: Role;
  /** The holder, else the pjs; null when the seat is empty. */
  occupant: string | null;
  entities: readonly string[];
}

/** The people a handoff email goes to. An empty seat gets nothing; the app warns Admin separately. */
export function paymentRecipients(to: PaymentRecipient, r: PaymentRequestLike, seats: readonly PaymentSeat[], org: OrgTree): string[] {
  const covering = (s: PaymentSeat) => !!s.occupant && (s.entities.includes("*") || s.entities.includes(r.entity));
  const people = (list: readonly PaymentSeat[]) => [...new Set(list.map((s) => s.occupant!))].sort();
  switch (to) {
    case "requester":
      return [r.requesterId];
    case "bfp":
    case "cash_manager":
      return people(seats.filter((s) => s.role === to && covering(s)));
    case "division_head": {
      const who = divisionApprover(r, org);
      return people(seats.filter((s) => s.role === who.role && (who.role === "director" || s.orgUnit === who.unit) && covering(s) && s.occupant !== r.requesterId));
    }
    case "frm_head":
      return people(seats.filter((s) => s.role === "division_owner" && s.orgUnit === "FRM" && covering(s) && s.occupant !== r.requesterId));
    case "director":
      return people(seats.filter((s) => s.role === "director" && covering(s) && s.occupant !== r.requesterId));
    case "atasan": {
      // The nearest unit above the requester with a head in it, Manager first, then Kepala Divisi, then Direktur.
      for (let unit: string | null = r.requesterUnit; unit; unit = org.parent(unit)) {
        const here = seats.filter((s) => s.orgUnit === unit && HEADS.includes(s.role) && covering(s) && s.occupant !== r.requesterId);
        if (here.length) return people(here);
      }
      return [];
    }
  }
}

export interface VersionLike {
  id: string;
  fiscalYear: number;
  status: "open" | "locked" | "archived";
}

/** The RKA a payment is charged to: the year's locked version, or its open one while the RKA is still being approved. */
export function chargeableVersion(versions: readonly VersionLike[], year: number): { id: string; locked: boolean } | null {
  const ofYear = versions.filter((v) => v.fiscalYear === year);
  const v = ofYear.find((x) => x.status === "locked") ?? ofYear.find((x) => x.status === "open");
  return v ? { id: v.id, locked: v.status === "locked" } : null;
}

/** The actions this actor may take on the request now. */
export function paymentActions(actor: Actor, r: PaymentRequestLike, org: OrgTree): PaymentAction[] {
  switch (r.state) {
    case "draft":
    case "returned":
      return actor.userId === r.requesterId ? ["submit"] : [];
    case "submitted":
      return isAtasan(actor, r, org) ? ["approve", "return"] : [];
    case "under_review":
      return actor.role === "bfp" && covers(actor, r.entity) ? ["verify", "return"] : [];
    case "pending_approval":
      return isDivisionApprover(actor, r, org) ? ["approve", "return"] : [];
    case "frm_approval":
      return isFrmHead(actor, r) ? ["approve", "return"] : [];
    case "director_approval":
      return actor.role === "director" && actor.userId !== r.requesterId && covers(actor, r.entity) ? ["approve", "return"] : [];
    case "approved":
      return actor.role === "cash_manager" && covers(actor, r.entity) ? ["schedule"] : [];
    case "scheduled":
      return actor.role === "cash_manager" && covers(actor, r.entity) ? ["pay"] : [];
    case "paid":
      return [];
  }
}

const NEXT: Partial<Record<PaymentState, Partial<Record<PaymentAction, PaymentState>>>> = {
  draft: { submit: "submitted" },
  returned: { submit: "submitted" },
  submitted: { approve: "under_review", return: "returned" },
  under_review: { verify: "pending_approval", return: "returned" },
  pending_approval: { approve: "approved", return: "returned" },
  frm_approval: { approve: "director_approval", return: "returned" },
  director_approval: { approve: "approved", return: "returned" },
  approved: { schedule: "scheduled" },
  scheduled: { pay: "paid" },
};

export interface PaymentTransitionRequest {
  action: PaymentAction;
  actor: Actor;
  comment?: string;
  /** schedule: the planned payment date (YYYY-MM-DD) and the company bank account it leaves from. */
  scheduledOn?: string;
  bankAccountId?: string;
  /** pay: the date on the bank proof (YYYY-MM-DD), and whether the proof is attached. */
  paidOn?: string;
  proof?: boolean;
}

export interface PaymentTransitionResult {
  from: PaymentState;
  to: PaymentState;
  action: PaymentAction;
  comment?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function paymentTransition(r: PaymentRequestLike, t: PaymentTransitionRequest, org: OrgTree): PaymentTransitionResult {
  const to = NEXT[r.state]?.[t.action];
  if (!to || !paymentActions(t.actor, r, org).includes(t.action)) {
    throw new Error(`Aksi "${t.action}" tidak diizinkan pada status ${PAYMENT_STATE_LABEL[r.state]}`);
  }
  if (t.action === "return" && !t.comment?.trim()) throw new Error("Tulis alasan pengembalian");
  if (t.action === "schedule") {
    if (!t.scheduledOn || !DATE.test(t.scheduledOn)) throw new Error("Isi tanggal jadwal pembayaran");
    if (!t.bankAccountId) throw new Error("Pilih bank asal pembayaran");
  }
  if (t.action === "pay") {
    if (!t.paidOn || !DATE.test(t.paidOn)) throw new Error("Isi tanggal pembayaran");
    if (!t.proof) throw new Error("Lampirkan bukti bayar");
  }
  const step = t.action === "verify" || t.action === "approve" ? nextApproval(r, org) : null;
  return { from: r.state, to: step ?? to, action: t.action, ...(t.comment ? { comment: t.comment } : {}) };
}

export type PaymentTemplate =
  | "payment_submitted"
  | "payment_review"
  | "payment_approval"
  | "payment_approved"
  | "payment_scheduled"
  | "payment_paid"
  | "payment_returned";

/** Who gets the email: resolved to people by the app from the request and the org. */
export type PaymentRecipient = "atasan" | "bfp" | "division_head" | "frm_head" | "director" | "cash_manager" | "requester";

export interface PaymentNotice {
  template: PaymentTemplate;
  to: PaymentRecipient;
  comment?: string;
}

const NOTICE: Record<Exclude<PaymentState, "draft" | "returned">, PaymentNotice> = {
  submitted: { template: "payment_submitted", to: "atasan" },
  under_review: { template: "payment_review", to: "bfp" },
  pending_approval: { template: "payment_approval", to: "division_head" },
  frm_approval: { template: "payment_approval", to: "frm_head" },
  director_approval: { template: "payment_approval", to: "director" },
  approved: { template: "payment_approved", to: "cash_manager" },
  scheduled: { template: "payment_scheduled", to: "requester" },
  paid: { template: "payment_paid", to: "requester" },
};

/** One email per handoff; amounts never go in the email body. */
export function paymentNotice(t: PaymentTransitionResult): PaymentNotice | null {
  if (t.to === "returned") return { template: "payment_returned", to: "requester", comment: t.comment ?? "" };
  return t.to === "draft" ? null : NOTICE[t.to];
}

export interface Headroom {
  /** Plan left after Realisasi and other approved, unpaid requests. */
  remaining: Money;
  /** What is left once this request is paid. */
  after: Money;
  over: boolean;
}

/** The RKA line's room for this request, for BFP's check. Going over is shown, not blocked. */
export function budgetHeadroom(a: { planned: Money; realised: Money; committed: Money; request: Money }): Headroom {
  const remaining = a.planned.minus(a.realised).minus(a.committed);
  const after = remaining.minus(a.request);
  return { remaining, after, over: after.isNegative() };
}

export interface PaidRow {
  paidOn: string;
  description: string;
  nett: Money;
  bank: string;
}

export interface RecapGroup<R extends PaidRow> {
  key: string;
  rows: R[];
  total: Money;
}

/** Rekap Pembayaran per hari or per bulan: Tanggal, Deskripsi, Nominal (nett) and Bank asal. */
export function paymentRecap<R extends PaidRow>(rows: readonly R[], by: "day" | "month") {
  const keyOf = (r: R) => (by === "day" ? r.paidOn : r.paidOn.slice(0, 7));
  const groups = new Map<string, R[]>();
  for (const r of [...rows].sort((a, b) => a.paidOn.localeCompare(b.paidOn))) {
    const k = keyOf(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const banks = new Map<string, Money>();
  for (const r of rows) banks.set(r.bank, (banks.get(r.bank) ?? ZERO).plus(r.nett));
  return {
    groups: [...groups].map(([key, rs]): RecapGroup<R> => ({ key, rows: rs, total: sum(rs.map((r) => r.nett)) })),
    byBank: [...banks].map(([bank, total]) => ({ bank, total })).sort((a, b) => b.total.cmp(a.total) || a.bank.localeCompare(b.bank)),
    total: sum(rows.map((r) => r.nett)),
  };
}

/** The request number on the Formulir: PP/{entity}/{yyyy}/{mm}/{seq}, counted per entity and month. */
export function paymentNumber(entity: string, date: string, seq: number): string {
  return `PP/${entity}/${date.slice(0, 4)}/${date.slice(5, 7)}/${String(seq).padStart(4, "0")}`;
}

export const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;

/** Attachments are PDF or photos of the paper documents, small enough to upload from a phone. */
export function documentProblem(f: { name: string; type: string; size: number }): string | null {
  if (f.size <= 0) return "File kosong.";
  if (!(DOCUMENT_TYPES as readonly string[]).includes(f.type)) return "Hanya PDF, JPG, PNG atau WEBP.";
  if (f.size > DOCUMENT_MAX_BYTES) return "Ukuran file maksimal 4 MB.";
  return null;
}

const DIGIT = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];
const SCALE = ["", "ribu", "juta", "miliar", "triliun", "kuadriliun"];

function underThousand(n: number): string {
  const words: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) words.push(h === 1 ? "seratus" : `${DIGIT[h]} ratus`);
  if (rest === 10) words.push("sepuluh");
  else if (rest === 11) words.push("sebelas");
  else if (rest > 11 && rest < 20) words.push(`${DIGIT[rest - 10]} belas`);
  else {
    const t = Math.floor(rest / 10);
    if (t) words.push(`${DIGIT[t]} puluh`);
    if (rest % 10) words.push(DIGIT[rest % 10]!);
  }
  return words.join(" ");
}

function wholeInWords(digits: string): string {
  const groups: number[] = [];
  for (let end = digits.length; end > 0; end -= 3) groups.unshift(Number(digits.slice(Math.max(0, end - 3), end)));
  const words: string[] = [];
  groups.forEach((g, i) => {
    if (!g) return;
    const scale = SCALE[groups.length - 1 - i]!;
    words.push(g === 1 && scale === "ribu" ? "seribu" : [underThousand(g), scale].filter(Boolean).join(" "));
  });
  return words.join(" ") || "nol";
}

/** Terbilang: the amount in Indonesian words for the Formulir, e.g. "sepuluh juta sembilan ratus ribu rupiah". */
export function terbilang(amount: Money): string {
  const [whole, frac = "00"] = amount.abs().toFixed(2).split(".");
  const sen = Number(frac);
  return `${amount.isNegative() ? "minus " : ""}${wholeInWords(whole!)} rupiah${sen ? ` ${wholeInWords(String(sen))} sen` : ""}`;
}

const isDate = (s: string | undefined): s is string => !!s && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/** The period a Rekap covers: the dates asked for, else this month (per day) or this year (per month). */
export function recapPeriod(by: "day" | "month", from: string | undefined, to: string | undefined, today: string): { from: string; to: string } {
  if (isDate(from) && isDate(to)) return from <= to ? { from, to } : { from: to, to: from };
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  if (by === "month") return { from: `${y}-01-01`, to: `${y}-12-31` };
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}

/** States in which a request already holds part of its RKA line: past the atasan, not yet paid. */
export const COMMITTED_STATES: readonly PaymentState[] = ["under_review", "pending_approval", "frm_approval", "director_approval", "approved", "scheduled"];

export interface LineRealisasi {
  /** DPP of Paid requests within the year. */
  paid: Money;
  /** Per month, January first, by payment date. */
  months: Money[];
  /** DPP of requests past the atasan but not yet paid. */
  committed: Money;
  /** Paid outside the line's year (a late invoice paid in January, say): shown, not booked. */
  outsideYear: Money;
}

/**
 * Realisasi from payments, per RKA line: a Paid request books its DPP in the month it was paid. Requests still in
 * flight are counted apart, so the plan's room can be shown before they are paid.
 */
export function realisasiByLine(
  payments: readonly { lineId: string | null; state: PaymentState; gross: Money; paidOn: string | null }[],
  year?: number,
): Map<string, LineRealisasi> {
  const out = new Map<string, LineRealisasi>();
  const of = (id: string) => {
    let r = out.get(id);
    if (!r) out.set(id, (r = { paid: ZERO, months: Array.from({ length: 12 }, () => ZERO), committed: ZERO, outsideYear: ZERO }));
    return r;
  };
  for (const p of payments) {
    if (!p.lineId) continue;
    if (p.state === "paid" && p.paidOn) {
      const r = of(p.lineId);
      if (year !== undefined && Number(p.paidOn.slice(0, 4)) !== year) {
        r.outsideYear = r.outsideYear.plus(p.gross);
        continue;
      }
      const m = Number(p.paidOn.slice(5, 7)) - 1;
      r.paid = r.paid.plus(p.gross);
      r.months[m] = r.months[m]!.plus(p.gross);
    } else if (COMMITTED_STATES.includes(p.state)) {
      const r = of(p.lineId);
      r.committed = r.committed.plus(p.gross);
    }
  }
  return out;
}
