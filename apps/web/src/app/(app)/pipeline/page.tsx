import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { canPipeline, pipelineBySegment, pipelineTotals, sum, unitLabel, ZERO } from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { loadPipeline, pipelineYear } from "@/lib/pipeline";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { KpiCard } from "@/components/erp/kpi-card";
import { PageHeader } from "@/components/erp/page-header";
import { FigureCell } from "@/components/erp/money-cell";
import { PipelineRegister } from "@/components/erp/pipeline-register";
import { UnitSwitch } from "@/components/erp/unit-switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setDisplayUnit } from "../unit-actions";
import { deleteDeal, saveDeal } from "./actions";

export const metadata: Metadata = { title: "Pipeline" };

const pct = (part: typeof ZERO, whole: typeof ZERO | null) => (whole && !whole.isZero() ? `${part.div(whole).times(100).toFixed(1).replace(".", ",")}%` : "—");

export default async function PipelinePage() {
  const user = await requireUser();
  const org = await loadOrg();
  if (!canPipeline(user.actor, "view", null, org)) notFound();
  const [year, unit] = await Promise.all([pipelineYear(), displayUnit()]);
  if (!year) {
    return (
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-muted-foreground text-sm">Belum ada siklus RKA.</p>
      </div>
    );
  }
  const [{ deals, targets }, entities, coa] = await Promise.all([
    loadPipeline(year),
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)),
    db
      .select({ code: schema.coaAccount.code, name: schema.coaAccount.name })
      .from(schema.coaAccount)
      .where(and(eq(schema.coaAccount.category, "Revenue"), eq(schema.coaAccount.active, true)))
      .orderBy(asc(schema.coaAccount.code)),
  ]);
  const editableEntities = entities.map((e) => e.code).filter((e) => canPipeline(user.actor, "edit", e, org));
  const totals = pipelineTotals(deals);
  const segments = pipelineBySegment(deals, targets);
  const targetTotal = sum([...targets.values()]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={`Pipeline ${year}`}
        description="Dikelola BCD. Nilai tertimbang = nilai (exclude PPN) × probabilitas; tidak dijumlahkan ke pendapatan RKA."
        filters={<UnitSwitch value={unit} onChange={setDisplayUnit} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Nilai pipeline" value={totals.value} unit={unit} note={`${deals.length} deal`} />
        <KpiCard label="Pipeline tertimbang" value={totals.weighted} unit={unit} note="Nilai × probabilitas" />
        <KpiCard label="Target pendapatan" value={targetTotal} unit={unit} note="Target BCD per segmen" />
        <KpiCard label="Selisih ke target" value={totals.weighted.minus(targetTotal)} unit={unit} note={`${pct(totals.weighted, targetTotal)} dari target`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per segmen</CardTitle>
          <CardDescription>Target pendapatan BCD dibandingkan pipeline tertimbang.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  Segmen <span className="text-muted-foreground font-normal">({unitLabel(unit)})</span>
                </TableHead>
                <TableHead className="text-right">Deal</TableHead>
                <TableHead className="text-right">Nilai</TableHead>
                <TableHead className="text-right">Tertimbang</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Capaian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((s) => (
                <TableRow key={s.segment} data-testid={`segment-${s.segment}`}>
                  <TableCell className="font-medium">{s.segment}</TableCell>
                  <TableCell className="tabular text-right">{s.deals}</TableCell>
                  <TableCell className="text-right">
                    <FigureCell value={s.value} unit={unit} />
                  </TableCell>
                  <TableCell className="text-right" data-testid="weighted">
                    <FigureCell value={s.weighted} unit={unit} />
                  </TableCell>
                  <TableCell className="text-right">{s.target ? <FigureCell value={s.target} unit={unit} /> : "–"}</TableCell>
                  <TableCell className="tabular text-right">{pct(s.weighted, s.target)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="tabular text-right">{deals.length}</TableCell>
                <TableCell className="text-right">
                  <FigureCell value={totals.value} unit={unit} />
                </TableCell>
                <TableCell className="text-right">
                  <FigureCell value={totals.weighted} unit={unit} />
                </TableCell>
                <TableCell className="text-right">
                  <FigureCell value={targetTotal} unit={unit} />
                </TableCell>
                <TableCell className="tabular text-right">{pct(totals.weighted, targetTotal)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar deal</CardTitle>
          <CardDescription>
            {editableEntities.length ? "Tambah atau ubah deal; setiap perubahan tercatat di jejak audit." : "Hanya baca. Pipeline dikelola oleh BCD."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PipelineRegister
            deals={deals.map((d) => ({ ...d, editable: canPipeline(user.actor, "edit", d.entity, org) }))}
            options={{ entities: editableEntities, coa }}
            canAdd={editableEntities.length > 0}
            onSave={saveDeal}
            onDelete={deleteDeal}
          />
        </CardContent>
      </Card>
    </div>
  );
}
