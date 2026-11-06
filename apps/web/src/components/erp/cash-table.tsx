import type { Unit } from "@estrada/domain";
import { ReportTable, type ReportRow } from "./report-table";

export type CashRow = ReportRow;

/** Arus Kas by month, laid out like Forecast CF Bulanan: cash in and out, the balance, and the funding gap. */
export function CashTable({ rows, unit = "juta" }: { rows: CashRow[]; unit?: Unit }) {
  return <ReportTable rows={rows} unit={unit} testIdPrefix="cash" />;
}
