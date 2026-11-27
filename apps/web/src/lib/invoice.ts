import "server-only";
import { and, asc, eq, inArray, like, ne, sql } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { INVOICE_STATE_LABEL, can, invoiceNumber, invoiceStep, type InvoiceAction, type InvoiceStepProblem } from "@estrada/domain";
import { enqueueEmail } from "./email/outbox";
import { env } from "./env";
import { assertOpenPeriod } from "./period";
import type { CurrentUser } from "./session";
import { loadOrg, WorkflowError } from "./workflow";

export type InvoiceRow = typeof schema.invoice.$inferSelect;

export const STEP_MESSAGE: Record<InvoiceStepProblem, string> = {
  not_allowed: "Anda tidak berwenang atas langkah ini.",
  wrong_state: "Status invoice sudah berubah. Muat ulang halaman.",
  own_invoice: "Pembuat, validator pajak dan penyetuju invoice harus orang yang berbeda.",
  note_required: "Tulis alasannya.",
};

export const covers = (user: CurrentUser, entity: string) => user.actor.entities.includes("*") || user.actor.entities.includes(entity);

/** Billing termin of deals with a project that no live invoice has taken (client decision). */
export async function billableTermins() {
  const [rows, taken] = await Promise.all([
    db
      .select({ termin: schema.billingTermin, deal: schema.pipelineDeal, projectId: schema.project.id })
      .from(schema.billingTermin)
      .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.billingTermin.dealId))
      .innerJoin(schema.project, eq(schema.project.dealId, schema.pipelineDeal.id))
      .orderBy(asc(schema.billingTermin.plannedOn), asc(schema.pipelineDeal.project), asc(schema.billingTermin.no)),
    db.select({ dealId: schema.invoice.dealId, no: schema.invoice.terminNo }).from(schema.invoice).where(ne(schema.invoice.state, "cancelled")),
  ]);
  const used = new Set(taken.map((t) => `${t.dealId}|${t.no}`));
  return rows
    .filter((r) => !used.has(`${r.deal.id}|${r.termin.no}`))
    .map((r) => ({
      dealId: r.deal.id,
      no: r.termin.no,
      description: r.termin.description,
      amount: r.termin.amount,
      plannedOn: r.termin.plannedOn,
      project: r.deal.project,
      projectId: r.projectId,
      entity: r.deal.entityCode,
      customerId: r.deal.customerId,
      customer: r.deal.customer,
    }));
}

/** Everyone sitting in a unit's seats, holder or pjs. */
async function seatUsers(unit: string, roles: readonly ("requestor" | "default_owner" | "division_owner")[], except: string) {
  const seats = await db.select().from(schema.position).where(and(like(schema.position.orgUnitCode, `${unit}%`), inArray(schema.position.role, [...roles])));
  const inUnit = seats.filter((s) => s.orgUnitCode === unit || s.orgUnitCode.startsWith(`${unit}-`));
  return [...new Set(inUnit.flatMap((s) => [s.holderUserId, s.actingUserId]).filter((id): id is string => !!id && id !== except))];
}

/** One email per handoff, never with an amount. */
export async function tellInvoice(r: InvoiceRow, template: "invoice_created" | "invoice_validated" | "invoice_issued" | "invoice_returned", actorId: string) {
  const ids =
    template === "invoice_created"
      ? await seatUsers("FRM-FIN-ATM", ["requestor", "default_owner", "division_owner"], actorId)
      : template === "invoice_validated"
        ? // The Finance Controller's seat is the FRM division's own, not a department under it.
          (await db.select().from(schema.position).where(and(eq(schema.position.orgUnitCode, "FRM"), eq(schema.position.role, "division_owner"))))
            .flatMap((s) => [s.holderUserId, s.actingUserId])
            .filter((id): id is string => !!id && id !== actorId)
        : [r.createdBy];
  if (!ids.length) return;
  const [users, [deal], [customer]] = await Promise.all([
    db.select().from(schema.user).where(inArray(schema.user.id, ids)),
    db.select({ project: schema.pipelineDeal.project }).from(schema.pipelineDeal).where(eq(schema.pipelineDeal.id, r.dealId)),
    db.select({ name: schema.customer.legalName }).from(schema.customer).where(eq(schema.customer.id, r.customerId)),
  ]);
  const link = `/invoice/${r.id}`;
  for (const u of users) {
    await enqueueEmail({
      template,
      to: { userId: u.id, email: u.email, name: u.name },
      payload: { url: `${env.APP_URL}${link}`, entity: r.entityCode, customer: customer?.name ?? "", project: deal?.project ?? "", number: r.number ?? "", ...(r.note ? { comment: r.note } : {}) },
    });
    await db.insert(schema.notification).values({ userId: u.id, template, link });
  }
}

