import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, like, ne, sql } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  budgetHeadroom,
  canViewPayment,
  chargeableVersion,
  money,
  paymentActions,
  paymentNotice,
  paymentNumber,
  paymentRecipients,
  paymentTransition,
  readyToSubmit,
  realisasiByLine,
  sum,
  ZERO,
  type Actor,
  type DocumentKind,
  type LineRealisasi,
  type PaymentAction,
  type PaymentRequestLike,
  type PaymentSeat,
} from "@estrada/domain";
import { env } from "./env";
import { enqueueEmail } from "./email/outbox";
import { putFile } from "./storage";
import { loadOrg, WorkflowError } from "./workflow";

export const paymentLink = (id: string) => `/pembayaran/${id}`;

type RequestRow = typeof schema.paymentRequest.$inferSelect;

export const asLike = (r: Pick<RequestRow, "state" | "requesterId" | "requesterUnit" | "requesterRole" | "entityCode">): PaymentRequestLike => ({
  state: r.state,
  requesterId: r.requesterId,
  requesterUnit: r.requesterUnit,
  requesterRole: r.requesterRole,
  entity: r.entityCode,
});

/** Today in Jakarta as YYYY-MM-DD: request numbers and default dates follow the office calendar, not UTC. */
export const todayJakarta = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

/** Every seat with its occupant (holder, else pjs) and entity scope, for routing emails. */
export async function loadSeats(): Promise<PaymentSeat[]> {
  const [positions, scopes] = await Promise.all([db.select().from(schema.position), db.select().from(schema.positionEntityScope)]);
  return positions.map((p) => ({
    orgUnit: p.orgUnitCode,
    role: p.role,
    occupant: p.holderUserId ?? p.actingUserId,
    entities: scopes.filter((s) => s.positionId === p.id).map((s) => s.entityCode),
  }));
}

/** Stores one attachment and records it. Callers check permission first. */
export async function storeDocument(
  tx: Pick<typeof db, "insert">,
  requestId: string,
  kind: DocumentKind | "proof",
  file: File,
  userId: string,
) {
  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "dokumen";
  const key = `${requestId}/${randomUUID()}-${safe}`;
  await putFile(key, new Uint8Array(await file.arrayBuffer()), file.type);
  await tx.insert(schema.paymentDocument).values({
    requestId,
    kind,
    fileName: file.name.slice(0, 200),
    storagePath: key,
    contentType: file.type,
    size: file.size,
    uploadedBy: userId,
  });
}

/** The next PP number for the entity and month, from the highest already given. */
async function nextNumber(tx: Pick<typeof db, "select">, entity: string, date: string) {
  const prefix = paymentNumber(entity, date, 0).slice(0, -4);
  const [row] = await tx
    .select({ max: sql<string | null>`max(${schema.paymentRequest.number})` })
    .from(schema.paymentRequest)
    .where(like(schema.paymentRequest.number, `${prefix}%`));
  const last = row?.max ? Number(row.max.slice(-4)) : 0;
  return paymentNumber(entity, date, last + 1);
}

export interface TransitionExtra {
  comment?: string;
  scheduledOn?: string;
  bankAccountId?: string;
  paidOn?: string;
  proof?: File;
}

/**
 * The one place a Permintaan Pembayaran changes status: domain rules, the history, the audit trail and one email to
 * whoever acts next, together. Emails go out after the transaction commits and never carry an amount.
 */
