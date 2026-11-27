import { formatAmount, type PnlRow, type Unit } from "@estrada/domain";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Total Biaya includes CAPEX and profit does not, so the headline figures are joined up in one sentence. */
export function ProfitReconciliation({ rows, unit }: { rows: readonly PnlRow[]; unit: Unit }) {
  const total = (key: PnlRow["key"]) => formatAmount(rows.find((r) => r.key === key)!.total, unit);
  return (
    <p className="text-muted-foreground tabular text-sm" data-testid="profit-formula">
      {`Laba Sebelum Pajak ${total("ProfitBeforeTax")} = Pendapatan ${total("Revenue")} − (Total Biaya ${total("TotalCost")} − CAPEX ${total("CAPEX")}).`}
    </p>
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
