import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { CASH_ENTRY_LABEL, can, costClass, formatIdr, money, unitLabel, weeklyCashflow, type CashColumn, type Money } from "@estrada/domain";
import { loadCashYear } from "@/lib/cash-week";
import { displayUnit } from "@/lib/display-unit";
import { formatDate, todayJakarta } from "@/lib/payment";
import { MONTH_NAMES } from "@/lib/period";
import { requireUser } from "@/lib/session";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { CashEntries } from "@/components/erp/cash-entries";
import { KpiCard, KpiStrip } from "@/components/erp/kpi-card";
import { FigureCell } from "@/components/erp/money-cell";
import { PageHeader } from "@/components/erp/page-header";
import { ViewNote } from "@/components/erp/view-note";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { recordCashEntry, reverseCashEntry } from "./actions";

export const metadata: Metadata = { title: "Kas Mingguan" };

const ROWS: { key: keyof CashColumn; label: string; strong?: boolean }[] = [
  { key: "opening", label: "Saldo kas awal" },
  { key: "inDirect", label: "Cash In Direct" },
  { key: "inIndirect", label: "Cash In Indirect (via Telkom)" },
  { key: "loanIn", label: "Pinjaman / injeksi kas" },
  { key: "otherIn", label: "Penerimaan lain" },
  { key: "available", label: "A. Kas tersedia", strong: true },
  { key: "direct", label: "I. Direct Cost (COA 5100–5900)" },
  { key: "opex", label: "II. OPEX (COA 6100–6420)" },
  { key: "otherOut", label: "Pengeluaran lain" },
  { key: "interest", label: "Bunga pinjaman" },
  { key: "repayment", label: "Cicilan KMK / pinjaman" },
  { key: "ending", label: "Saldo kas akhir", strong: true },
];
const CLASS = { direct: "Direct Cost", opex: "OPEX", other: "Lainnya" } as const;
const WEEK_HEADS = ["W1 (1–7)", "W2 (8–14)", "W3 (15–21)", "W4 (22–akhir)"];