export async function applyPaymentTransition(actor: Actor, requestId: string, action: PaymentAction, extra: TransitionExtra = {}) {
  const org = await loadOrg();
  const result = await db.transaction(async (tx) => {
    const [r] = await tx.select().from(schema.paymentRequest).where(eq(schema.paymentRequest.id, requestId)).for("update");
    if (!r) throw new WorkflowError("Permintaan tidak ditemukan.");

    if (action === "submit") {
      const docs = await tx.select({ kind: schema.paymentDocument.kind }).from(schema.paymentDocument).where(eq(schema.paymentDocument.requestId, r.id));
      const missing = readyToSubmit({
        kind: r.kind,
        entity: r.entityCode,
        budgetLineId: r.budgetLineId,
        description: r.description,
        gross: money(r.gross),
        documents: docs.map((d) => d.kind).filter((k): k is DocumentKind => k !== "proof"),
      });
      if (missing.length) throw new WorkflowError(`Belum lengkap: ${missing.join(", ")}.`);
    }
    if (action === "schedule" && extra.bankAccountId) {
      const [bank] = await tx.select().from(schema.companyBankAccount).where(eq(schema.companyBankAccount.id, extra.bankAccountId));
      if (!bank || !bank.active || bank.entityCode !== r.entityCode) throw new WorkflowError("Pilih rekening aktif milik entitas permintaan ini.");
    }

    let t;
    try {
      t = paymentTransition(asLike(r), { action, actor, ...extra, proof: !!extra.proof }, org);
    } catch (e) {
      throw new WorkflowError((e as Error).message);
    }

    const now = new Date();
    const patch: Partial<typeof schema.paymentRequest.$inferInsert> = { state: t.to, updatedAt: now };
    if (action === "submit") {
      patch.submittedAt = now;
      if (!r.number) patch.number = await nextNumber(tx, r.entityCode, todayJakarta());
    }
    if (action === "schedule") Object.assign(patch, { scheduledOn: extra.scheduledOn, bankAccountId: extra.bankAccountId });
    if (action === "pay") {
      patch.paidOn = extra.paidOn!;
      await storeDocument(tx, r.id, "proof", extra.proof!, actor.userId);
    }

    await tx.update(schema.paymentRequest).set(patch).where(eq(schema.paymentRequest.id, r.id));
    await tx.insert(schema.paymentEvent).values({
      requestId: r.id,
      fromState: t.from,
      toState: t.to,
      action,
      actorUserId: actor.userId,
      actorRole: actor.role,
      comment: extra.comment?.trim() || null,
    });
    await tx.insert(schema.auditLog).values({
      actorUserId: actor.userId,
      action: `payment.${action}`,
      subjectType: "payment_request",
      subjectId: r.id,
      before: { state: t.from },
      after: { state: t.to, ...(patch.number ? { number: patch.number } : {}), ...(extra.scheduledOn ? { scheduledOn: extra.scheduledOn, bankAccountId: extra.bankAccountId } : {}), ...(extra.paidOn ? { paidOn: extra.paidOn } : {}) },
    });
    return { t, request: { ...r, ...patch } as RequestRow };
  });

  await notifyPayment(result.request, result.t, org);
  return result.t;
}

async function notifyPayment(r: RequestRow, t: ReturnType<typeof paymentTransition>, org: Awaited<ReturnType<typeof loadOrg>>) {
  const n = paymentNotice(t);
  if (!n) return;
  const ids = paymentRecipients(n.to, asLike(r), await loadSeats(), org);
  if (!ids.length) return;
  const [users, [requester]] = await Promise.all([
    db.select().from(schema.user).where(inArray(schema.user.id, ids)),
    db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, r.requesterId)),
  ]);
  const link = paymentLink(r.id);
  const date = t.to === "scheduled" ? r.scheduledOn : t.to === "paid" ? r.paidOn : null;
  for (const u of users) {
    await enqueueEmail({
      template: n.template,
      to: { userId: u.id, email: u.email, name: u.name },
      payload: {
        url: `${env.APP_URL}${link}`,
        number: r.number ?? "",
        entity: r.entityCode,
        requester: requester?.name ?? "",
        ...(date ? { date: formatDate(date) } : {}),
        ...(n.comment ? { comment: n.comment } : {}),
      },
    });
    await db.insert(schema.notification).values({ userId: u.id, template: n.template, link });
  }
}

const DATE_FMT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
/** A YYYY-MM-DD date as "20 November 2026". */
export const formatDate = (d: string) => DATE_FMT.format(new Date(`${d}T00:00:00Z`));

/** The RKA line's plan, what payments have used, and what other requests in flight hold, for BFP's check. */
export async function lineHeadroom(lineId: string, requestId: string, gross: string) {
  const [amounts, others] = await Promise.all([
    db.select({ amount: schema.budgetLineAmount.amount }).from(schema.budgetLineAmount).where(eq(schema.budgetLineAmount.lineId, lineId)),
    db
      .select({ lineId: schema.paymentRequest.budgetLineId, gross: schema.paymentRequest.gross, state: schema.paymentRequest.state, paidOn: schema.paymentRequest.paidOn })
      .from(schema.paymentRequest)
      .where(and(eq(schema.paymentRequest.budgetLineId, lineId), ne(schema.paymentRequest.id, requestId))),
  ]);
  const planned = sum(amounts.map((a) => money(a.amount)));
  const used = realisasiByLine(others.map((o) => ({ ...o, gross: money(o.gross) }))).get(lineId);
  const realised = used ? used.paid.plus(used.outsideYear) : ZERO;
  const committed = used?.committed ?? ZERO;
  return { planned, realised, committed, ...budgetHeadroom({ planned, realised, committed, request: money(gross) }) };
}

