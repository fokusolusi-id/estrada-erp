import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  AGING_BUCKETS, AGING_LABEL, ASSURANCE_LABEL, DEAL_STATUS_LABEL, HEALTH_ACTION, HEALTH_INFO, STRESS_CASH_IN_DROP, ZERO, achievement, agingByCustomer, assuranceSummary, canEditHighlight,
  canViewDashboard, consolidateTargets, formatAmount, money, pipelineFunnel, scaleTo, statement, sum, unitDecimals, unitLabel, weeklyCashflow, type HealthKey, type Money,
} from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { bodScope } from "@/lib/bod";
import { loadCashYear } from "@/lib/cash-week";
import { loadActuals, loadTargets, targetsOf } from "@/lib/kpi";
import { loadHealth } from "@/lib/kpi-health";
import { loadObligo } from "@/lib/obligo";
import { MONTH_NAMES } from "@/lib/period";
import { loadActualPnl } from "@/lib/pnl";
import { loadPortfolio } from "@/lib/portfolio";
import { loadReceivables } from "@/lib/receivable";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { HighlightForm, PrintButton } from "@/components/erp/bod-forms";
import { CashBalanceChart, TrendChart } from "@/components/erp/charts";
import { BandBadge, healthFigure } from "@/components/erp/health-badge";
import { PageHeader } from "@/components/erp/page-header";
import { ViewNote } from "@/components/erp/view-note";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveHighlight } from "./actions";

export const metadata: Metadata = { title: "Dashboard BOD" };

