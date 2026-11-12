import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { canViewPayment, DOCUMENT_LABEL, PAYMENT_KIND_LABEL, PAYMENT_STATE_LABEL, ROLE_LABEL } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { asLike, formatDate } from "@/lib/payment";
import { loadOrg } from "@/lib/workflow";
import { PaymentFormulir, type FormulirSign } from "@/components/erp/payment-formulir";
import { PrintButton } from "@/components/erp/print-button";

export const metadata: Metadata = { title: "Formulir Permohonan Pembayaran" };

const WHEN = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** The Formulir on its own page, without the app shell, so it prints on one A4 sheet. */
export default async function FormulirPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const [r] = await db.select().from(schema.paymentRequest).where(eq(schema.paymentRequest.id, id));
  if (!r || !r.number || !canViewPayment(user.actor, asLike(r), await loadOrg())) notFound();

  const [[entity], [requester], docs, events, [line], [bank]] = await Promise.all([
    db.select().from(schema.companyEntity).where(eq(schema.companyEntity.code, r.entityCode)),
    db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, r.requesterId)),
    db.select({ kind: schema.paymentDocument.kind }).from(schema.paymentDocument).where(eq(schema.paymentDocument.requestId, id)),
    db
      .select({ event: schema.paymentEvent, name: schema.user.name })
      .from(schema.paymentEvent)
      .innerJoin(schema.user, eq(schema.user.id, schema.paymentEvent.actorUserId))
      .where(eq(schema.paymentEvent.requestId, id))
      .orderBy(asc(schema.paymentEvent.createdAt)),
    r.budgetLineId
      ? db
          .select({ line: schema.budgetLine, coaName: schema.coaAccount.name, year: schema.budgetVersion.fiscalYear })
          .from(schema.budgetLine)
          .innerJoin(schema.coaAccount, eq(schema.coaAccount.code, schema.budgetLine.coaCode))
          .innerJoin(schema.budgetVersion, eq(schema.budgetVersion.id, schema.budgetLine.versionId))
          .where(eq(schema.budgetLine.id, r.budgetLineId))
      : Promise.resolve([]),
    r.bankAccountId ? db.select().from(schema.companyBankAccount).where(eq(schema.companyBankAccount.id, r.bankAccountId)) : Promise.resolve([]),
  ]);

  // A return restarts the approvals: only what happened since the last one counts.
  const lastReturn = events.map((e) => e.event.action).lastIndexOf("return");
  const current = events.slice(lastReturn + 1);
  const find = (match: (e: (typeof events)[number]["event"]) => boolean) => [...current].reverse().find((e) => match(e.event));
  const sign = (step: string, fallbackRole: string, e: ReturnType<typeof find>): FormulirSign => ({
    step,
    name: e?.name ?? null,
    role: e ? ROLE_LABEL[e.event.actorRole] : fallbackRole,
    at: e ? WHEN.format(e.event.createdAt) : null,
  });
  const signs = [
    sign("Pemohon", "Pemohon", find((e) => e.action === "submit")),
    sign("Atasan", "Atasan", find((e) => e.action === "approve" && e.fromState === "submitted")),
    sign("BFP", ROLE_LABEL.bfp, find((e) => e.action === "verify")),
    sign("Head Divisi", "Head Divisi", find((e) => e.action === "approve" && e.fromState === "pending_approval")),
    sign("Cash Management", ROLE_LABEL.cash_manager, find((e) => e.action === "pay") ?? find((e) => e.action === "schedule")),
  ];

  return (
    <main className="min-h-full bg-neutral-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[190mm] items-center justify-between gap-3 px-2 print:hidden">
        <Link href={`/pembayaran/${r.id}`} className="text-sm text-neutral-600 hover:text-neutral-900">
          ← Kembali ke permintaan
        </Link>
        <PrintButton />
      </div>
      <PaymentFormulir
        d={{
          entityName: entity?.name ?? r.entityCode,
          entityCode: r.entityCode,
          number: r.number,
          kind: PAYMENT_KIND_LABEL[r.kind],
          date: formatDate((r.submittedAt ?? r.createdAt).toISOString().slice(0, 10)),
          status: PAYMENT_STATE_LABEL[r.state],
          requester: requester?.name ?? "",
          requesterUnit: r.requesterUnit,
          project: r.project,
          line: line ? `${line.line.coaCode} · ${line.coaName}${line.line.item || line.line.basis ? ` · ${line.line.item || line.line.basis}` : ""} (${line.line.ownerUnit}, RKA ${line.year})` : null,
          description: r.description,
          payee: r.payeeName,
          payeeAccount: [r.payeeBank, r.payeeAccount].filter(Boolean).join(" ") || null,
          dueOn: r.dueOn ? formatDate(r.dueOn) : null,
          gross: r.gross,
          ppn: r.ppn,
          pph: r.pph,
          documents: [...new Set(docs.filter((x) => x.kind !== "proof").map((x) => DOCUMENT_LABEL[x.kind as keyof typeof DOCUMENT_LABEL]))],
          bank: bank ? `${bank.bankName} ${bank.accountNumber} · ${bank.accountName}` : null,
          scheduledOn: r.scheduledOn ? formatDate(r.scheduledOn) : null,
          paidOn: r.paidOn ? formatDate(r.paidOn) : null,
          signs,
        }}
      />
    </main>
  );
}
