import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canCash, money, sum, ZERO, type CashForecast, type Money } from "@estrada/domain";
import { CONSOLIDATED, loadCash } from "@/lib/cash";
import { displayUnit } from "@/lib/display-unit";
import { requireUser } from "@/lib/session";
import { CashAssumptions } from "@/components/erp/cash-assumptions";
import { CashTable, type CashRow } from "@/components/erp/cash-table";
import { KpiCard } from "@/components/erp/kpi-card";
import { LoanEditor } from "@/components/erp/loan-editor";
import { MONTHS } from "@/components/erp/budget-grid";
import { ScopeBar } from "@/components/erp/scope-bar";
import { UnitSwitch } from "@/components/erp/unit-switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setDisplayUnit } from "../unit-actions";
import { deleteLoan, saveCashAssumptions, saveLoan } from "./actions";

export const metadata: Metadata = { title: "Arus Kas" };

const total = (m: readonly Money[]) => sum([...m]);

function cashRows(f: CashForecast): CashRow[] {
  const r = f.rows;
  return [
    { key: "receipts", section: "Aktivitas operasi", label: "Penerimaan dari pelanggan", months: r.receipts, total: total(r.receipts) },
    { key: "cogs", label: "Pembayaran COGS ke vendor", months: r.cogsPaid, total: total(r.cogsPaid) },
    { key: "opex", label: "Pembayaran OPEX", months: r.opexPaid, total: total(r.opexPaid) },
    { key: "interest", label: "Bunga & biaya bank", months: r.interestPaid, total: total(r.interestPaid) },
    { key: "tax", label: "Pajak (PPh 25 + PPh 29)", months: r.taxPaid, total: total(r.taxPaid) },
    { key: "operating", label: "Arus kas operasi", months: r.operating, total: total(r.operating), derived: true },
    { key: "capex", section: "Investasi dan pendanaan", label: "Belanja modal (Capex)", months: r.capexPaid, total: total(r.capexPaid) },
    { key: "financing", label: "Pencairan / (pelunasan) pinjaman", months: r.financing, total: total(r.financing) },
    { key: "net", label: "Arus kas bersih", months: r.net, total: total(r.net), derived: true },
    { key: "opening", section: "Saldo kas", label: "Saldo kas awal", months: r.opening },
    { key: "closing", label: "Saldo kas akhir", months: r.closing, derived: true },
    { key: "minimum", label: "Saldo kas minimum", months: r.minimum },
    { key: "surplus", label: "Surplus / (defisit) terhadap minimum", months: r.surplus },
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
    { key: "p-pbt", label: "Laba sebelum pajak", months: pbt, total: p.profitBeforeTax, derived: true },
    { key: "p-tax", label: "Pajak kini (angsuran)", months: p.tax.months, total: p.tax.total },
  ];
}

export default async function CashPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const user = await requireUser();
  if (!canCash(user.actor, "view")) notFound();
  const [view, unit, params] = await Promise.all([loadCash(user), displayUnit(), searchParams]);
  if (!view) {
    return (
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">Arus Kas</h1>
        <p className="text-muted-foreground text-sm">Belum ada siklus RKA.</p>
      </div>
    );
  }
  const editable = canCash(user.actor, "manage");
  const scope = params.entity && view.entities.includes(params.entity) ? params.entity : CONSOLIDATED;
  const f = view.forecasts.get(scope);
  const s = view.settings;
  const lowest = f ? f.rows.closing.reduce((a, b) => (b.lt(a) ? b : a)) : ZERO;
  const lowestMonth = f ? MONTHS[f.rows.closing.indexOf(lowest)] : "";
  const peakNeed = f ? f.rows.fundingNeed.reduce((a, b) => (b.gt(a) ? b : a)) : ZERO;
  const blank = { cash: "", receivables: "", payables: "", priorYearTax: "", minimumCash: "" };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Arus Kas {view.year}</h1>
          <p className="text-muted-foreground text-sm">
            Dari baris {view.versionName} setelah alokasi biaya bersama, asumsi kas dan Obligo. {scope === CONSOLIDATED ? "Konsolidasi = jumlah keempat entitas." : `Entitas ${scope}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <UnitSwitch value={unit} onChange={setDisplayUnit} />
          <ScopeBar
            filters={[{ name: "entity", label: "Entitas", options: [{ value: "", label: "Konsolidasi" }, ...view.entities.map((e) => ({ value: e, label: e }))] }]}
          />
        </div>
      </div>

      {f ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Saldo kas akhir Des" value={f.rows.closing[11]!} unit={unit} />
            <KpiCard label="Saldo terendah" value={lowest} unit={unit} note={lowestMonth} />
            <KpiCard label="Kebutuhan pendanaan tertinggi" value={peakNeed} unit={unit} note="Di bawah saldo kas minimum" />
            <KpiCard label="Arus kas operasi setahun" value={total(f.rows.operating)} unit={unit} />
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
        <p className="text-muted-foreground rounded-lg border p-6 text-sm">
          Asumsi arus kas {view.year} belum diisi. {editable ? "Isi asumsi di bawah untuk melihat proyeksi." : "Finance mengisinya di halaman ini."}
        </p>
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