/** Realisasi from payments for these RKA lines, booked in the year given. */
export async function paymentRealisasi(lineIds: string[], year: number) {
  if (!lineIds.length) return new Map<string, LineRealisasi>();
  const rows = await db
    .select({ lineId: schema.paymentRequest.budgetLineId, gross: schema.paymentRequest.gross, state: schema.paymentRequest.state, paidOn: schema.paymentRequest.paidOn })
    .from(schema.paymentRequest)
    .where(inArray(schema.paymentRequest.budgetLineId, lineIds));
  return realisasiByLine(rows.map((r) => ({ ...r, gross: money(r.gross) })), year);
}

/** Requests the actor can act on now, newest first. */
export async function paymentQueue(actor: Actor) {
  const org = await loadOrg();
  const rows = await db
    .select()
    .from(schema.paymentRequest)
    .where(inArray(schema.paymentRequest.state, ["submitted", "under_review", "pending_approval", "approved", "scheduled"]))
    .orderBy(asc(schema.paymentRequest.submittedAt));
  return rows.filter((r) => paymentActions(actor, asLike(r), org).length);
}

/** Rows for PaymentTable, with requester names. */
export async function paymentRows(rows: RequestRow[]) {
  const ids = [...new Set(rows.map((r) => r.requesterId))];
  const users = ids.length ? await db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).where(inArray(schema.user.id, ids)) : [];
  const name = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    date: (r.submittedAt ?? r.createdAt).toISOString().slice(0, 10),
    description: r.description,
    entity: r.entityCode,
    requester: name.get(r.requesterId) ?? "",
    nett: money(r.gross).plus(money(r.ppn)).minus(money(r.pph)).toFixed(2),
    state: r.state,
  }));
}

/** Every request this actor may open: their own (drafts included) and, for approvers and readers, the rest in scope. */
export async function visiblePayments(actor: Actor) {
  const org = await loadOrg();
  const rows = await db.select().from(schema.paymentRequest).orderBy(sql`coalesce(${schema.paymentRequest.submittedAt}, ${schema.paymentRequest.createdAt}) desc`);
  return rows.filter((r) => canViewPayment(actor, asLike(r), org));
}

/**
 * The RKA lines a requester may charge: the header year's locked RKA (its open one while still in approval), within the
 * entities of their position, and owned or requested by their division. A position at company level sees every line.
 */
export async function lineOptions(actor: Actor, year: number | null) {
  if (year === null) return { lines: [], note: "Belum ada RKA." };
  const org = await loadOrg();
  const versions = await db.select({ id: schema.budgetVersion.id, fiscalYear: schema.budgetVersion.fiscalYear, status: schema.budgetVersion.status }).from(schema.budgetVersion);
  const version = chargeableVersion(versions, year);
  if (!version) return { lines: [], note: `RKA ${year} belum ada.` };
  const rows = await db
    .select({ line: schema.budgetLine, coaName: schema.coaAccount.name })
    .from(schema.budgetLine)
    .innerJoin(schema.coaAccount, eq(schema.coaAccount.code, schema.budgetLine.coaCode))
    .where(eq(schema.budgetLine.versionId, version.id))
    .orderBy(asc(schema.budgetLine.coaCode), asc(schema.budgetLine.ownerUnit));
  const division = org.divisionOf(actor.orgUnit);
  const companyWide = org.parent(actor.orgUnit) === null;
  const covers = (e: string) => actor.entities.includes("*") || actor.entities.includes(e);
  const mine = (unit: string) => companyWide || org.isWithin(unit, division);
  return {
    note: version.locked ? `Dari RKA ${year}.` : `Dari RKA ${year} yang belum dikunci.`,
    lines: rows
      .filter((r) => covers(r.line.entityCode) && (mine(r.line.ownerUnit) || mine(r.line.requestorUnit)))
      .map((r) => ({
        id: r.line.id,
        entity: r.line.entityCode,
        label: [r.line.coaCode, r.coaName, r.line.item || r.line.basis].filter(Boolean).join(" · ") + ` (${r.line.ownerUnit})`,
        versionId: version.id,
      })),
  };
}
