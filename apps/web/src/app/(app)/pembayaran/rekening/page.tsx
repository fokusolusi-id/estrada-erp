import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { can } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { BankAccounts } from "@/components/erp/bank-accounts";
import { Card, CardContent } from "@/components/ui/card";
import { saveBankAccount } from "./actions";

export const metadata: Metadata = { title: "Rekening Bank" };

export default async function BankAccountsPage() {
  const user = await requireUser();
  if (!can(user.actor, "bank.manage", null, await loadOrg())) redirect("/");

  const covers = (e: string) => user.actor.entities.includes("*") || user.actor.entities.includes(e);
  const [entities, accounts] = await Promise.all([
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
    db.select().from(schema.companyBankAccount).orderBy(asc(schema.companyBankAccount.bankName), asc(schema.companyBankAccount.accountNumber)),
  ]);

  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader
        title="Rekening Bank"
        description="Bank asal pembayaran per entitas. Cash Management memilih dari daftar ini saat menjadwalkan Permintaan Pembayaran. Rekening yang tidak dipakai lagi dinonaktifkan, tidak dihapus."
      />
      <Card>
        <CardContent>
          <BankAccounts
            entities={entities.map((e) => e.code).filter(covers)}
            accounts={accounts
              .filter((a) => covers(a.entityCode))
              .map((a) => ({ id: a.id, entity: a.entityCode, bankName: a.bankName, accountNumber: a.accountNumber, accountName: a.accountName, active: a.active }))}
            onSave={saveBankAccount}
          />
        </CardContent>
      </Card>
    </div>
  );
}