export default async function WeeklyCashPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const user = await requireUser();
  const org = await loadOrg();
  if (!can(user.actor, "cash.view", null, org)) redirect("/");
  const today = todayJakarta();
  const asked = (await searchParams).bulan ?? "";
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : today.slice(0, 7);
  const [year, month] = [Number(period.slice(0, 4)), Number(period.slice(5, 7))];
  const [view, unit, companies, accounts, data] = await Promise.all([
    activeView(),
    displayUnit(),
    db.select().from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
    db.select({ code: schema.coaAccount.code, name: schema.coaAccount.name, postable: schema.coaAccount.postable }).from(schema.coaAccount).orderBy(asc(schema.coaAccount.code)),
    loadCashYear(year),
  ]);
  const mine = companies.map((c) => c.code).filter((c) => user.actor.entities.includes("*") || user.actor.entities.includes(c));
  const entities = view.entity && mine.includes(view.entity) ? [view.entity] : mine;
  const cash = weeklyCashflow(data.openings, data.events, { year, month, entities });
  const perEntity = entities.map((e) => ({ entity: e, total: weeklyCashflow(data.openings, data.events, { year, month, entities: [e] }).total }));
  const noOpening = entities.filter((e) => !data.openings.has(e));
  const names = new Map(accounts.map((a) => [a.code, a.name]));
  const title = `${MONTH_NAMES[month - 1]} ${year}`;
  const figure = (v: Money, key: string) => (
    <TableCell key={key} className="text-right">
      <FigureCell value={v} unit={unit} />
    </TableCell>
  );
  const heads = (
    <>
      {WEEK_HEADS.map((w) => (
        <TableHead key={w} className="text-right whitespace-nowrap">
          {w}
        </TableHead>
      ))}
      <TableHead className="text-right">Sebulan</TableHead>
    </>
  );
  const mayRecord = can(user.actor, "cash.record", null, org);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={`Kas Mingguan ${title}`}
        description={`Realisasi kas: penerimaan invoice, Permintaan Pembayaran yang dibayar (nett) dan transaksi yang dicatat Cash Management. ${
          entities.length === 1 ? `Entitas ${entities[0]}.` : `Konsolidasi ${entities.length} entitas aktif.`
        } Angka dalam ${unitLabel(unit)}.`}
        note={<ViewNote ignores={["division"]} />}
      />
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Bulan</span>
          <Input type="month" name="bulan" aria-label="Bulan" defaultValue={period} className="w-48" />
        </label>
        <Button type="submit" variant="outline">
          Tampilkan
        </Button>
      </form>
      {noOpening.length ? (
        <p className="text-destructive text-sm">
          Saldo kas 1 Januari {year} belum diisi untuk {noOpening.join(", ")} (Arus Kas, Asumsi); dihitung nol.
        </p>
      ) : null}
      <KpiStrip>
        <KpiCard label="Saldo awal bulan" value={cash.total.opening} unit={unit} signal />
        <KpiCard label="Kas masuk" value={cash.total.available.minus(cash.total.opening)} unit={unit} note="Termasuk pinjaman" />
        <KpiCard label="Kas keluar" value={cash.total.available.minus(cash.total.ending)} unit={unit} />
        <KpiCard label="Saldo akhir bulan" value={cash.total.ending} unit={unit} signal />
      </KpiStrip>
      <Card>
        <CardHeader>
          <CardTitle>Arus kas per minggu</CardTitle>
          <CardDescription>Saldo akhir satu minggu menjadi saldo awal minggu berikutnya.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pos</TableHead>
                {heads}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((row) => (
                <TableRow key={row.key} data-testid={`cash-${row.key}`} className={row.strong ? "bg-muted/40 font-medium" : ""}>
                  <TableCell className="whitespace-nowrap">{row.label}</TableCell>
                  {cash.weeks.map((w, i) => figure(w[row.key], `${i}`))}
                  {figure(cash.total[row.key], "total")}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {perEntity.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Per entitas</CardTitle>
            <CardDescription>Konsolidasi di atas adalah jumlah baris-baris ini.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entitas</TableHead>
                  <TableHead className="text-right">Saldo awal</TableHead>
                  <TableHead className="text-right">Kas masuk</TableHead>
                  <TableHead className="text-right">Kas keluar</TableHead>
                  <TableHead className="text-right">Saldo akhir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perEntity.map(({ entity, total }) => (
                  <TableRow key={entity} data-testid={`cash-entity-${entity}`}>
                    <TableCell className="font-medium">{entity}</TableCell>
                    {figure(total.opening, "opening")}
                    {figure(total.available.minus(total.opening), "in")}
                    {figure(total.available.minus(total.ending), "out")}
                    {figure(total.ending, "ending")}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Kas keluar per akun</CardTitle>
          <CardDescription>Biaya yang dibayar menurut COA baris anggaran atau transaksi.</CardDescription>
        </CardHeader>
        <CardContent>
          {cash.accounts.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Akun</TableHead>
                  {heads}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cash.accounts.map((a) => (
                  <TableRow key={a.coaCode} data-testid={`cash-account-${a.coaCode}`}>
                    <TableCell className="min-w-56 whitespace-normal">
                      {a.coaCode ? `${a.coaCode} · ${names.get(a.coaCode) ?? ""}` : "Tanpa baris anggaran"}
                      <span className="text-muted-foreground block text-xs">{CLASS[a.class]}</span>
                    </TableCell>
                    {a.weeks.map((w, i) => figure(w, `${i}`))}
                    {figure(a.total, "total")}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">Belum ada biaya dibayar pada bulan ini.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Transaksi kas lain</CardTitle>
          <CardDescription>Pinjaman, bunga, cicilan, kas kecil dan transaksi lain di luar invoice dan Permintaan Pembayaran. Nilai penuh dalam rupiah.</CardDescription>
        </CardHeader>
        <CardContent>
          <CashEntries
            rows={data.entries
              .filter(({ entry: e }) => e.onDate.startsWith(period) && entities.includes(e.entityCode))
              .map(({ entry: e, by }) => ({
                id: e.id,
                date: formatDate(e.onDate),
                entity: e.entityCode,
                kind: e.coaCode ? `${CASH_ENTRY_LABEL[e.kind]} (${e.coaCode})` : CASH_ENTRY_LABEL[e.kind],
                amount: formatIdr(money(e.amount)),
                description: e.description,
                by,
                reversal: e.reversedAt ? (e.reversalReason ?? "") : null,
              }))}
            form={mayRecord ? { entities: mine, today, accounts: accounts.filter((a) => a.postable && costClass(a.code) !== "other").map((a) => ({ code: a.code, label: `${a.code} · ${a.name}` })) } : null}
            onRecord={recordCashEntry}
            onReverse={reverseCashEntry}
          />
        </CardContent>
      </Card>
    </div>
  );
}
