import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can, priorYear, sum } from "@estrada/domain";
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

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Realisasi {prior}</h1>
        <p className="text-muted-foreground text-sm">
          {version ? rkaLabel(version) : "Belum ada siklus RKA yang dibuka"} · {filled} dari {lines.length} baris sudah berisi realisasi
        </p>
        <ViewNote />
      </div>
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
