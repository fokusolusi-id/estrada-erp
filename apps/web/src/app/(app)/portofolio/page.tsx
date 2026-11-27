import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DELIVERY_HEALTH_LABEL, LIFECYCLE_LABEL, canViewPortfolio, formatAmount, portfolioFigures, sum, unitLabel, type Lifecycle, type Money } from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { bodScope } from "@/lib/bod";
import { loadPortfolio, type PortfolioRow } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { ViewNote } from "@/components/erp/view-note";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Portofolio Proyek" };

const SORT: Record<string, { label: string; compare: (a: PortfolioRow, b: PortfolioRow) => number }> = {
  nilai: { label: "Nilai kontrak", compare: (a, b) => b.contract.cmp(a.contract) },
  gp: { label: "GP % tertinggi", compare: (a, b) => Number(b.gpPct ?? -Infinity) - Number(a.gpPct ?? -Infinity) || 0 },
  rendah: { label: "GP % terendah", compare: (a, b) => Number(a.gpPct ?? Infinity) - Number(b.gpPct ?? Infinity) || 0 },
  piutang: { label: "Piutang", compare: (a, b) => b.receivable.cmp(a.receivable) },
};

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ urut?: string; status?: string }> }) {
  const user = await requireUser();
  if (!canViewPortfolio(user.actor, await loadOrg())) redirect("/");
  const asked = await searchParams;
  const [{ today, entities }, unit] = await Promise.all([bodScope(user, undefined), displayUnit()]);
  const sort = SORT[asked.urut ?? ""] ? asked.urut! : "nilai";
  const status = Object.keys(LIFECYCLE_LABEL).includes(asked.status ?? "") ? (asked.status as Lifecycle) : null;
  const rows = (await loadPortfolio(entities, today)).filter((p) => !status || p.stage === status).sort(SORT[sort]!.compare);
  const rupiah = (v: Money) => formatAmount(v, unit);
  const percent = (v: Money | null) => (v ? `${v.toString().replace(".", ",")}%` : "–");
  const total = (pick: (p: PortfolioRow) => Money) => sum(rows.map(pick));
  const all = portfolioFigures(total((p) => p.revenue), total((p) => p.cogs));
  const head = ["Kontrak", "Revenue", "COGS", "Gross profit", "GP %", "Kas masuk", "Piutang", "BG"];
  const cells = (p: Pick<PortfolioRow, "contract" | "revenue" | "cogs" | "grossProfit" | "gpPct" | "cashIn" | "receivable" | "bg">) =>
    [rupiah(p.contract), rupiah(p.revenue), rupiah(p.cogs), rupiah(p.grossProfit), percent(p.gpPct), rupiah(p.cashIn), rupiah(p.receivable), rupiah(p.bg)];
  const href = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(Object.entries({ urut: sort, status, ...next }).filter((e): e is [string, string] => !!e[1]));
    return `/portofolio?${q}`;
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Portofolio Proyek"
        description={`Revenue dari invoice terbit (DPP), COGS dari pembayaran lunas akun COGS. Dalam ${unitLabel(unit)}.`}
        note={<ViewNote ignores={["division"]} />}
      />
      <div className="flex flex-wrap gap-2">
        <span className="text-muted-foreground self-center text-xs">Urut</span>
        {Object.entries(SORT).map(([k, s]) => (
          <Button key={k} asChild size="sm" variant={k === sort ? "default" : "outline"}>
            <Link href={href({ urut: k })}>{s.label}</Link>
          </Button>
        ))}
        <span className="text-muted-foreground ml-3 self-center text-xs">Status</span>
        {[null, ...(Object.keys(LIFECYCLE_LABEL) as Lifecycle[])].map((k) => (
          <Button key={k ?? "all"} asChild size="sm" variant={k === status ? "default" : "outline"}>
            <Link href={href({ status: k })}>{k ? LIFECYCLE_LABEL[k] : "Semua"}</Link>
          </Button>
        ))}
      </div>
      <Card>
        <CardContent className="overflow-x-auto">
          {rows.length ? (
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr>
                  <th className="text-muted-foreground py-1 text-left text-xs font-medium">Proyek</th>
                  <th className="text-muted-foreground py-1 text-left text-xs font-medium">Status</th>
                  {head.map((h) => <th key={h} className="text-muted-foreground py-1 pl-3 text-right text-xs font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} data-testid="portfolio-row" className="border-t">
                    <td className="py-2 pr-3">
                      <Link href={`/portofolio/${p.id}`} className="font-medium underline">{p.name}</Link>
                      <div className="text-muted-foreground text-xs">{p.customer} · {p.entity}</div>
                    </td>
                    <td className="pr-3">
                      <Badge variant="outline">{LIFECYCLE_LABEL[p.stage]}</Badge>
                      {p.health ? <Badge className={`ml-1 border-transparent ${p.health === "on_track" ? "bg-success text-white" : p.health === "at_risk" ? "bg-state-finance/80 text-black" : "bg-destructive text-white"}`}>{DELIVERY_HEALTH_LABEL[p.health]}</Badge> : null}
                    </td>
                    {cells(p).map((c, i) => <td key={i} className="tabular pl-3 text-right whitespace-nowrap">{c}</td>)}
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="py-2" colSpan={2}>Total {rows.length} proyek</td>
                  {cells({ contract: total((p) => p.contract), revenue: total((p) => p.revenue), cogs: total((p) => p.cogs), ...all, cashIn: total((p) => p.cashIn), receivable: total((p) => p.receivable), bg: total((p) => p.bg) }).map((c, i) => <td key={i} className="tabular pl-3 text-right whitespace-nowrap">{c}</td>)}
                </tr>
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
