import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { PERIOD_STATUS_LABEL, can, closingProblem, formatIdr, money, sum, type PnlLine } from "@estrada/domain";
import { balanceOf, loadMonthPnl } from "@/lib/closing";
import { MONTH_NAMES } from "@/lib/period";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { BalanceForm } from "@/components/erp/balance-form";
import { PageHeader } from "@/components/erp/page-header";
import { ViewNote } from "@/components/erp/view-note";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveBalanceSheet } from "./actions";

export const metadata: Metadata = { title: "Tutup Buku" };

const WHEN = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const BALANCE = [
  ["currentAssets", "Aset lancar"],
  ["totalAssets", "Total aset"],
  ["currentLiabilities", "Liabilitas jangka pendek"],
  ["totalLiabilities", "Total liabilitas"],
  ["equity", "Ekuitas"],
] as const;
const GATE = { missing: "Neraca belum diisi: bulan ini belum bisa ditutup.", unbalanced: "Neraca belum seimbang (aset harus sama dengan liabilitas ditambah ekuitas): bulan ini belum bisa ditutup." };

export default async function ClosingPage({ searchParams }: { searchParams: Promise<{ bulan?: string; versi?: string }> }) {
  const user = await requireUser();
  const org = await loadOrg();
  if (!can(user.actor, "closing.view", null, org)) redirect("/");
  const today = todayJakarta();
  const asked = await searchParams;
  // The month being closed is normally the one just ended.
  const previous = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked.bulan ?? "") ? asked.bulan! : previous;
  const [year, month] = [Number(period.slice(0, 4)), Number(period.slice(5, 7))];
  const [view, companies, periods, sheets, snapshots] = await Promise.all([
    activeView(),
    db.select({ code: schema.companyEntity.code, name: schema.companyEntity.name }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
    db.select().from(schema.fiscalPeriod).where(and(eq(schema.fiscalPeriod.year, year), eq(schema.fiscalPeriod.month, month))),
    db.select().from(schema.balanceSheet).where(and(eq(schema.balanceSheet.year, year), eq(schema.balanceSheet.month, month))),
    db
      .select({ snapshot: schema.pnlSnapshot, by: schema.user.name })
      .from(schema.pnlSnapshot)
      .innerJoin(schema.user, eq(schema.user.id, schema.pnlSnapshot.takenBy))
      .where(and(eq(schema.pnlSnapshot.year, year), eq(schema.pnlSnapshot.month, month)))
      .orderBy(desc(schema.pnlSnapshot.version)),
  ]);
  const mine = companies.filter((c) => user.actor.entities.includes("*") || user.actor.entities.includes(c.code));
  const shown = view.entity && mine.some((c) => c.code === view.entity) ? mine.filter((c) => c.code === view.entity) : mine;
  const mayRecord = can(user.actor, "balance.record", null, org);
  const mayClose = can(user.actor, "period.view", null, org);
  const title = `${MONTH_NAMES[month - 1]} ${year}`;

  const cards = await Promise.all(
    shown.map(async (c) => {
      const status = periods.find((p) => p.entityCode === c.code)?.status ?? "open";
      const history = snapshots.filter((s) => s.snapshot.entityCode === c.code);
      const picked = history.find((s) => asked.versi === s.snapshot.id) ?? (status === "closed" ? history[0] : undefined);
      const row = sheets.find((s) => s.entityCode === c.code);
      // A closed month, or a version picked from the history, reads from its snapshot; otherwise the books as they are now.
      const lines: PnlLine[] = picked
        ? picked.snapshot.data.lines.map((l) => ({ ...l, category: l.category as PnlLine["category"], amount: money(l.amount) }))
        : (await loadMonthPnl(db, c.code, year, month)).lines;
      const revenue = sum(lines.filter((l) => l.category === "Revenue").map((l) => l.amount));
      const cost = sum(lines.filter((l) => l.category !== "Revenue").map((l) => l.amount));
      const balance: Record<string, string> | null = picked ? picked.snapshot.data.balance : row ? Object.fromEntries(BALANCE.map(([k]) => [k, row[k]])) : null;
      const gate = closingProblem(balanceOf(row));
      return (
        <Card key={c.code} data-testid={`closing-${c.code}`}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {c.code} · {c.name}
              <Badge variant={status === "closed" ? "default" : status === "closing" ? "secondary" : "outline"}>{PERIOD_STATUS_LABEL[status]}</Badge>
            </CardTitle>
            <CardDescription>
              {picked ? `Snapshot versi ${picked.snapshot.version}, diambil ${WHEN.format(picked.snapshot.takenAt)} oleh ${picked.by}. Tidak bisa diubah.` : "Angka berjalan dari pembukuan; snapshot diambil saat bulan ditutup."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4">
            {status !== "closed" && gate ? <p className="text-destructive text-sm">{GATE[gate]}</p> : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Laba rugi {title}</TableHead>
                  <TableHead>Kelompok</TableHead>
                  <TableHead className="text-right">Rupiah</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={`${l.coaCode}-${l.name}`}>
                    <TableCell className="whitespace-normal">{l.coaCode ? `${l.coaCode} · ${l.name}` : l.name}</TableCell>
                    <TableCell>{l.category}</TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">{formatIdr(l.amount)}</TableCell>
                  </TableRow>
                ))}
                {(
                  [
                    ["Pendapatan", revenue],
                    ["Biaya", cost],
                    ["Laba (rugi)", revenue.minus(cost)],
                  ] as const
                ).map(([label, value]) => (
                  <TableRow key={label} className="bg-muted/40 font-medium">
                    <TableCell colSpan={2}>{label}</TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">{formatIdr(value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {mayRecord && status !== "closed" && !picked ? (
              <BalanceForm
                key={`${c.code}-${period}`}
                onSave={saveBalanceSheet}
                initial={{
                  entityCode: c.code,
                  period,
                  ...(Object.fromEntries(BALANCE.map(([k]) => [k, row ? (k === "equity" ? row[k].replace(/\.00$/, "") : formatIdr(money(row[k])).replace("Rp ", "")) : ""])) as Record<(typeof BALANCE)[number][0], string>),
                }}
              />
            ) : balance ? (
              <Table>
                <TableBody>
                  {BALANCE.map(([k, label]) => (
                    <TableRow key={k}>
                      <TableCell>{label}</TableCell>
                      <TableCell className="tabular text-right whitespace-nowrap">{formatIdr(money(balance[k]!))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-sm">Neraca belum diisi.</p>
            )}
            {history.length ? (
              <p className="text-muted-foreground text-xs">
                Riwayat snapshot:{" "}
                {history.map((s, i) => (
                  <span key={s.snapshot.id}>
                    {i ? " · " : ""}
                    <Link href={`/closing?bulan=${period}&versi=${s.snapshot.id}`} className="underline underline-offset-4">
                      versi {s.snapshot.version} ({WHEN.format(s.snapshot.takenAt)})
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </CardContent>
        </Card>
      );
    }),
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={`Tutup Buku ${title}`} description="Laba rugi dari invoice terbit, pembayaran, akrual dan bunga pada bulan itu, dan total neraca yang diisi Accounting. Rupiah penuh." note={<ViewNote ignores={["division"]} />} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Bulan</span>
            <Input type="month" name="bulan" aria-label="Bulan" defaultValue={period} className="w-48" />
          </label>
          <Button type="submit" variant="outline">
            Tampilkan
          </Button>
        </form>
        {mayClose ? (
          <Button asChild variant="outline">
            <Link href="/master/periode">Tutup atau buka periode</Link>
          </Button>
        ) : null}
      </div>
      {cards}
    </div>
  );
}
