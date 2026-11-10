import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can, formatIdr, sum, ZERO } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadAllocation } from "@/lib/allocation";
import { loadScopedLines, openVersion } from "@/lib/rka";
import { hiddenColumns, viewLines } from "@/lib/view-filter";
import { ViewNote } from "@/components/erp/view-note";
import { loadOrg } from "@/lib/workflow";
import { EntityBases } from "@/components/erp/entity-bases";
import { SharedCostEditor, type SharedCostLine } from "@/components/erp/shared-cost-editor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveEntityHeadcount, saveSharedCosts } from "./actions";
import { Split } from "lucide-react";
import { EmptyState } from "@/components/erp/empty-state";
import { rkaLabel } from "@estrada/domain";

export const metadata: Metadata = { title: "Biaya Bersama" };

export default async function AllocationPage() {
  const user = await requireUser();
  if (user.actor.role !== "finance") notFound();
  const version = await openVersion();
  if (!version) {
    return (
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">Biaya Bersama</h1>
        <p className="text-muted-foreground text-sm">Belum ada siklus RKA yang dibuka.</p>
      </div>
    );
  }
  const [all, org, { ctx, rules }] = await Promise.all([loadScopedLines(user, undefined, version.id), loadOrg(), loadAllocation(version.id)]);
  const scoped = await viewLines(all);

  const lines: SharedCostLine[] = scoped
    .filter((l) => l.category !== "Revenue")
    .map((l) => {
      const rule = rules.get(l.id);
      return {
        id: l.id,
        coaCode: l.coaCode,
        coaName: l.coaName,
        entity: l.entity,
        ownerUnit: l.ownerUnit,
        total: sum(l.months).toFixed(),
        editable: can(user.actor, "allocation.manage", { requestorUnit: l.requestorUnit, ownerUnit: l.ownerUnit, entity: l.entity, state: l.state }, org),
        ...(l.item ? { item: l.item } : {}),
        ...(rule?.basis ? { basis: rule.basis } : {}),
        ...(rule?.fixed ? { fixed: rule.fixed } : {}),
      };
    });
  const shared = scoped.filter((l) => l.category !== "Revenue" && rules.has(l.id));
  const sharedTotal = sum(shared.flatMap((l) => l.months));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Biaya Bersama</h1>
        <p className="text-muted-foreground text-sm">
          {rkaLabel(version)} · {shared.length} baris biaya bersama
          {shared.length ? ` senilai ${formatIdr(sharedTotal, { unit: "rp" })}` : ""}
        </p>
        <ViewNote />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dasar pembagian per entitas</CardTitle>
          <CardDescription>
            Porsi pendapatan dihitung dari baris pendapatan versi ini. Headcount diisi Finance per entitas. Persentase tetap diisi per baris di
            bawah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntityBases
            rows={ctx.entities.map((e) => ({ entity: e, revenue: (ctx.revenue.get(e) ?? ZERO).toFixed(), heads: ctx.headcount.get(e) ?? null }))}
            editable
            onSave={saveEntityHeadcount}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Baris biaya</CardTitle>
          <CardDescription>
            Tandai baris biaya bersama dan pilih dasar alokasinya. Baris RKA tidak berubah; Management Summary membagi biayanya ke ESTRADA, MATRIK,
            DJALU dan PAS. Baris yang sudah terkunci tidak dapat diubah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lines.length ? (
            <SharedCostEditor lines={lines} entities={ctx.entities} onSave={saveSharedCosts} hide={await hiddenColumns(lines)} />
          ) : (
            <EmptyState icon={Split} title="Belum ada baris biaya di versi ini." description="Baris biaya muncul setelah unit mengisi RKA atau workbook diimpor." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
