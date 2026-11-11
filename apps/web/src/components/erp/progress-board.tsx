import { APPROVAL_STATES, type ApprovalState, type DivisionProgress } from "@estrada/domain";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { STATE_LABEL } from "./status-badge";

const DOT: Record<ApprovalState, string> = {
  draft: "bg-state-draft",
  consolidation: "bg-state-consolidation",
  division_approval: "bg-state-division",
  finance_review: "bg-state-finance",
  awaiting_lock: "bg-state-awaiting",
  locked: "bg-state-locked",
};
const TINT: Record<ApprovalState, string> = {
  draft: "bg-state-draft/12",
  consolidation: "bg-state-consolidation/12",
  division_approval: "bg-state-division/12",
  finance_review: "bg-state-finance/15",
  awaiting_lock: "bg-state-awaiting/12",
  locked: "bg-state-locked/12",
};

function Count({ state, n }: { state: ApprovalState; n: number }) {
  return (
    <span data-testid={`state-${state}`} className={cn("tabular inline-flex min-w-8 justify-center rounded-md px-1.5 py-0.5 font-medium", n ? TINT[state] : "text-muted-foreground")}>
      {n || "–"}
    </span>
  );
}

/** Where every division's lines stand in the cycle: a count per state and the share already final. */
export function ProgressBoard({ rows }: { rows: DivisionProgress[] }) {
  if (!rows.length) return <p className="text-muted-foreground py-6 text-center text-sm">Belum ada baris RKA di siklus ini.</p>;
  const sum = (state: ApprovalState) => rows.reduce((n, r) => n + r.counts[state], 0);
  const all = rows.reduce((n, r) => n + r.total, 0);
  const final = all ? Math.round(((sum("awaiting_lock") + sum("locked")) / all) * 100) : 0;
  const bar = (share: number) => (
    <div className="flex items-center justify-end gap-2">
      <div className="bg-muted h-1.5 w-12 overflow-hidden rounded-full" aria-hidden>
        <div className="bg-state-locked h-full rounded-full" style={{ width: `${share}%` }} />
      </div>
      <span data-testid="final" className="tabular w-10 text-right">
        {share}%
      </span>
    </div>
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Divisi</TableHead>
          {APPROVAL_STATES.map((s) => (
            <TableHead key={s} className="h-auto py-2 text-center leading-tight whitespace-normal">
              <span aria-hidden className={cn("mr-1.5 inline-block size-1.5 rounded-full align-middle", DOT[s])} />
              {STATE_LABEL[s]}
            </TableHead>
          ))}
          <TableHead className="text-right">Baris</TableHead>
          <TableHead className="text-right">Final</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.division} data-testid={`progress-${r.division}`}>
            <TableCell className="font-medium">{r.division}</TableCell>
            {APPROVAL_STATES.map((s) => (
              <TableCell key={s} className="text-center">
                <Count state={s} n={r.counts[s]} />
              </TableCell>
            ))}
            <TableCell className="tabular text-right">{r.total}</TableCell>
            <TableCell>{bar(r.finalShare)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow data-testid="progress-total">
          <TableCell>Total</TableCell>
          {APPROVAL_STATES.map((s) => (
            <TableCell key={s} className="text-center">
              <Count state={s} n={sum(s)} />
            </TableCell>
          ))}
          <TableCell className="tabular text-right">{all}</TableCell>
          <TableCell>{bar(final)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
