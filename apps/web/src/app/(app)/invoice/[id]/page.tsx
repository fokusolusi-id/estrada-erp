import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { INVOICE_STATE_LABEL, PPH_LABEL, can, formatIdr, invoiceActions, money, outstandingOf, sum } from "@estrada/domain";
import { covers, revenueAccounts } from "@/lib/invoice";
import { formatDate, todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { InvoiceActions } from "@/components/erp/invoice-actions";
import { PageHeader } from "@/components/erp/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { runInvoiceAction } from "../actions";
import { EditInvoice } from "./edit-invoice";
import { InvoiceReceipts } from "./invoice-receipts";

export const metadata: Metadata = { title: "Detail Invoice" };

const rupiahInput = (v: string) => (money(v).isZero() ? "" : formatIdr(money(v)).replace("Rp ", ""));

export default async function InvoiceDetailPage({ params }: PageProps<"/invoice/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const org = await loadOrg();
  if (!can(user.actor, "invoice.view", null, org)) redirect("/");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [r] = await db.select().from(schema.invoice).where(eq(schema.invoice.id, id));
  if (!r || !covers(user, r.entityCode)) notFound();
  const mayCreate = can(user.actor, "invoice.create", null, org);
  const receipts = await db.select().from(schema.cashReceipt).where(eq(schema.cashReceipt.invoiceId, r.id)).orderBy(asc(schema.cashReceipt.receivedOn), asc(schema.cashReceipt.createdAt));
  const mayReceive = can(user.actor, "receipt.record", null, org);
  const received = sum(receipts.filter((x) => !x.reversedAt).map((x) => money(x.amount)));
  const outstanding = outstandingOf({ receivable: money(r.receivable) }, received);
  const people = [r.createdBy, r.validatedBy, r.approvedBy, ...receipts.map((x) => x.createdBy)].filter((x): x is string => !!x);
  const [[customer], [deal], banks, users] = await Promise.all([
    db.select().from(schema.customer).where(eq(schema.customer.id, r.customerId)),
    db.select().from(schema.pipelineDeal).where(eq(schema.pipelineDeal.id, r.dealId)),
    db.select().from(schema.companyBankAccount).where(and(eq(schema.companyBankAccount.entityCode, r.entityCode))).orderBy(asc(schema.companyBankAccount.bankName)),
    db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).where(inArray(schema.user.id, people)),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const bank = banks.find((b) => b.id === r.bankAccountId);
  const actions = invoiceActions(r.state, { actorId: user.id, createdBy: r.createdBy, validatedBy: r.validatedBy, mayCreate, mayApprove: can(user.actor, "invoice.approve", null, org) });
  const field = (label: string, value: string | null) => (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value || "—"}</dd>
    </div>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Link href="/invoice" className="text-muted-foreground hover:text-foreground w-fit text-sm">
        ← Invoice
      </Link>
      <PageHeader title={r.number ?? "Draft invoice"} description={`${r.entityCode} · ${customer!.legalName} · ${deal!.project} · termin ${r.terminNo}`} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant={r.state === "issued" ? "default" : "outline"}>{INVOICE_STATE_LABEL[r.state]}</Badge>
        <span className="text-muted-foreground">
          Dibuat {name.get(r.createdBy)}
          {r.validatedBy ? ` · pajak divalidasi ${name.get(r.validatedBy)}` : ""}
          {r.approvedBy ? ` · disetujui ${name.get(r.approvedBy)}` : ""}
        </span>
      </div>
      {r.note && (r.state === "draft" || r.state === "cancelled") ? <p className="text-warning-foreground text-sm">Catatan: {r.note}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Langkah berikutnya</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceActions actions={actions} onRun={runInvoiceAction.bind(null, r.id)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Rincian</CardTitle>
        </CardHeader>
        <CardContent>
          {r.state === "draft" && mayCreate ? (
            <EditInvoice
              key={r.updatedAt.getTime()}
              id={r.id}
              dealId={r.dealId}
              terminNo={r.terminNo}
              initial={{ description: r.description, revenueCoa: r.revenueCoa ?? "", penalty: rupiahInput(r.penalty), fine: rupiahInput(r.fine), pphType: r.pphType, pphRate: money(r.pphRate).toString().replace(".", ","), invoicedOn: r.invoicedOn, bankAccountId: r.bankAccountId ?? "" }}
              billed={r.billed}
              wapu={r.wapu}
              termDays={r.termDays}
              accounts={await revenueAccounts()}
              banks={banks.filter((b) => b.active).map((b) => ({ id: b.id, label: `${b.bankName} ${b.accountNumber} a.n. ${b.accountName}` }))}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-3">
              {field("Uraian", r.description)}
              {field("Tanggal invoice", formatDate(r.invoicedOn))}
              {field("Jatuh tempo", formatDate(r.dueOn))}
              {field("Tagihan termin", formatIdr(money(r.billed)))}
              {field("Penalti / restitusi", formatIdr(money(r.penalty)))}
              {field("Denda", formatIdr(money(r.fine)))}
              {field("DPP", formatIdr(money(r.dpp)))}
              {field(r.wapu ? "PPN (dipungut customer)" : "PPN", formatIdr(money(r.ppn)))}
              {field("Nilai invoice", formatIdr(money(r.total)))}
              {field(`${PPH_LABEL[r.pphType]} ${money(r.pphRate).toString().replace(".", ",")}%`, formatIdr(money(r.pph)))}
              {field("Diperkirakan diterima", formatIdr(money(r.receivable)))}
              {field("Rekening", bank ? `${bank.bankName} ${bank.accountNumber} a.n. ${bank.accountName}` : null)}
            </dl>
          )}
        </CardContent>
      </Card>
      {r.state === "issued" ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Penerimaan · diterima {formatIdr(received)}, sisa {formatIdr(outstanding)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceReceipts
              invoiceId={r.id}
              mayReverse={mayReceive}
              rows={receipts.map((x) => {
                const account = banks.find((b) => b.id === x.bankAccountId);
                return {
                  id: x.id,
                  receivedOn: formatDate(x.receivedOn),
                  amount: formatIdr(money(x.amount)),
                  bank: account ? `${account.bankName} ${account.accountNumber}` : "",
                  reference: x.reference,
                  by: name.get(x.createdBy) ?? "",
                  reversal: x.reversalReason,
                };
              })}
              form={
                mayReceive && outstanding.gt(0)
                  ? { banks: banks.filter((b) => b.active).map((b) => ({ id: b.id, label: `${b.bankName} ${b.accountNumber} a.n. ${b.accountName}` })), today: todayJakarta(), suggested: formatIdr(outstanding).replace("Rp ", "") }
                  : null
              }
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
