import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db, schema } from "@estrada/db";
import { canViewPortfolio, formatAmount, money, type Money } from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { bodScope } from "@/lib/bod";
import { formatDate } from "@/lib/payment";
import { loadPortfolio } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Transaksi Proyek" };

export default async function PortfolioProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!canViewPortfolio(user.actor, await loadOrg())) redirect("/");
  const [{ id }, { today, entities }, unit] = await Promise.all([params, bodScope(user, undefined), displayUnit()]);
  const p = (await loadPortfolio(entities, today)).find((x) => x.id === id);
  if (!p) notFound();
  // FC10: the drill-down is logged.
  await db.insert(schema.auditLog).values({ actorUserId: user.id, action: "bod.view", subjectType: "portfolio_project", subjectId: p.id, after: { project: p.name } });
  const rupiah = (v: Money) => formatAmount(v, unit);
  const list = (title: string, description: string, items: { key: string; href: string; label: string; note: string; amount: Money }[]) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {items.length ? (
          items.map((r) => (
            <div key={r.key} className="flex flex-wrap justify-between gap-2 border-b pb-2 text-sm">
              <span>
                <Link href={r.href} className="font-medium underline">{r.label}</Link> <span className="text-muted-foreground">{r.note}</span>
              </span>
              <span className="tabular">{rupiah(r.amount)}</span>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground text-sm">Belum ada.</p>
        )}
      </CardContent>
    </Card>
  );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={p.name} description={`${p.customer} · ${p.entity} · kontrak ${rupiah(p.contract)} · GP ${rupiah(p.grossProfit)}`} />
      <Link href="/portofolio" className="text-sm underline">Kembali ke portofolio</Link>
      {list("Invoice terbit", "Revenue (DPP)", p.invoices.map((i) => ({ key: i.id, href: `/invoice/${i.id}`, label: i.number ?? "Invoice", note: formatDate(i.invoicedOn), amount: money(i.dpp) })))}
      {list("Pembayaran lunas", "COGS", p.costs.map((r) => ({ key: r.id, href: `/pembayaran/${r.id}`, label: r.number ?? "Pembayaran", note: r.paidOn ? formatDate(r.paidOn) : "", amount: money(r.gross) })))}
      {list("Bank Garansi aktif", "Nilai BG yang masih berjalan", p.guarantees.map((g) => ({ key: g.id, href: "/obligo", label: g.reference ?? g.underlying, note: g.dueOn ? `jatuh tempo ${formatDate(g.dueOn)}` : "", amount: money(g.amount) })))}
    </div>
  );
}