/** Where a tile's figure comes from (drill-down: tile, source screen, transaction). */
const SOURCE: Record<HealthKey, string> = {
  liquidity: "/closing", solvency: "/closing", ebitda_margin: "/pnl", runway: "/cash/mingguan", cash_in: "/cash/mingguan", cash_out: "/cash/mingguan", ending_cash: "/cash/mingguan", ebitda: "/pnl", budget_use: "/pnl", capital_efficiency: "/closing",
};
/** The six dimensions of the Business Health Check (FC11 addendum). */
const CHECK: [string, HealthKey][] = [["Profitability", "ebitda_margin"], ["Liquidity", "liquidity"], ["Cash Runway", "runway"], ["Collection Quality", "cash_in"], ["Spending Discipline", "cash_out"], ["Capital Efficiency", "capital_efficiency"]];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ bulan?: string; turun?: string }> }) {
  const user = await requireUser();
  const org = await loadOrg();
  if (!canViewDashboard(user.actor, org)) redirect("/");
  const asked = await searchParams;
  const [{ today, period, year, month, entities, scope }, unit] = await Promise.all([bodScope(user, asked.bulan), displayUnit()]);
  const drop = /^\d{1,3}$/.test(asked.turun ?? "") ? Math.min(100, Number(asked.turun)) : STRESS_CASH_IN_DROP;
  const months = Array.from({ length: month }, (_, i) => i + 1);
  const [health, targets, actuals, cashYear, monthly, deals, obligo, receivables, assurance, portfolio, [highlight]] = await Promise.all([
    loadHealth(user, entities, year, month, today, entities.length > 1, drop),
    loadTargets(year),
    loadActuals(entities, year, month),
    loadCashYear(year),
    Promise.all(months.map((m) => loadActualPnl(entities, year, [m]))),
    db.select().from(schema.pipelineDeal).where(eq(schema.pipelineDeal.fiscalYear, year)),
    loadObligo(today),
    loadReceivables((e) => entities.includes(e)),
    db
      .select({ area: schema.billingAssurance.area, done: schema.billingAssurance.done, entity: schema.pipelineDeal.entityCode })
      .from(schema.billingAssurance)
      .innerJoin(schema.project, eq(schema.project.id, schema.billingAssurance.projectId))
      .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.project.dealId)),
    loadPortfolio(entities, today),
    db.select().from(schema.bodHighlight).where(and(eq(schema.bodHighlight.scope, scope), eq(schema.bodHighlight.year, year), eq(schema.bodHighlight.month, month))).orderBy(desc(schema.bodHighlight.updatedAt)).limit(1),
  ]);
  // FC11: viewing the dashboard is logged.
  await db.insert(schema.auditLog).values({ actorUserId: user.id, action: "bod.view", subjectType: "dashboard", subjectId: `${scope}:${period}`, after: { scope, period } });

  const rupiah = (v: Money) => formatAmount(v, unit);
  const chart = { decimals: unitDecimals(unit), unitLabel: unitLabel(unit) };
  const n = (v: Money) => scaleTo(v, unit).toNumber();
  const short = (m: number) => MONTH_NAMES[m - 1]!.slice(0, 3);

  const approved = entities.flatMap((e) => (targets.of(e).active ? [targets.of(e).active!] : []));
  const target = approved.length ? consolidateTargets(approved.map(targetsOf)) : null;
  const rows = [...actuals.values()];
  const gauges = [
    { name: "Revenue won bidding", actual: sum(rows.map((r) => r.revenueWon)), target: target?.revenue ?? null, href: "/portofolio" },
    { name: "Cash-in", actual: sum(rows.map((r) => r.cashIn)), target: target?.cashIn ?? null, href: "/piutang" },
  ];
  const trend = months.map((m) => {
    const t = weeklyCashflow(cashYear.openings, cashYear.events, { year, month: m, entities }).total;
    const ebitda = statement(monthly[m - 1]!.companies.flatMap((c) => c.lines)).ebitda;
    return { month: short(m), in: n(t.inDirect.plus(t.inIndirect)), out: n(t.available.minus(t.ending)), ending: n(t.ending), ebitda: n(ebitda) };
  });
  const funnel = pipelineFunnel(deals.filter((d) => entities.includes(d.entityCode)).map((d) => ({ status: d.status, value: d.value, probability: d.probability, createdOn: d.createdAt.toISOString().slice(0, 10) })), today);
  const drawings = obligo.drawings.filter((d) => entities.includes(d.entityCode) && d.owed.gt(0));
  const totalOwed = sum(drawings.map((d) => d.owed));
  const banks = [...new Set(obligo.facilities.filter((f) => !f.entityCode || entities.includes(f.entityCode)).map((f) => f.bankName))].map((bank) => {
    const mine = obligo.facilities.filter((f) => f.bankName === bank && (!f.entityCode || entities.includes(f.entityCode)));
    const ids = new Set(mine.map((f) => f.id));
    const owed = drawings.filter((d) => ids.has(d.facilityId));
    const of = (kind: "bg" | "loan") => sum(owed.filter((d) => d.kind === kind).map((d) => d.owed));
    return { bank, plafon: sum(mine.map((f) => money(f.plafon))), bg: of("bg"), loan: of("loan"), share: totalOwed.gt(0) ? sum(owed.map((d) => d.owed)).times(100).div(totalOwed).toDecimalPlaces(1) : ZERO };
  });
  const aging = agingByCustomer(receivables.open, today);
  const jpmb = assuranceSummary(assurance.filter((a) => entities.includes(a.entity)));
  const top = [...portfolio].filter((p) => p.stage !== "drop").sort((a, b) => b.contract.cmp(a.contract)).slice(0, 10);
  const mayWrite = canEditHighlight(user.actor, entities, org);
  const refreshed = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date());

  const section = (title: string, description: string, href: string | null, body: React.ReactNode) => (
    <Card className="min-w-0 content-start">
      <CardHeader>
        <CardTitle>{href ? <Link href={href} className="hover:underline">{title}</Link> : title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 overflow-x-auto">{body}</CardContent>
    </Card>
  );
  const table = (head: string[], body: (string | React.ReactNode)[][], empty: string) =>
    body.length ? (
      <table className="w-full text-sm">
        <thead>
          <tr>{head.map((h, i) => <th key={h} className={`text-muted-foreground py-1 pr-2 text-xs font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className={`py-1.5 pr-2 ${j ? "tabular text-right" : ""}`}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="text-muted-foreground text-sm">{empty}</p>
    );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={`Dashboard BOD ${MONTH_NAMES[month - 1]} ${year}`}
        description={`${entities.length > 1 ? "Konsolidasi" : entities[0]} · tahun berjalan sampai bulan ini · dalam ${unitLabel(unit)} · diperbarui ${refreshed}`}
        note={<ViewNote ignores={["division"]} />}
      />
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <Input type="month" name="bulan" aria-label="Bulan" defaultValue={period} className="w-48" />
          <Button type="submit" variant="outline">Tampilkan</Button>
        </form>
        <PrintButton />
        {user.actor.role === "auditor" ? <Button asChild variant="ghost"><Link href="/audit">Audit log</Link></Button> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {health.kpis.slice(0, 8).map((k) => (
          <Card key={k.key} data-testid={`tile-${k.key}`} className="content-start gap-1 py-4">
            <CardContent className="grid justify-items-start gap-1 px-4">
              <span className="text-muted-foreground text-xs font-medium">{HEALTH_INFO[k.key].name}</span>
              <span className="tabular text-xl font-semibold">{k.value ? healthFigure(k.key, k.value, unit) : "–"}</span>
              <BandBadge band={k.band} />
              <details className="text-xs">
                <summary className="text-muted-foreground cursor-pointer">Rincian</summary>
                <p>{HEALTH_INFO[k.key].formula}. Sehat: {HEALTH_INFO[k.key].healthy}.</p>
                {k.band && k.band !== "healthy" ? <p>{HEALTH_ACTION[k.key]}</p> : null}
                <Link href={SOURCE[k.key]} className="underline">Buka sumber</Link>
              </details>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        {gauges.map((g) => {
          const share = g.target ? achievement(g.actual, g.target) : null;
          return (
            <div key={g.name} className="min-w-0">
              {section(`${g.name} vs target`, `Target tahunan yang disetujui BOD (${approved.length} dari ${entities.length} perusahaan)`, g.href, (
                <>
                  <span className="tabular text-figure">{rupiah(g.actual)}</span>
                  <span className="text-muted-foreground text-sm">{g.target ? `dari ${rupiah(g.target)} (${share ? share.toString().replace(".", ",") : "0"}%)` : "Target belum disetujui"}</span>
                  <progress className="h-3 w-full" max={100} value={share ? Math.min(100, share.toNumber()) : 0} aria-label={`Capaian ${g.name}`} />
                </>
              ))}
            </div>
          );
        })}
        {section("Tren kas", "Aktual per bulan dari Kas Mingguan", "/cash/mingguan", <TrendChart data={trend} label="Tren kas masuk, keluar dan saldo" series={[{ key: "in", name: "Kas masuk", tone: "var(--success)" }, { key: "out", name: "Kas keluar", tone: "var(--destructive)" }, { key: "ending", name: "Saldo akhir", tone: "var(--primary)" }]} {...chart} />)}
        {section("Tren EBITDA", "Per bulan dari P&L", "/pnl", <TrendChart data={trend} label="Tren EBITDA bulanan" series={[{ key: "ebitda", name: "EBITDA", tone: "var(--primary)", bar: true }]} {...chart} />)}
        {section("Proyeksi kas 12 bulan", "Saldo akhir proyeksi Arus Kas terhadap kas minimum", "/cash", health.forecast ? <CashBalanceChart data={health.forecast.rows.closing.map((v, i) => ({ month: short(i + 1), closing: n(v) }))} minimum={n(health.forecast.rows.minimum[0] ?? ZERO)} {...chart} /> : <p className="text-muted-foreground text-sm">Belum ada proyeksi.</p>)}
        {section("Pipeline", "Deal per status", "/pipeline", table(["Status", "Deal", "Nilai", "Tertimbang"], funnel.map((f) => [DEAL_STATUS_LABEL[f.status], String(f.deals), rupiah(f.value), rupiah(f.weighted)]), "Belum ada deal."))}
        {section("Obligo per bank", "BG dan pinjaman terpakai; porsi di atas 50% ditandai", "/obligo", table(["Bank", "Plafon", "BG", "Pinjaman", "Porsi"], banks.map((b) => [b.bank, rupiah(b.plafon), rupiah(b.bg), rupiah(b.loan), <span key="s" className={b.share.gt(50) ? "text-destructive font-semibold" : ""}>{b.share.toString().replace(".", ",")}%</span>]), "Belum ada fasilitas."))}
        {section("Umur piutang", "Invoice terbit yang belum lunas", "/piutang", table(["Customer", ...AGING_BUCKETS.map((b) => AGING_LABEL[b])], aging.map((a) => [a.customer, ...AGING_BUCKETS.map((b) => rupiah(a.buckets[b]))]), "Tidak ada piutang terbuka."))}
        {section("Assurance JPMB", "Selesai dari total per tahap", "/tracker-telkom", table(["Tahap", "Selesai", "%"], jpmb.map((j) => [ASSURANCE_LABEL[j.area], `${j.done}/${j.total}`, j.percent === null ? "–" : `${j.percent}%`]), "Belum ada data."))}
        {section("Business Health Check", "Enam dimensi", "/kpi/kesehatan", table(["Dimensi", "Nilai", "Status"], CHECK.map(([name, key]) => { const k = health.kpis.find((x) => x.key === key)!; return [name, k.value ? healthFigure(key, k.value, unit) : "–", <BandBadge key={key} band={k.band} />]; }), ""))}
        {section("Stress test kas masuk", "Saldo proyeksi terendah bila kas masuk rencana turun", null, (
          <>
            <form method="get" className="flex flex-wrap items-center gap-2 print:hidden">
              <input type="hidden" name="bulan" value={period} />
              <input type="range" name="turun" min={0} max={100} step={5} defaultValue={drop} aria-label="Penurunan kas masuk (%)" />
              <Button type="submit" variant="outline" size="sm">Hitung</Button>
            </form>
            <p className="text-sm">
              {health.stress.cashIn ? `Turun ${drop}%: saldo terendah ${rupiah(health.stress.cashIn.lowest)} pada ${MONTH_NAMES[health.stress.cashIn.month - 1]}.` : "Belum ada proyeksi Arus Kas."}
            </p>
            {health.stress.cashIn?.lowest.isNegative() ? <p className="text-destructive text-sm">Terpicu: aktifkan opsi tarik BG / KMK atau tunda CapEx.</p> : null}
          </>
        ))}
        {section("10 proyek terbesar", "Menurut nilai kontrak", "/portofolio", table(["Proyek", "Kontrak", "GP %"], top.map((p) => [<Link key={p.id} href={`/portofolio/${p.id}`} className="underline">{p.name}</Link>, rupiah(p.contract), p.gpPct ? `${p.gpPct.toString().replace(".", ",")}%` : "–"]), "Belum ada proyek."))}
      </div>

      {section("Highlight bulanan", mayWrite ? "Ditulis Direktur atau Head FRM" : "Hanya baca", null, mayWrite ? (
        <HighlightForm key={`${scope}:${period}`} scope={scope} year={year} month={month} initial={highlight?.body ?? ""} onSave={saveHighlight} />
      ) : (
        <p className="text-sm whitespace-pre-wrap">{highlight?.body || "Belum ada highlight."}</p>
      ))}
    </div>
  );
}
