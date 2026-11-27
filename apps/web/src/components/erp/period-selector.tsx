import { REPORT_PERIODS, REPORT_PERIOD_LABEL, type ReportPeriod } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SELECT = "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

/** As-of date and period, kept in the address (27_Budget_vs_Actual). */
export function PeriodSelector({ action, asOf, period }: { action: string; asOf: string; period: ReportPeriod }) {
  return (
    <form action={action} key={`${asOf}-${period}`} className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">
        <span className="text-muted-foreground text-xs">Per tanggal</span>
        <Input type="date" name="per" aria-label="Per tanggal" className="h-9" defaultValue={asOf} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted-foreground text-xs">Periode</span>
        <select name="periode" aria-label="Periode" className={SELECT} defaultValue={period}>
          {REPORT_PERIODS.map((p) => (
            <option key={p} value={p}>
              {REPORT_PERIOD_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="outline">
        Terapkan
      </Button>
    </form>
  );
}
