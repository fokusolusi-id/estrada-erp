import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can, chargeableVersion, priorYear, sum } from "@estrada/domain";
import { db, schema } from "@estrada/db";
import { paymentRealisasi } from "@/lib/payment";
import { PaymentRealisasi, type RealisasiRow } from "@/components/erp/payment-realisasi";
import { requireUser } from "@/lib/session";
import { loadScopedLines, openVersion } from "@/lib/rka";
import { hiddenColumns, viewLines } from "@/lib/view-filter";
import { ViewNote } from "@/components/erp/view-note";
import { activeYear } from "@/lib/fiscal-year";
import { loadOrg } from "@/lib/workflow";
import { ActualEntry, type ActualLine } from "@/components/erp/actual-entry";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveActuals } from "./actions";
import { Gauge } from "lucide-react";
import { EmptyState } from "@/components/erp/empty-state";
import { rkaLabel } from "@estrada/domain";

export const metadata: Metadata = { title: "Realisasi" };

export default async function ActualPage() {
  const user = await requireUser();
  if (user.actor.role !== "finance") notFound();
  const [version, scoped, org, year] = await Promise.all([openVersion(), loadScopedLines(user), loadOrg(), activeYear()]);
  // Last year's actuals, typed onto the lines of the year being planned.
  const prior = priorYear(version?.fiscalYear ?? year ?? new Date().getFullYear());
  const lines: ActualLine[] = (await viewLines(scoped))
    .filter((l) => can(user.actor, "actual.edit", { requestorUnit: l.requestorUnit, ownerUnit: l.ownerUnit, entity: l.entity, state: l.state }, org))
    .map((l) => ({
      id: l.id,
      coaCode: l.coaCode,
      coaName: l.coaName,
      entity: l.entity,
      ownerUnit: l.ownerUnit,
      plan: sum(l.months).toFixed(),
      ...(l.item ? { item: l.item } : {}),
      ...(l.priorRka ? { priorRka: l.priorRka.toFixed() } : {}),
      ...(l.priorActual ? { priorActual: l.priorActual.toFixed() } : {}),
    }));
  const filled = lines.filter((l) => l.priorActual).length;

  // This year's Realisasi from Paid payment requests, on the lines of the RKA they were charged to.
  const versions = await db.select({ id: schema.budgetVersion.id, fiscalYear: schema.budgetVersion.fiscalYear, status: schema.budgetVersion.status }).from(schema.budgetVersion);
  const charged = year === null ? null : chargeableVersion(versions, year);
  const chargedLines = charged ? await viewLines(await loadScopedLines(user, undefined, charged.id)) : [];
  const used = await paymentRealisasi(chargedLines.map((l) => l.id), year ?? 0);
  const realisasi: RealisasiRow[] = chargedLines
    .filter((l) => {
      const u = used.get(l.id);
      return !!u && !(u.paid.isZero() && u.committed.isZero());
    })
    .map((l) => ({
      id: l.id,
      coaCode: l.coaCode,
      coaName: l.coaName,
      item: l.item ?? null,
      entity: l.entity,
      ownerUnit: l.ownerUnit,
      plan: sum(l.months),
      paid: used.get(l.id)!.paid,
      committed: used.get(l.id)!.committed,
    }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Realisasi</h1>
        <p className="text-muted-foreground text-sm">
          {version ? rkaLabel(version) : "Belum ada siklus RKA yang dibuka"} · {filled} dari {lines.length} baris sudah berisi realisasi
        </p>
        <ViewNote />
      </div>
      {year !== null ? (
        <Card>
          <CardHeader>
            <CardTitle>Realisasi {year} dari pembayaran</CardTitle>
            <CardDescription>
              Terisi otomatis: setiap Permintaan Pembayaran yang Paid tercatat sebesar nominal sebelum pajak (DPP) pada baris RKA-nya, di bulan
              tanggal bayarnya. Sedang berjalan adalah permintaan yang sudah disetujui atasan tetapi belum dibayar.
              {charged && !charged.locked ? ` RKA ${year} belum dikunci; angka rencana masih bisa berubah.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {realisasi.length ? (
              <PaymentRealisasi rows={realisasi} year={year} />
            ) : (
              <EmptyState icon={Gauge} title={`Belum ada pembayaran untuk RKA ${year}.`} description="Baris muncul di sini setelah Permintaan Pembayaran untuk baris itu disetujui atasan." />
            )}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Actual {prior} per baris</CardTitle>
          <CardDescription>
            Diisi manual oleh Finance sampai realisasi bisa diambil dari Realisasi Anggaran. Tempel satu kolom dari Excel untuk mengisi
            beberapa baris sekaligus; kosongkan sel untuk menghapus. Angka RKA tidak berubah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lines.length ? (
            <ActualEntry lines={lines} priorYear={prior} onSave={saveActuals} hide={await hiddenColumns(lines)} />
          ) : (
            <EmptyState icon={Gauge} title="Belum ada baris RKA di versi ini." description="Realisasi diisi per baris setelah baris RKA ada." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
