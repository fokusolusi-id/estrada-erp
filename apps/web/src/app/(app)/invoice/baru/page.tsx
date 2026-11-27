import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { can } from "@estrada/domain";
import { billableTermins, covers, revenueAccounts } from "@/lib/invoice";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NewInvoice } from "./new-invoice";

export const metadata: Metadata = { title: "Buat Invoice" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/invoice/baru">) {
  const user = await requireUser();
  if (!can(user.actor, "invoice.create", null, await loadOrg())) redirect("/invoice");
  const sp = await searchParams;
  const termin = (await billableTermins()).find((t) => t.dealId === sp.deal && String(t.no) === sp.termin);
  if (!termin || !termin.customerId || !covers(user, termin.entity)) notFound();
  const [[customer], banks] = await Promise.all([
    db.select().from(schema.customer).where(eq(schema.customer.id, termin.customerId)),
    db.select().from(schema.companyBankAccount).where(and(eq(schema.companyBankAccount.entityCode, termin.entity), eq(schema.companyBankAccount.active, true))),
  ]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Link href="/invoice" className="text-muted-foreground hover:text-foreground w-fit text-sm">
        ← Invoice
      </Link>
      <PageHeader title="Buat Invoice" description={`${termin.entity} · ${customer!.legalName} · ${termin.project} · termin ${termin.no}${termin.waitingRfs ? " · menunggu RFS: draft boleh disiapkan, belum bisa diterbitkan" : ""}`} />
      <Card>
        <CardContent>
          <NewInvoice
            dealId={termin.dealId}
            terminNo={termin.no}
            initial={{ revenueCoa: "", description: `${termin.description ?? `Termin ${termin.no}`} — ${termin.project}`, penalty: "", fine: "", pphType: "pph23", pphRate: "2", invoicedOn: todayJakarta(), bankAccountId: banks[0]?.id ?? "" }}
            billed={termin.amount}
            wapu={customer!.wapu}
            termDays={customer!.paymentTermDays}
            accounts={await revenueAccounts()}
            banks={banks.map((b) => ({ id: b.id, label: `${b.bankName} ${b.accountNumber} a.n. ${b.accountName}` }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
