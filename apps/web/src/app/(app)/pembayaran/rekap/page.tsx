import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Download, ReceiptText } from "lucide-react";
import { can } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { groupLabel, loadRecap, type RecapParams } from "@/lib/payment-recap";
import { formatDate } from "@/lib/payment";
import { PageHeader } from "@/components/erp/page-header";
import { PaymentRecapTable } from "@/components/erp/payment-recap-table";
import { EmptyState } from "@/components/erp/empty-state";
import { ViewNote } from "@/components/erp/view-note";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "Rekap Pembayaran" };

const SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

export default async function RecapPage({ searchParams }: { searchParams: Promise<RecapParams> }) {
  const user = await requireUser();
  if (!can(user.actor, "payment.report", null, await loadOrg())) redirect("/");
  const params = await searchParams;
  const { by, period, bankId, banks, recap } = await loadRecap(user.actor, params);
  const query = new URLSearchParams({ per: by === "month" ? "bulan" : "hari", dari: period.from, sampai: period.to, ...(bankId ? { bank: bankId } : {}) });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Rekap Pembayaran"
        description={`Pembayaran yang sudah Paid, ${formatDate(period.from)} – ${formatDate(period.to)}, per ${by === "month" ? "bulan" : "hari"}. Nominal adalah nett yang keluar dari bank.`}
        note={<ViewNote />}
        actions={
          <Button asChild variant="outline">
            <a href={`/pembayaran/rekap/export?${query}`}>
              <Download /> Unduh Excel
            </a>
          </Button>
        }
      />
      <Card>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-[9rem_10rem_10rem_minmax(0,1fr)_auto] sm:items-end" aria-label="Filter rekap">
            <div className="grid gap-2">
              <Label htmlFor="rekap-per">Rekap per</Label>
              <select id="rekap-per" name="per" defaultValue={by === "month" ? "bulan" : "hari"} className={SELECT}>
                <option value="hari">Hari</option>
                <option value="bulan">Bulan</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rekap-dari">Dari</Label>
              <Input id="rekap-dari" name="dari" type="date" defaultValue={period.from} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rekap-sampai">Sampai</Label>
              <Input id="rekap-sampai" name="sampai" type="date" defaultValue={period.to} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rekap-bank">Bank asal</Label>
              <select id="rekap-bank" name="bank" defaultValue={bankId ?? ""} className={SELECT}>
                <option value="">Semua bank</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">Tampilkan</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          {recap.groups.length ? (
            <PaymentRecapTable recap={{ ...recap, groups: recap.groups.map((g) => ({ ...g, label: groupLabel(g.key) })) }} />
          ) : (
            <EmptyState icon={ReceiptText} title="Belum ada pembayaran pada periode ini" description="Hanya permintaan berstatus Paid yang masuk rekap, menurut tanggal bayarnya." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
