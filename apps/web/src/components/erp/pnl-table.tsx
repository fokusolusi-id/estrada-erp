import type { PnlKey, PnlRow, Unit } from "@estrada/domain";
import { ReportTable } from "./report-table";

export const PNL_LABEL: Record<PnlKey, string> = {
  Revenue: "Pendapatan",
  COGS: "COGS",
  GrossProfit: "Laba Kotor",
  OPEX: "OPEX",
  OperatingProfit: "Laba Operasional",
  OTHERS: "OTHERS",
  ProfitBeforeTax: "Laba Sebelum Pajak",
  CAPEX: "CAPEX",
  TotalCost: "Total Biaya",
};

/** Results whose loss should stand out; costs are never red. */
const PROFIT: readonly PnlKey[] = ["GrossProfit", "OperatingProfit", "ProfitBeforeTax"];

/** Management Summary by month. Computed rows are banded like the workbook's formula rows and never editable. */
export function PnlTable({ rows, unit = "juta" }: { rows: PnlRow[]; unit?: Unit }) {
  return (
    <ReportTable
      unit={unit}
      testIdPrefix="pnl"
      rows={rows.map((r) => ({ key: r.key, label: PNL_LABEL[r.key], months: r.months, total: r.total, derived: r.derived, signal: PROFIT.includes(r.key) }))}
    />
  );
}
