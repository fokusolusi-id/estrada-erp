import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can, formatIdr, sum, ZERO } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadAllocation } from "@/lib/allocation";
import { loadScopedLines, openVersion } from "@/lib/rka";
import { loadOrg } from "@/lib/workflow";
import { EntityBases } from "@/components/erp/entity-bases";
import { SharedCostEditor, type SharedCostLine } from "@/components/erp/shared-cost-editor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveEntityHeadcount, saveSharedCosts } from "./actions";

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
  const [scoped, org, { ctx, rules }] = await Promise.all([loadScopedLines(user, undefined, version.id), loadOrg(), loadAllocation(version.id)]);

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
          {version.name} · {shared.length} baris biaya bersama
          {shared.length ? ` senilai ${formatIdr(sharedTotal, { unit: "rp" })}` : ""}
        </p>
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
            <SharedCostEditor lines={lines} entities={ctx.entities} onSave={saveSharedCosts} />
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">Belum ada baris biaya di versi ini.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
