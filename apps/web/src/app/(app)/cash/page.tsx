import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canCash, cashWaterfall, money, scaleTo, sum, unitDecimals, unitLabel, ZERO, type CashForecast, type Money } from "@estrada/domain";
import { CONSOLIDATED, loadCash } from "@/lib/cash";
import { displayUnit } from "@/lib/display-unit";
import { requireUser } from "@/lib/session";
import { CashAssumptions } from "@/components/erp/cash-assumptions";
import { CashTable, type CashRow } from "@/components/erp/cash-table";
import { CashBalanceChart, WaterfallChart } from "@/components/erp/charts";
import { KpiCard, KpiStrip } from "@/components/erp/kpi-card";
import { PageHeader } from "@/components/erp/page-header";
import { LoanEditor } from "@/components/erp/loan-editor";
import { MONTHS } from "@/components/erp/budget-grid";
import { activeView } from "@/lib/view-filter";
import { ViewNote } from "@/components/erp/view-note";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { carryCashFromPrior, deleteLoan, saveCashAssumptions, saveLoan } from "./actions";
import { ActionButton } from "@/components/erp/action-button";
import { CalendarArrowUp } from "lucide-react";
import { eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";

export const metadata: Metadata = { title: "Arus Kas" };

const total = (m: readonly Money[]) => sum([...m]);

const STEP_LABEL = {
  opening: "Awal",
  receipts: "Terima",
  cogs: "COGS",
  opex: "OPEX",
  interest: "Bunga",
  tax: "Pajak",
  capex: "Capex",
  financing: "Pinjam",
  closing: "Akhir",
} as const;

function cashRows(f: CashForecast): CashRow[] {
  const r = f.rows;
  return [
    { key: "receipts", section: "Aktivitas operasi", label: "Penerimaan dari pelanggan", months: r.receipts, total: total(r.receipts) },
    { key: "cogs", label: "Pembayaran COGS ke vendor", months: r.cogsPaid, total: total(r.cogsPaid) },
    { key: "opex", label: "Pembayaran OPEX", months: r.opexPaid, total: total(r.opexPaid) },
    { key: "interest", label: "Bunga & biaya bank", months: r.interestPaid, total: total(r.interestPaid) },
    { key: "tax", label: "Pajak (PPh 25 + PPh 29)", months: r.taxPaid, total: total(r.taxPaid) },
    { key: "operating", signal: true, label: "Arus kas operasi", months: r.operating, total: total(r.operating), derived: true },
    { key: "capex", section: "Investasi dan pendanaan", label: "Belanja modal (Capex)", months: r.capexPaid, total: total(r.capexPaid) },
    { key: "financing", label: "Pencairan / (pelunasan) pinjaman", months: r.financing, total: total(r.financing) },
    { key: "net", signal: true, label: "Arus kas bersih", months: r.net, total: total(r.net), derived: true },
    { key: "opening", section: "Saldo kas", label: "Saldo kas awal", months: r.opening },
    { key: "closing", signal: true, label: "Saldo kas akhir", months: r.closing, derived: true },
    { key: "minimum", label: "Saldo kas minimum", months: r.minimum },
    { key: "surplus", signal: true, label: "Surplus / (defisit) terhadap minimum", months: r.surplus },
    { key: "funding", label: "Kebutuhan tambahan pendanaan", months: r.fundingNeed, derived: true },
    { key: "receivables", section: "Modal kerja", label: "Piutang usaha akhir bulan", months: r.receivablesEnd },
    { key: "payables", label: "Utang usaha vendor akhir bulan", months: r.payablesEnd },
  ];
}

function pnlRows(f: CashForecast): CashRow[] {
  const p = f.pnl;
  const pbt = p.revenue.months.map((v, i) => v.minus(p.cogs.months[i]!).minus(p.opex.months[i]!).minus(p.depreciation.months[i]!).minus(p.others.months[i]!));
  return [
    { key: "p-revenue", label: "Pendapatan (invoice)", months: p.revenue.months, total: p.revenue.total },
    { key: "p-cogs", label: "COGS", months: p.cogs.months, total: p.cogs.total },
    { key: "p-opex", label: "OPEX tunai", months: p.opex.months, total: p.opex.total },
    { key: "p-dep", label: "Penyusutan & amortisasi (non-kas)", months: p.depreciation.months, total: p.depreciation.total },
    { key: "p-others", label: "Beban lain-lain (bunga Obligo + bank)", months: p.others.months, total: p.others.total },
    { key: "p-pbt", signal: true, label: "Laba sebelum pajak", months: pbt, total: p.profitBeforeTax, derived: true },
    { key: "p-tax", label: "Pajak kini (angsuran)", months: p.tax.months, total: p.tax.total },
  ];
}

export default async function CashPage() {
  const user = await requireUser();
  if (!canCash(user.actor, "view")) notFound();
  const [view, unit, header] = await Promise.all([loadCash(user), displayUnit(), activeView()]);
  const priorHasCash = view ? (await db.select({ y: schema.cashSetting.fiscalYear }).from(schema.cashSetting).where(eq(schema.cashSetting.fiscalYear, view.year - 1))).length > 0 : false;
  if (!view) {
    return (
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">Arus Kas</h1>
        <p className="text-muted-foreground text-sm">Belum ada siklus RKA.</p>
      </div>
    );
  }
  const editable = canCash(user.actor, "manage");
  // The header's Entitas picks the entity; Semua entitas is the consolidation.
  const scope = header.entity && view.entities.includes(header.entity) ? header.entity : CONSOLIDATED;
  const f = view.forecasts.get(scope);
  const s = view.settings;
  const lowest = f ? f.rows.closing.reduce((a, b) => (b.lt(a) ? b : a)) : ZERO;
  const lowestMonth = f ? MONTHS[f.rows.closing.indexOf(lowest)] : "";
  const peakNeed = f ? f.rows.fundingNeed.reduce((a, b) => (b.gt(a) ? b : a)) : ZERO;
  const n = (m: Money) => scaleTo(m, unit).toNumber();
  const chart = { decimals: unitDecimals(unit), unitLabel: unitLabel(unit) };
  const blank = { cash: "", receivables: "", payables: "", priorYearTax: "", minimumCash: "" };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={`Arus Kas ${view.year}`}
        description={
          <>
            Dari baris {view.versionName} setelah alokasi biaya bersama, asumsi kas dan Obligo.{" "}
            {scope === CONSOLIDATED ? "Konsolidasi = jumlah keempat entitas." : `Entitas ${scope}.`}
          </>
        }
        note={<ViewNote ignores={["division"]} />}
      />

      {f ? (
        <>
          <KpiStrip>
            <KpiCard label="Saldo kas akhir Des" value={f.rows.closing[11]!} unit={unit} signal trend={f.rows.closing.map(n)} />
            <KpiCard label="Saldo terendah" value={lowest} unit={unit} signal note={lowestMonth} />
            <KpiCard label="Kebutuhan pendanaan tertinggi" value={peakNeed} unit={unit} note="Di bawah saldo kas minimum" />
            <KpiCard label="Arus kas operasi setahun" value={total(f.rows.operating)} unit={unit} signal trend={f.rows.operating.map(n)} />
          </KpiStrip>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Saldo kas akhir per bulan</CardTitle>
                <CardDescription>Area merah: di bawah saldo kas minimum, yaitu kebutuhan pendanaan. Dalam {chart.unitLabel}.</CardDescription>
              </CardHeader>
              <CardContent>
                <CashBalanceChart data={MONTHS.map((m, i) => ({ month: m, closing: n(f.rows.closing[i]!) }))} minimum={n(f.rows.minimum[0] ?? ZERO)} {...chart} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Jembatan arus kas setahun</CardTitle>
                <CardDescription>Dari saldo awal Januari ke saldo akhir Desember. Hijau menambah kas, merah mengurangi.</CardDescription>
              </CardHeader>
              <CardContent>
                <WaterfallChart
                  steps={cashWaterfall(f.rows).map((st) => ({ label: STEP_LABEL[st.key], start: n(st.start), end: n(st.end), total: st.key === "opening" || st.key === "closing" }))}
                  {...chart}
                />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Arus kas bulanan</CardTitle>
              <CardDescription>
                Penagihan {s!.collectionLag} bulan setelah invoice, COGS dibayar {s!.cogsPaymentLag} bulan kemudian, OPEX dan bunga di bulan berjalan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CashTable rows={cashRows(f)} unit={unit} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Laba rugi dasar arus kas</CardTitle>
              <CardDescription>Bunga pinjaman dari Obligo menggantikan COA bunga di RKA; penyusutan tidak mengurangi kas.</CardDescription>
            </CardHeader>
            <CardContent>
              <CashTable rows={pnlRows(f)} unit={unit} />
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="grid gap-3 rounded-lg border p-6 text-sm">
          <p className="text-muted-foreground">
            Asumsi arus kas {view.year} belum diisi. {editable ? "Isi asumsi di bawah untuk melihat proyeksi." : "Finance mengisinya di halaman ini."}
          </p>
          {editable && priorHasCash ? (
            <div className="grid gap-2">
              <p>
                Atau mulai dari Desember {view.year - 1}: aturan yang sama, saldo awal setiap entitas dari saldo kas, piutang dan utang usaha
                akhir {view.year - 1}, dan pinjaman pada outstanding Desember. Periksa angkanya terhadap neraca yang diaudit, lalu isi PPh 29.
              </p>
              <ActionButton label={`Bawa saldo dari Arus Kas ${view.year - 1}`} icon={<CalendarArrowUp aria-hidden />} onRun={carryCashFromPrior} />
            </div>
          ) : null}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Asumsi</CardTitle>
          <CardDescription>Saldo 1 Januari dari neraca per entitas; ESTRADA memuat seluruh neraca konsolidasi bila entitas lain belum punya.</CardDescription>
        </CardHeader>
        <CardContent>
          <CashAssumptions
            initial={{
              collectionLag: String(s?.collectionLag ?? 2),
              cogsPaymentLag: String(s?.cogsPaymentLag ?? 1),
              taxRate: s ? money(s.taxRate).times(100).toFixed() : "22",
              minimumCash: s?.minimumCash.toFixed() ?? "",
              interestCoa: s?.interestCoa.join(", ") ?? "",
              nonCashCoa: s?.nonCashCoa.join(", ") ?? "",
              openings: Object.fromEntries(
                view.entities.map((e) => {
                  const o = view.openings.get(e);
                  return [
                    e,
                    o
                      ? { cash: o.cash.toFixed(), receivables: o.receivables.toFixed(), payables: o.payables.toFixed(), priorYearTax: o.priorYearTax.toFixed(), minimumCash: o.minimumCash.toFixed() }
                      : blank,
                  ];
                }),
              ),
            }}
            editable={editable}
            onSave={saveCashAssumptions}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pinjaman bank (Obligo)</CardTitle>
          <CardDescription>Bunga bulanan = outstanding akhir bulan × suku bunga / 12. Penarikan dan pelunasan masuk ke arus kas pendanaan.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoanEditor
            facilities={view.facilities.map((x) => ({
              id: x.id,
              name: x.name,
              type: x.type,
              entity: x.entity,
              rate: x.rate,
              openingBalance: x.openingBalance.toFixed(),
              creditLimit: x.creditLimit?.toFixed() ?? null,
              notes: x.notes,
              drawdown: x.drawdown.map((m) => m.toFixed()),
              repayment: x.repayment.map((m) => m.toFixed()),
              outstandingEnd: x.outstanding[11]!.toFixed(),
              interestTotal: total(x.interest).toFixed(),
            }))}
            entities={view.entities}
            editable={editable}
            onSave={saveLoan}
            onDelete={deleteLoan}
          />
        </CardContent>
      </Card>
    </div>
  );
}
