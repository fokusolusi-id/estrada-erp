import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  DEFAULT_SCENARIOS, DEFAULT_SEASONALITY, SCENARIOS, SCENARIO_LABEL, ZERO, burnAndRunway, canCash, formatIdr, money, scenarioForecast, sensitivity, sum, unitLabel,
  type Money, type ScenarioKey,
} from "@estrada/domain";
import { loadCash } from "@/lib/cash";
import { displayUnit } from "@/lib/display-unit";
import { reportVersions, loadScopedLines } from "@/lib/rka";
import { requireUser } from "@/lib/session";
import { KpiCard, KpiStrip } from "@/components/erp/kpi-card";
import { FigureCell } from "@/components/erp/money-cell";
import { PageHeader } from "@/components/erp/page-header";
import { ScenarioForm } from "@/components/erp/scenario-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveScenarios } from "./actions";

export const metadata: Metadata = { title: "Skenario" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export default async function ScenarioPage({ searchParams }: { searchParams: Promise<{ skenario?: string }> }) {
  const user = await requireUser();
  if (!canCash(user.actor, "view")) notFound();
  const [version] = await reportVersions();
  if (!version) {
    return (
      <div className="grid gap-2">
        <h1 className="text-page">Skenario</h1>
        <p className="text-muted-foreground text-sm">Belum ada siklus RKA.</p>
      </div>
    );
  }
  const year = version.fiscalYear;
  const asked = (await searchParams).skenario;
  const key: ScenarioKey = SCENARIOS.find((k) => k === asked) ?? "normal";
  const [unit, [setting], cash, lines] = await Promise.all([
    displayUnit(),
    db.select().from(schema.scenarioSetting).where(eq(schema.scenarioSetting.fiscalYear, year)),
    loadCash(user, year),
    loadScopedLines(user, undefined, version.id),
  ]);
  const scenarios = setting?.scenarios ?? DEFAULT_SCENARIOS;
  const seasonality = setting?.seasonality ?? DEFAULT_SEASONALITY;

  // The group's position: every company's 1 January balances and loans, as typed on Arus Kas.
  const openings = [...(cash?.openings.values() ?? [])];
  const total = (pick: (o: (typeof openings)[number]) => Money) => sum(openings.map(pick));
  const opening = { cash: total((o) => o.cash), receivables: total((o) => o.receivables), payables: total((o) => o.payables), priorYearTax: total((o) => o.priorYearTax), minimumCash: cash?.settings?.minimumCash ?? ZERO };
  const loan = (pick: (f: NonNullable<typeof cash>["facilities"][number]) => Money[]) => Array.from({ length: 12 }, (_, i) => sum((cash?.facilities ?? []).map((f) => pick(f)[i]!)));
  const loans = { drawdown: loan((f) => f.drawdown), repayment: loan((f) => f.repayment), interest: loan((f) => f.interest) };
  const run = (k: ScenarioKey) => {
    const f = scenarioForecast(scenarios[k], seasonality, opening, loans);
    const net = f.pnl.profitBeforeTax.minus(f.pnl.tax.total);
    return { f, net, lowest: f.rows.closing.reduce((a, b) => (b.lt(a) ? b : a)), end: f.rows.closing[11]! };
  };
  const all = SCENARIOS.map((k) => ({ k, ...run(k) }));
  const chosen = all.find((a) => a.k === key)!;
  const { f } = chosen;
  const { burn, runway } = burnAndRunway(f.rows);
  const grid = sensitivity(scenarios[key]);

  const rka = (category: string) => sum(lines.filter((l) => l.category === category).flatMap((l) => l.months));
  const revenue = rka("Revenue");
  const share = (c: string) => rka(c).times(100).div(revenue).toDecimalPlaces(2).toFixed();
  const fromRka = revenue.gt(0) ? { revenue: formatIdr(revenue).replace("Rp ", ""), cogsPct: share("COGS"), opexPct: share("OPEX"), capex: formatIdr(rka("CAPEX")).replace("Rp ", "") } : null;
  const shown = (s: string) => formatIdr(money(s)).replace("Rp ", "");

  const monthly: [string, readonly Money[], boolean?][] = [
    ["Pendapatan", f.pnl.revenue.months],
    ["COGS", f.pnl.cogs.months],
    ["OpEx", f.pnl.opex.months],
    ["Penyusutan (CapEx / 12)", f.pnl.depreciation.months],
    ["Bunga pinjaman", f.pnl.others.months],
    ["Pajak", f.pnl.tax.months],
    ["Saldo kas awal", f.rows.opening, true],
    ["Kas masuk", f.rows.receipts],
    ["Bayar vendor", f.rows.cogsPaid],
    ["Bayar OpEx", f.rows.opexPaid],
    ["Bunga dibayar", f.rows.interestPaid],
    ["Pajak dibayar", f.rows.taxPaid],
    ["CapEx dibayar", f.rows.capexPaid],
    ["Pendanaan (pinjaman − cicilan)", f.rows.financing],
    ["Saldo kas akhir", f.rows.closing, true],
    ["Burn rate (rata-rata 3 bulan)", burn],
  ];
  const card = (title: string, description: string, content: React.ReactNode) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4">{content}</CardContent>
    </Card>
  );
  const figure = (v: Money, k: string | number, warn = false) => (
    <TableCell key={k} className={`text-right ${warn ? "text-destructive font-medium" : ""}`}>
      <FigureCell value={v} unit={unit} />
    </TableCell>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={`Skenario ${year}`} description={`Proyeksi konsolidasi dari asumsi per skenario, dengan aturan kas Arus Kas. Angka dalam ${unitLabel(unit)}.`} />
      {cash?.settings ? null : <p className="text-destructive text-sm">Asumsi Arus Kas {year} belum diisi: saldo awal, pinjaman dan saldo minimum dihitung nol.</p>}
      {setting ? null : <p className="text-muted-foreground text-sm">Belum disimpan untuk {year}: angka awal dari sheet 22_Assumptions (FY2026).</p>}
      {card(
        "Tiga skenario",
        "Laba bersih sesudah pajak dan posisi kas setahun.",
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Skenario</TableHead>
              <TableHead className="text-right">Pendapatan</TableHead>
              <TableHead className="text-right">Laba bersih</TableHead>
              <TableHead className="text-right">Kas terendah</TableHead>
              <TableHead className="text-right">Kas akhir tahun</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {all.map((a) => (
              <TableRow key={a.k} data-testid={`scenario-${a.k}`} className={a.k === key ? "bg-muted/40 font-medium" : ""}>
                <TableCell>
                  <Link href={`/cash/skenario?skenario=${a.k}`} className="underline-offset-4 hover:underline">
                    {SCENARIO_LABEL[a.k]}
                  </Link>
                </TableCell>
                {figure(a.f.pnl.revenue.total, "revenue")}
                {figure(a.net, "net", a.net.isNegative())}
                {figure(a.lowest, "lowest", a.lowest.lt(opening.minimumCash))}
                {figure(a.end, "end", a.end.lt(opening.minimumCash))}
              </TableRow>
            ))}
          </TableBody>
        </Table>,
      )}
      <nav aria-label="Pilih skenario" className="flex flex-wrap gap-2">
        {SCENARIOS.map((k) => (
          <Button key={k} asChild size="sm" variant={k === key ? "default" : "outline"}>
            <Link href={`/cash/skenario?skenario=${k}`}>{SCENARIO_LABEL[k]}</Link>
          </Button>
        ))}
      </nav>
      <KpiStrip>
        <KpiCard label="Laba bersih" value={chosen.net} unit={unit} signal />
        <KpiCard label="Kas akhir tahun" value={chosen.end} unit={unit} signal />
        <KpiCard label="Kas terendah" value={chosen.lowest} unit={unit} signal note={MONTHS[f.rows.closing.indexOf(chosen.lowest)] ?? ""} />
      </KpiStrip>
      {card(
        `Proyeksi bulanan ${SCENARIO_LABEL[key]}`,
        "Saldo merah: di bawah saldo kas minimum. Runway = saldo akhir dibagi burn rate, dalam bulan.",
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pos</TableHead>
              {MONTHS.map((m) => (
                <TableHead key={m} className="text-right">
                  {m}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthly.map(([label, values, strong]) => (
              <TableRow key={label} className={strong ? "bg-muted/40 font-medium" : ""}>
                <TableCell className="whitespace-nowrap">{label}</TableCell>
                {values.map((v, i) => figure(v, i, label === "Saldo kas akhir" && v.lt(opening.minimumCash)))}
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="whitespace-nowrap">Runway (bulan)</TableCell>
              {runway.map((r, i) => (
                <TableCell key={i} className="tabular text-right">
                  {r ? r.toFixed(1).replace(".", ",") : "–"}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>,
      )}
      {card(
        "Sensitivitas laba bersih",
        `Pendapatan ${SCENARIO_LABEL[key]} × (1 − COGS% − OpEx%) × (1 − pajak), tanpa penyusutan dan bunga. Baris COGS %, kolom OpEx %; di bawah angka, margin EBITDA.`,
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>COGS \ OpEx</TableHead>
              {grid.opex.map((o) => (
                <TableHead key={o.toString()} className="text-right">
                  {o.toString()}%
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {grid.cells.map((row, i) => (
              <TableRow key={grid.cogs[i]!.toString()}>
                <TableCell className="font-medium">{grid.cogs[i]!.toString()}%</TableCell>
                {row.map((c, j) => (
                  <TableCell key={j} className={`text-right ${i === 3 && j === 3 ? "bg-muted font-semibold" : ""} ${c.netProfit.isNegative() ? "text-destructive" : ""}`}>
                    <FigureCell value={c.netProfit} unit={unit} />
                    <span className="text-muted-foreground block text-xs">{c.ebitdaMargin.toString()}%</span>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>,
      )}
      {canCash(user.actor, "manage")
        ? card(
            "Asumsi skenario",
            "Diisi Finance. DSO dan DPO dibulatkan ke bulan untuk jeda penagihan dan pembayaran.",
            <ScenarioForm
              fromRka={fromRka}
              seasonality={seasonality}
              onSave={saveScenarios}
              initial={Object.fromEntries(
                SCENARIOS.map((k) => {
                  const d = scenarios[k];
                  return [k, { ...d, revenue: shown(d.revenue), capex: shown(d.capex), dso: String(d.dso), dpo: String(d.dpo) }];
                }),
              ) as Record<ScenarioKey, { revenue: string; cogsPct: string; opexPct: string; taxPct: string; dso: string; dpo: string; capex: string }>}
            />,
          )
        : null}
    </div>
  );
}