/** The one place an invoice changes state: the rules, the period, the number, the audit trail and the email together. */
export async function applyInvoiceStep(user: CurrentUser, id: string, action: InvoiceAction, note: string) {
  const org = await loadOrg();
  const result = await db.transaction(async (tx) => {
    const [r] = await tx.select().from(schema.invoice).where(eq(schema.invoice.id, id)).for("update");
    if (!r || !covers(user, r.entityCode)) throw new WorkflowError("Invoice tidak ditemukan.");
    const step = invoiceStep(r.state, action, {
      actorId: user.id,
      createdBy: r.createdBy,
      validatedBy: r.validatedBy,
      mayCreate: can(user.actor, "invoice.create", null, org),
      mayApprove: can(user.actor, "invoice.approve", null, org),
      note,
    });
    if ("problem" in step) throw new WorkflowError(STEP_MESSAGE[step.problem]);

    const patch: Partial<typeof schema.invoice.$inferInsert> = { state: step.to, updatedAt: new Date() };
    if (action === "validate") patch.validatedBy = user.id;
    if (action === "approve") patch.approvedBy = user.id;
    if (action === "return") Object.assign(patch, { validatedBy: null, approvedBy: null, note: note.trim() });
    if (action === "cancel") patch.note = note.trim();
    let warning: string | null = null;
    if (action === "issue") {
      if (!r.bankAccountId) throw new WorkflowError("Pilih rekening bank pada invoice sebelum menerbitkan.");
      warning = await assertOpenPeriod(tx, r.entityCode, r.invoicedOn);
      const prefix = invoiceNumber(r.entityCode, r.invoicedOn, 0).slice(0, -4);
      // Held to the end of the transaction, so two invoices cannot take the same number.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefix}))`);
      const taken = await tx.select({ number: schema.invoice.number }).from(schema.invoice).where(like(schema.invoice.number, `${prefix}%`));
      const last = Math.max(0, ...taken.map((t) => Number(t.number!.slice(prefix.length))));
      Object.assign(patch, { number: invoiceNumber(r.entityCode, r.invoicedOn, last + 1), issuedAt: new Date() });
    }

    await tx.update(schema.invoice).set(patch).where(eq(schema.invoice.id, r.id));
    await tx.insert(schema.auditLog).values({
      actorUserId: user.id,
      action: `invoice.${action}`,
      subjectType: "invoice",
      subjectId: r.id,
      before: { state: r.state },
      after: { state: step.to, ...(patch.number ? { number: patch.number } : {}), ...(note.trim() ? { note: note.trim() } : {}) },
    });
    return { invoice: { ...r, ...patch } as InvoiceRow, warning };
  });

  const template = action === "validate" ? "invoice_validated" : action === "issue" ? "invoice_issued" : action === "return" ? "invoice_returned" : null;
  if (template) await tellInvoice(result.invoice, template, user.id);
  return { state: INVOICE_STATE_LABEL[result.invoice.state], number: result.invoice.number, warning: result.warning };
}

/** Revenue accounts an invoice may be booked to. */
export async function revenueAccounts() {
  const rows = await db.select().from(schema.coaAccount).orderBy(schema.coaAccount.code);
  return rows.filter((a) => a.category === "Revenue" && a.postable && a.active).map((a) => ({ code: a.code, label: `${a.code} · ${a.name}` }));
}
