import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { DEAL_STATUS_LABEL, billingPlan, canPipeline, canRecoveryPlan, duplicateProjects, isWon, needsRecovery, pipelineByCoa, pipelineBySegment, pipelineTotals, sum, unitLabel, ZERO } from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { loadPipeline, pipelineYear } from "@/lib/pipeline";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { KpiCard, KpiStrip } from "@/components/erp/kpi-card";
import { PageHeader } from "@/components/erp/page-header";
import { FigureCell } from "@/components/erp/money-cell";
import { PipelineRecovery } from "@/components/erp/pipeline-recovery";
import { PipelineRegister } from "@/components/erp/pipeline-register";
import { activeView } from "@/lib/view-filter";
import { ViewNote } from "@/components/erp/view-note";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteDeal, saveDeal, saveRecoveryPlan } from "./actions";

export const metadata: Metadata = { title: "Pipeline" };

const pct = (part: typeof ZERO, whole: typeof ZERO | null) => (whole && !whole.isZero() ? `${part.div(whole).times(100).toFixed(1).replace(".", ",")}%` : "—");

const times = (x: typeof ZERO | null) => (x ? `${x.toFixed(2).replace(".", ",")}x` : "—");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

export default async function PipelinePage() {
  const user = await requireUser();
  const org = await loadOrg();
  if (!canPipeline(user.actor, "view", null, org)) notFound();
  const [year, unit, view] = await Promise.all([pipelineYear(), displayUnit(), activeView()]);
  if (!year) {
    return (
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-muted-foreground text-sm">Belum ada siklus RKA.</p>
      </div>
    );
  }
  const [{ deals: allDeals, targets, recovery }, entities, coa] = await Promise.all([
    loadPipeline(year),
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)),
    db
      .select({ code: schema.coaAccount.code, name: schema.coaAccount.name })
      .from(schema.coaAccount)
      .where(and(eq(schema.coaAccount.category, "Revenue"), eq(schema.coaAccount.active, true)))
      .orderBy(asc(schema.coaAccount.code)),
  ]);
  const deals = allDeals.filter((d) => !view.entity || d.entity === view.entity);
  const editableEntities = entities.map((e) => e.code).filter((e) => canPipeline(user.actor, "edit", e, org));
  const totals = pipelineTotals(deals);
  const segments = pipelineBySegment(deals, targets);
  const targetTotal = sum([...targets.values()]);
  const won = deals.filter((d) => isWon(d.status));
  const wonValue = sum(won.map((d) => pipelineTotals([d]).value));
  const red = segments.filter(needsRecovery);
  const byCoa = pipelineByCoa(deals);
  const coaName = new Map(coa.map((c) => [c.code, c.name]));
  const billing = billingPlan(deals, year);
  const carried = sum(billing.rows.map((r) => r.carried));
  const noCoa = deals.filter((d) => !d.coaCode).length;
  const duplicates = duplicateProjects(deals);
  const canPlan = canRecoveryPlan(user.actor, org);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={`Pipeline ${year}`}
        description="Dikelola BCD. Nilai tertimbang = nilai (exclude PPN) × probabilitas; tidak dijumlahkan ke pendapatan RKA."
        note={<ViewNote ignores={["division"]} />}
      />

      <KpiStrip>
        <KpiCard label="Nilai pipeline" value={totals.value} unit={unit} note={`Dasar: seluruh pipeline · ${deals.length} deal`} />
        <KpiCard label="Won Bidding" value={wonValue} unit={unit} note={`Dasar: Won Bidding saja · ${won.length} deal`} />
        <KpiCard label="Pipeline tertimbang" value={totals.weighted} unit={unit} note="Nilai × probabilitas, seluruh pipeline" />
        <KpiCard label="Target pendapatan" value={targetTotal} unit={unit} note={`Coverage tertimbang ${times(targetTotal.isZero() ? null : totals.weighted.div(targetTotal))}`} signal={!targetTotal.isZero() && totals.weighted.lt(targetTotal)} />
      </KpiStrip>

      {noCoa || duplicates.length ? (
        <Alert data-testid="pipeline-cleanup">
          <AlertDescription>
            Perlu dirapikan sebelum angka ini dipakai RKA:
            {noCoa ? ` ${noCoa} deal belum memiliki COA pendapatan.` : ""}
            {duplicates.length ? ` ${sum(duplicates.map((g) => ZERO.plus(g.length))).toFixed(0)} deal memakai nama project yang sama dalam satu entitas (${duplicates.length} nama); nama project harus unik karena menjadi Kode Proyek.` : ""}
            {" "}Deal tersebut tidak dapat disimpan ulang sebelum diperbaiki.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Per segmen</CardTitle>
          <CardDescription>
            Dua dasar ditampilkan berdampingan: seluruh pipeline dan Won Bidding saja (status WB dan CW). Coverage = pipeline tertimbang ÷ target; di bawah 1,0x ditandai merah dan
            wajib memiliki rencana pemulihan dari Sales Head.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  Segmen <span className="text-muted-foreground font-normal">({unitLabel(unit)})</span>
                </TableHead>
                <TableHead className="text-right">Deal</TableHead>
                <TableHead className="text-right">Nilai seluruh pipeline</TableHead>
                <TableHead className="text-right">Deal WB</TableHead>
                <TableHead className="text-right">Nilai Won Bidding saja</TableHead>
                <TableHead className="text-right">Tertimbang</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Coverage</TableHead>
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
                  <TableCell className="tabular text-right">{s.wonDeals}</TableCell>
                  <TableCell className="text-right" data-testid="won">
                    <FigureCell value={s.wonValue} unit={unit} />
                  </TableCell>
                  <TableCell className="text-right" data-testid="weighted">
                    <FigureCell value={s.weighted} unit={unit} />
                  </TableCell>
                  <TableCell className="text-right">{s.target ? <FigureCell value={s.target} unit={unit} /> : "–"}</TableCell>
                  <TableCell className="tabular text-right" data-testid="coverage">
                    {needsRecovery(s) ? (
                      <Badge variant="destructive" title="Risiko target: coverage tertimbang di bawah 1,0x">
                        {times(s.coverage)}
                      </Badge>
                    ) : (
                      times(s.coverage)
                    )}
                  </TableCell>
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
                <TableCell className="tabular text-right">{won.length}</TableCell>
                <TableCell className="text-right">
                  <FigureCell value={wonValue} unit={unit} />
                </TableCell>
                <TableCell className="text-right">
                  <FigureCell value={totals.weighted} unit={unit} />
                </TableCell>
                <TableCell className="text-right">
                  <FigureCell value={targetTotal} unit={unit} />
                </TableCell>
                <TableCell className="tabular text-right">{times(targetTotal.isZero() ? null : totals.weighted.div(targetTotal))}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          {red.length ? (
            <div className="mt-4 grid gap-3">
              {red.map((s) => {
                const p = recovery.get(s.segment);
                return (
                  <PipelineRecovery
                    key={s.segment}
                    segment={s.segment}
                    plan={p?.plan ?? null}
                    signedBy={p ? `${p.updatedBy ?? "Sales Head"} · ${day.format(p.updatedAt)}` : null}
                    canEdit={canPlan}
                    onSave={saveRecoveryPlan}
                  />
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per COA pendapatan</CardTitle>
          <CardDescription>Dasar: seluruh pipeline. Inilah jumlah yang dibaca RKA sebagai pendapatan per COA.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  COA <span className="text-muted-foreground font-normal">({unitLabel(unit)})</span>
                </TableHead>
                <TableHead className="text-right">Deal</TableHead>
                <TableHead className="text-right">Nilai</TableHead>
                <TableHead className="text-right">Tertimbang</TableHead>
                <TableHead className="text-right">Porsi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byCoa.map((r) => (
                <TableRow key={r.coaCode ?? "none"} data-testid={`coa-${r.coaCode ?? "none"}`}>
                  <TableCell className="font-medium">{r.coaCode ? `${r.coaCode} · ${coaName.get(r.coaCode) ?? "tidak aktif di COA Master"}` : <span className="text-destructive">Tanpa COA</span>}</TableCell>
                  <TableCell className="tabular text-right">{r.deals}</TableCell>
                  <TableCell className="text-right">
                    <FigureCell value={r.value} unit={unit} />
                  </TableCell>
                  <TableCell className="text-right">
                    <FigureCell value={r.weighted} unit={unit} />
                  </TableCell>
                  <TableCell className="tabular text-right">{pct(r.value, totals.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rencana invoice dari Billing Termin</CardTitle>
          <CardDescription>
            Hanya dijumlahkan dari termin setiap deal, sehingga ringkasan selalu sama dengan detailnya. Nilai kontrak yang tidak ditagih di {year} jatuh ke tahun berikutnya.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {billing.rows.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {MONTHS.map((m) => (
                      <TableHead key={m} className="text-right">
                        {m}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total {year}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow data-testid="billing-months">
                    {billing.months.map((m, i) => (
                      <TableCell key={i} className="text-right">
                        <FigureCell value={m} unit={unit} />
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium">
                      <FigureCell value={billing.total} unit={unit} />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      Project <span className="text-muted-foreground font-normal">({unitLabel(unit)})</span>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Nilai kontrak</TableHead>
                    <TableHead className="text-right">Invoice {year}</TableHead>
                    <TableHead className="text-right">Jatuh ke tahun berikutnya</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billing.rows.map((r) => (
                    <TableRow key={r.deal.id} data-testid={`billing-${r.deal.id}`}>
                      <TableCell className="max-w-80">
                        <div className="font-medium whitespace-normal">{r.deal.project}</div>
                        <div className="text-muted-foreground text-xs">
                          {r.deal.customer} · {r.deal.termins?.length ?? 0} termin
                        </div>
                      </TableCell>
                      <TableCell>{DEAL_STATUS_LABEL[r.deal.status]}</TableCell>
                      <TableCell className="text-right">
                        <FigureCell value={r.contract} unit={unit} />
                      </TableCell>
                      <TableCell className="text-right">
                        <FigureCell value={r.thisYear} unit={unit} />
                      </TableCell>
                      <TableCell className="text-right">
                        <FigureCell value={r.carried} unit={unit} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow data-testid="billing-total">
                    <TableCell colSpan={2}>Total</TableCell>
                    <TableCell className="text-right">
                      <FigureCell value={sum(billing.rows.map((r) => r.contract))} unit={unit} />
                    </TableCell>
                    <TableCell className="text-right">
                      <FigureCell value={billing.total} unit={unit} />
                    </TableCell>
                    <TableCell className="text-right">
                      <FigureCell value={carried} unit={unit} />
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Belum ada deal Closed Won atau termin. Isi Billing Termin pada deal; status Closed Won mewajibkan termin senilai 100% kontrak.</p>
          )}
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
            entity={view.entity}
          />
        </CardContent>
      </Card>
    </div>
  );
}
