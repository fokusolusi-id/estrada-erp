import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  canViewPayment,
  formatIdr,
  money,
  PAYMENT_KIND_LABEL,
  PAYMENT_STATE_LABEL,
  paymentActions,
  readyToSubmit,
  ROLE_LABEL,
  type DocumentKind,
} from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { activeYear } from "@/lib/fiscal-year";
import { asLike, formatDate, lineHeadroom, lineOptions, todayJakarta } from "@/lib/payment";
import { loadOrg } from "@/lib/workflow";
import { PaymentStatusBadge, PaymentStepper } from "@/components/erp/payment-status";
import { PaymentForm } from "@/components/erp/payment-form";
import { PaymentDocuments } from "@/components/erp/payment-documents";
import { PaymentActions } from "@/components/erp/payment-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { removeDocument, runPaymentAction, savePayment, uploadDocument } from "../actions";

export const metadata: Metadata = { title: "Permintaan Pembayaran" };

const WHEN = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const DID: Record<string, string> = {
  submit: "Mengirim ke atasan",
  approve: "Menyetujui",
  return: "Mengembalikan",
  verify: "Memeriksa dan meneruskan",
  schedule: "Menjadwalkan",
  pay: "Membayar",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children || <span className="text-muted-foreground">–</span>}</dd>
    </div>
  );
}

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const org = await loadOrg();
  const [r] = await db.select().from(schema.paymentRequest).where(eq(schema.paymentRequest.id, id));
  if (!r || !canViewPayment(user.actor, asLike(r), org)) notFound();

  const [docs, events, [requester], [line], banks, [bank]] = await Promise.all([
    db.select().from(schema.paymentDocument).where(eq(schema.paymentDocument.requestId, id)).orderBy(asc(schema.paymentDocument.createdAt)),
    db
      .select({ event: schema.paymentEvent, name: schema.user.name })
      .from(schema.paymentEvent)
      .innerJoin(schema.user, eq(schema.user.id, schema.paymentEvent.actorUserId))
      .where(eq(schema.paymentEvent.requestId, id))
      .orderBy(asc(schema.paymentEvent.createdAt)),
    db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, r.requesterId)),
    r.budgetLineId
      ? db
          .select({ line: schema.budgetLine, coaName: schema.coaAccount.name, year: schema.budgetVersion.fiscalYear })
          .from(schema.budgetLine)
          .innerJoin(schema.coaAccount, eq(schema.coaAccount.code, schema.budgetLine.coaCode))
          .innerJoin(schema.budgetVersion, eq(schema.budgetVersion.id, schema.budgetLine.versionId))
          .where(eq(schema.budgetLine.id, r.budgetLineId))
      : Promise.resolve([]),
    db.select().from(schema.companyBankAccount).where(eq(schema.companyBankAccount.entityCode, r.entityCode)).orderBy(asc(schema.companyBankAccount.bankName)),
    r.bankAccountId ? db.select().from(schema.companyBankAccount).where(eq(schema.companyBankAccount.id, r.bankAccountId)) : Promise.resolve([]),
  ]);

  const actions = paymentActions(user.actor, asLike(r), org);
  const editable = r.requesterId === user.id && (r.state === "draft" || r.state === "returned");
  const gross = money(r.gross);
  const nett = gross.plus(money(r.ppn)).minus(money(r.pph));
  const docKinds = docs.map((d) => d.kind).filter((k): k is DocumentKind => k !== "proof");
  const missing = editable ? readyToSubmit({ kind: r.kind, entity: r.entityCode, budgetLineId: r.budgetLineId, description: r.description, gross, documents: docKinds }) : [];
  const lastReturn = [...events].reverse().find((e) => e.event.toState === "returned");
  const headroom = r.budgetLineId && r.state !== "draft" ? await lineHeadroom(r.budgetLineId, r.id, r.gross) : null;
  const lineLabel = line ? `${line.line.coaCode} · ${line.coaName}${line.line.item || line.line.basis ? ` · ${line.line.item || line.line.basis}` : ""} (${line.line.ownerUnit}, RKA ${line.year})` : null;
  const options = editable ? await lineOptions(user.actor, await activeYear()) : null;
  const covers = (e: string) => user.actor.entities.includes("*") || user.actor.entities.includes(e);
  const entityChoices = !editable
    ? []
    : r.number
      ? [r.entityCode]
      : (await db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)))
          .map((e) => e.code)
          .filter(covers);
  const bankLabel = (b: typeof schema.companyBankAccount.$inferSelect) => `${b.bankName} ${b.accountNumber} · ${b.accountName}`;

  return (
    <div className="grid max-w-5xl gap-6">
      <Link href="/pembayaran" className="text-muted-foreground hover:text-foreground w-fit text-sm">
        ← Permintaan Pembayaran
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
            <span className="font-mono">{r.number ?? "Draft"}</span>
            <PaymentStatusBadge state={r.state} />
          </h1>
          <p className="text-muted-foreground text-sm">
            {PAYMENT_KIND_LABEL[r.kind]} · {r.entityCode} · diajukan oleh {requester?.name} ({ROLE_LABEL[r.requesterRole]}, {r.requesterUnit})
          </p>
        </div>
        {r.number ? (
          <Link href={`/cetak/pembayaran/${r.id}`} target="_blank" className="text-primary text-sm hover:underline">
            Formulir Permohonan Pembayaran
          </Link>
        ) : null}
      </div>

      <Card>
        <CardContent>
          <PaymentStepper state={r.state} returnedFrom={lastReturn?.event.fromState ?? null} />
        </CardContent>
      </Card>

      {r.state === "returned" && lastReturn ? (
        <div className="border-destructive/30 bg-destructive/5 rounded-lg border px-4 py-3 text-sm" data-testid="payment-returned">
          <p className="font-medium">
            Dikembalikan oleh {lastReturn.name} ({ROLE_LABEL[lastReturn.event.actorRole]})
          </p>
          <p>{lastReturn.event.comment}</p>
        </div>
      ) : null}

      {actions.length ? (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Tindakan Anda</CardTitle>
            <CardDescription>{actions.includes("submit") ? "Lengkapi isian dan dokumen, lalu kirim ke atasan." : "Permintaan ini menunggu Anda."}</CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentActions
              requestId={r.id}
              actions={actions}
              banks={banks.filter((b) => b.active).map((b) => ({ id: b.id, label: bankLabel(b) }))}
              today={todayJakarta()}
              missing={missing}
              onRun={runPaymentAction}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Permintaan</CardTitle>
        </CardHeader>
        <CardContent>
          {editable && options ? (
            <PaymentForm
              initial={{
                kind: r.kind,
                entity: r.entityCode,
                project: r.project ?? "",
                budgetLineId: r.budgetLineId ?? "",
                description: r.description,
                payeeName: r.payeeName ?? "",
                payeeBank: r.payeeBank ?? "",
                payeeAccount: r.payeeAccount ?? "",
                dueOn: r.dueOn ?? "",
                gross: gross.isZero() ? "" : formatIdr(gross).replace("Rp ", ""),
                ppn: money(r.ppn).isZero() ? "" : formatIdr(money(r.ppn)).replace("Rp ", ""),
                pph: money(r.pph).isZero() ? "" : formatIdr(money(r.pph)).replace("Rp ", ""),
              }}
              entities={entityChoices}
              lines={options.lines}
              versionNote={options.note}
              onSave={savePayment.bind(null, r.id)}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Deskripsi">{r.description}</Field>
              <Field label="Proyek / perusahaan">{r.project}</Field>
              <Field label="Baris RKA">{lineLabel}</Field>
              <Field label="Dibayar kepada">{[r.payeeName, r.payeeBank, r.payeeAccount].filter(Boolean).join(" · ")}</Field>
              <Field label="Jatuh tempo">{r.dueOn ? formatDate(r.dueOn) : null}</Field>
              <Field label="Nominal (DPP)">
                <span className="tabular">{formatIdr(gross)}</span>
              </Field>
              <Field label="PPN">
                <span className="tabular">{formatIdr(money(r.ppn))}</span>
              </Field>
              <Field label="PPh dipotong">
                <span className="tabular">{formatIdr(money(r.pph))}</span>
              </Field>
              <Field label="Nominal Pembayaran (nett)">
                <span className="tabular font-semibold" data-testid="payment-nett-value">
                  {formatIdr(nett)}
                </span>
              </Field>
              <Field label="Bank asal">{bank ? bankLabel(bank) : null}</Field>
              <Field label="Jadwal bayar">{r.scheduledOn ? formatDate(r.scheduledOn) : null}</Field>
              <Field label="Tanggal bayar">{r.paidOn ? formatDate(r.paidOn) : null}</Field>
            </dl>
          )}
        </CardContent>
      </Card>

      {headroom ? (
        <Card data-testid="payment-headroom">
          <CardHeader>
            <CardTitle>Sisa anggaran baris RKA</CardTitle>
            <CardDescription>Rencana setahun dikurangi yang sudah dibayar dan permintaan lain yang sedang berjalan.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-4">
              <Field label="Rencana RKA">
                <span className="tabular">{formatIdr(headroom.planned)}</span>
              </Field>
              <Field label="Sudah dibayar">
                <span className="tabular">{formatIdr(headroom.realised)}</span>
              </Field>
              <Field label="Sedang berjalan">
                <span className="tabular">{formatIdr(headroom.committed)}</span>
              </Field>
              <Field label="Sisa setelah permintaan ini">
                <span className={`tabular font-semibold ${headroom.over ? "text-destructive" : ""}`}>{formatIdr(headroom.after)}</span>
                {headroom.over ? <span className="text-destructive block text-xs">Melebihi anggaran baris ini</span> : null}
              </Field>
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Dokumen</CardTitle>
          <CardDescription>Invoice, PO/WO/PKS, Faktur Pajak, BAST/Kwitansi, Delivery Note, atau Permohonan CA untuk Cash Advance.</CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentDocuments
            requestId={r.id}
            docs={docs.map((d) => ({ id: d.id, kind: d.kind, fileName: d.fileName, size: d.size }))}
            editable={editable}
            onUpload={uploadDocument}
            onRemove={removeDocument}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length ? (
            <ol className="grid gap-3" aria-label="Riwayat permintaan">
              {events.map(({ event: e, name }) => (
                <li key={e.id} className="grid gap-0.5 border-l-2 pl-3 text-sm">
                  <span>
                    <span className="font-medium">{name}</span> <span className="text-muted-foreground">({ROLE_LABEL[e.actorRole]})</span> {DID[e.action] ?? e.action}
                    {" → "}
                    {PAYMENT_STATE_LABEL[e.toState]}
                  </span>
                  {e.comment ? <span className="text-muted-foreground">&ldquo;{e.comment}&rdquo;</span> : null}
                  <span className="text-muted-foreground text-xs">{WHEN.format(e.createdAt)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">Belum dikirim.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
