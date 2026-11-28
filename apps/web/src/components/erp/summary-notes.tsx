import { formatAmount, type PnlRow, type Unit } from "@estrada/domain";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Total Biaya includes CAPEX and profit does not, so the headline figures are joined up in one sentence. */
export function ProfitReconciliation({ rows, unit, noRevenue = false }: { rows: readonly PnlRow[]; unit: Unit; noRevenue?: boolean }) {
  const total = (key: PnlRow["key"]) => formatAmount(rows.find((r) => r.key === key)!.total, unit);
  return (
    <p className="text-muted-foreground tabular text-sm" data-testid="profit-formula">
      {`Laba Sebelum Pajak ${total("ProfitBeforeTax")} = Pendapatan ${noRevenue ? "(belum ada data)" : total("Revenue")} − (Total Biaya ${total("TotalCost")} − CAPEX ${total("CAPEX")}).`}
    </p>
  );
}

/** A projection without revenue looks like a cash crisis, so it says what it is missing. */
export function NoRevenueNotice() {
  return (
    <Alert className="border-warning bg-warning/15">
      <AlertDescription className="text-foreground">Proyeksi ini belum memuat pendapatan dari RKA, jadi saldo hanya mencerminkan biaya, saldo awal dan pinjaman.</AlertDescription>
    </Alert>
  );
}

export function DraftNotice({ pending, total }: { pending: number; total: number }) {
  if (!pending) return null;
  return (
    <Alert className="border-warning bg-warning/15">
      <AlertDescription className="text-foreground">{`Angka ini termasuk ${pending} dari ${total} baris yang belum final.`}</AlertDescription>
    </Alert>
  );
}
