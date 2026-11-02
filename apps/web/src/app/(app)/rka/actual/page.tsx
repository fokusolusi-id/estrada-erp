import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can, sum } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadScopedLines, openVersion } from "@/lib/rka";
import { loadOrg } from "@/lib/workflow";
import { ActualEntry, type ActualLine } from "@/components/erp/actual-entry";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveActuals } from "./actions";

export const metadata: Metadata = { title: "Realisasi 2026" };

export default async function ActualPage() {
  const user = await requireUser();
  if (user.actor.role !== "finance") notFound();
  const [version, scoped, org] = await Promise.all([openVersion(), loadScopedLines(user), loadOrg()]);
  const lines: ActualLine[] = scoped
    .filter((l) => can(user.actor, "actual.edit", { requestorUnit: l.requestorUnit, ownerUnit: l.ownerUnit, entity: l.entity, state: l.state }, org))
    .map((l) => ({
      id: l.id,
      coaCode: l.coaCode,
      coaName: l.coaName,
      entity: l.entity,
      ownerUnit: l.ownerUnit,
      plan: sum(l.months).toFixed(),
      ...(l.item ? { item: l.item } : {}),
      ...(l.rka2026 ? { rka2026: l.rka2026.toFixed() } : {}),
      ...(l.actual2026 ? { actual2026: l.actual2026.toFixed() } : {}),
    }));
  const filled = lines.filter((l) => l.actual2026).length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Realisasi 2026</h1>
        <p className="text-muted-foreground text-sm">
          {version ? version.name : "Belum ada siklus RKA yang dibuka"} · {filled} dari {lines.length} baris sudah berisi realisasi
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Actual 2026 per baris</CardTitle>
          <CardDescription>
            Diisi manual oleh Finance sampai realisasi bisa diambil dari Realisasi Anggaran. Tempel satu kolom dari Excel untuk mengisi
            beberapa baris sekaligus; kosongkan sel untuk menghapus. Angka RKA tidak berubah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lines.length ? (
            <ActualEntry lines={lines} onSave={saveActuals} />
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">Belum ada baris RKA di versi ini.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
