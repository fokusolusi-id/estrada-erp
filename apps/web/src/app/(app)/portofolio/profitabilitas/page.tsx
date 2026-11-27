import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LIFECYCLE_LABEL, PROFIT_RATING_LABEL, canViewPortfolio, formatAmount, profitability, rankByNet, sum, unitLabel, ZERO, type Money, type ProfitRating } from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { bodScope } from "@/lib/bod";
import { loadProfitability } from "@/lib/profitability";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { ViewNote } from "@/components/erp/view-note";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Profitabilitas Proyek" };

const TONE: Record<ProfitRating, string> = { excellent: "bg-success text-white", good: "bg-success/60 text-black", marginal: "bg-state-finance/80 text-black", loss: "bg-destructive text-white" };

export default async function ProfitabilityPage() {
  const user = await requireUser();
  if (!canViewPortfolio(user.actor, await loadOrg())) redirect("/");
  const [{ today, year, entities }, unit] = await Promise.all([bodScope(user, undefined), displayUnit()]);
  const { rows, taxRate, hasRka } = await loadProfitability(entities, year, today);
  const rupiah = (v: Money | null) => (v ? formatAmount(v, unit) : "–");
  const percent = (v: Money | null) => (v ? `${v.toString().replace(".", ",")}%` : "–");
  const ranked = rankByNet(rows);
  const ordered = [...ranked, ...rows.filter((r) => !ranked.includes(r)).sort((a, b) => b.contract.cmp(a.contract))];
  // Totals compare like with like: only the projects that have a rating.
  const total = (pick: (r: (typeof rows)[number]) => Money) => sum(ranked.map(pick));
  const all = profitability(total((r) => r.contract), total((r) => r.cogs), total((r) => r.opex ?? ZERO), taxRate);
  const cells = (r: { contract: Money; cogs: Money; opex: Money | null; grossProfit: Money; gpPct: Money | null; ebitda: Money | null; ebitdaPct: Money | null; net: Money | null; netPct: Money | null }) => [
    rupiah(r.contract), rupiah(r.cogs), rupiah(r.opex), rupiah(r.grossProfit), percent(r.gpPct), rupiah(r.ebitda), percent(r.ebitdaPct), rupiah(r.net), percent(r.netPct),
  ];
  const list = (title: string, items: typeof ranked) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1 text-sm">
        {items.length ? (
          items.map((r) => (
            <div key={r.id} className="flex justify-between gap-2 border-b py-1">
              <Link href={`/portofolio/${r.id}`} className="underline">{r.name}</Link>
              <span className="tabular whitespace-nowrap">{rupiah(r.net)} · {percent(r.netPct)}</span>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">Belum ada proyek yang bisa dinilai.</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={`Profitabilitas Proyek ${year}`}
        description={`Nilai kontrak dikurangi pembayaran COGS yang sudah lunas dan porsi OPEX RKA menurut nilai kontrak; net setelah pajak ${taxRate.times(100).toString().replace(".", ",")}%. Dalam ${unitLabel(unit)}.`}
        note={<ViewNote ignores={["division"]} />}
      />
      {hasRka ? null : <p className="text-destructive text-sm">Belum ada RKA {year}: porsi OPEX, EBITDA dan rating tidak dihitung.</p>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        {list("3 teratas menurut net profit", ranked.slice(0, 3))}
        {list("3 terbawah (perlu ditinjau)", ranked.length > 3 ? ranked.slice(-Math.min(3, ranked.length - 3)).reverse() : [])}
      </div>
      <Card>
        <CardContent className="overflow-x-auto">
          {ordered.length ? (
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr>
                  {["Proyek", "Kontrak", "COGS", "Porsi OPEX", "Gross profit", "GP %", "EBITDA", "EBITDA %", "Net profit", "Net %", "Rating"].map((h, i) => (
                    <th key={h} className={`text-muted-foreground py-1 pr-3 text-xs font-medium ${i && i < 10 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordered.map((r) => (
                  <tr key={r.id} data-testid="profit-row" className="border-t">
                    <td className="py-2 pr-3">
                      <Link href={`/portofolio/${r.id}`} className="font-medium underline">{r.name}</Link>
                      <div className="text-muted-foreground text-xs">{r.customer} · {r.entity} · {LIFECYCLE_LABEL[r.stage]}</div>
                    </td>
                    {cells(r).map((c, i) => <td key={i} className="tabular pr-3 text-right whitespace-nowrap">{c}</td>)}
                    <td className="whitespace-nowrap">{r.rating ? <Badge className={`border-transparent ${TONE[r.rating]}`}>{PROFIT_RATING_LABEL[r.rating]}</Badge> : <span className="text-muted-foreground text-xs">{r.cogs.isZero() ? "Belum ada biaya" : "Belum dinilai"}</span>}</td>
                  </tr>
                ))}
                {ranked.length ? (
                  <tr className="border-t font-semibold">
                    <td className="py-2 pr-3">Total {ranked.length} proyek dinilai</td>
                    {cells({ contract: total((r) => r.contract), cogs: total((r) => r.cogs), opex: total((r) => r.opex ?? ZERO), ...all }).map((c, i) => <td key={i} className="tabular pr-3 text-right whitespace-nowrap">{c}</td>)}
                    <td />
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <p className="text-muted-foreground text-sm">Belum ada proyek.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
