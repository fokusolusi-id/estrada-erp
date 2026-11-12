import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { requireUser } from "@/lib/session";
import { activeYear } from "@/lib/fiscal-year";
import { lineOptions } from "@/lib/payment";
import { PageHeader } from "@/components/erp/page-header";
import { EMPTY_PAYMENT, PaymentForm } from "@/components/erp/payment-form";
import { Card, CardContent } from "@/components/ui/card";
import { savePayment } from "../actions";

export const metadata: Metadata = { title: "Buat Permintaan Pembayaran" };

export default async function NewPaymentPage() {
  const user = await requireUser();
  if (user.actor.role === "admin") redirect("/");
  const [entities, options] = await Promise.all([
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
    lineOptions(user.actor, await activeYear()),
  ]);
  const covers = (e: string) => user.actor.entities.includes("*") || user.actor.entities.includes(e);

  return (
    <div className="grid max-w-4xl gap-6">
      <Link href="/pembayaran" className="text-muted-foreground hover:text-foreground w-fit text-sm">
        ← Permintaan Pembayaran
      </Link>
      <PageHeader
        title="Buat Permintaan Pembayaran"
        description={`Diajukan dari posisi ${user.positionTitle} (${user.actor.orgUnit}). Simpan sebagai draft, lampirkan dokumen, lalu kirim ke atasan.`}
      />
      <Card>
        <CardContent>
          <PaymentForm
            initial={EMPTY_PAYMENT}
            entities={entities.map((e) => e.code).filter(covers)}
            lines={options.lines}
            versionNote={options.note}
            onSave={savePayment.bind(null, null)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
