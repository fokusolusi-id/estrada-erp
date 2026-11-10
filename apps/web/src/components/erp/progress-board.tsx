import { Check } from "lucide-react";
import { APPROVAL_STATES, type ApprovalState, type DivisionProgress } from "@estrada/domain";
import { cn } from "@/lib/utils";
import { STATE_LABEL } from "./status-badge";

const FILL: Record<ApprovalState, string> = {
  draft: "bg-state-draft",
  consolidation: "bg-state-consolidation",
  division_approval: "bg-state-division",
  finance_review: "bg-state-finance",
  awaiting_lock: "bg-state-awaiting",
  locked: "bg-state-locked",
};
const RING: Record<ApprovalState, string> = {
  draft: "ring-state-draft/25",
  consolidation: "ring-state-consolidation/25",
  division_approval: "ring-state-division/25",
  finance_review: "ring-state-finance/30",
  awaiting_lock: "ring-state-awaiting/25",
  locked: "ring-state-locked/25",
};
/** Who holds the lines at each stage. */
const HOLDER: Record<ApprovalState, string> = {
  draft: "Requestor",
  consolidation: "Default Owner",
  division_approval: "Division Owner",
  finance_review: "Finance",
  awaiting_lock: "Finance",
  locked: "Selesai",
};

/**
 * Where the cycle stands: a stepper of the six stages with the lines sitting at each, then one bar per division
 * split by stage, so a stuck division shows at a glance.
 */
export function ProgressBoard({ rows }: { rows: DivisionProgress[] }) {
  if (!rows.length) return <p className="text-muted-foreground py-6 text-center text-sm">Belum ada baris RKA di siklus ini.</p>;
  const sum = (state: ApprovalState) => rows.reduce((n, r) => n + r.counts[state], 0);
  const all = rows.reduce((n, r) => n + r.total, 0);
  const final = all ? Math.round(((sum("awaiting_lock") + sum("locked")) / all) * 100) : 0;
  // A stage is behind the cycle once no line sits there or before it.
  const firstBusy = APPROVAL_STATES.findIndex((s) => sum(s) > 0);

  return (
    <div className="grid gap-6">
      <div className="bg-muted/40 grid gap-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">{all} baris</span>
          <span className="text-muted-foreground flex items-center gap-2">
            <span className="bg-muted h-1.5 w-24 overflow-hidden rounded-full" aria-hidden>
              <span className="bg-state-locked block h-full rounded-full" style={{ width: `${final}%` }} />
            </span>
            <span>
              <span data-testid="final-all" className="tabular text-foreground font-medium">
                {final}%
              </span>{" "}
              final
            </span>
          </span>
        </div>
        <ol data-testid="progress-total" aria-label="Tahap RKA" className="grid gap-y-3 lg:grid-cols-6 lg:gap-x-3">
          {APPROVAL_STATES.map((s, i) => {
            const n = sum(s);
            const passed = i < firstBusy;
            const line = passed || n ? "bg-state-locked/40" : "bg-border";
            return (
              <li
                key={s}
                data-state={s}
                className="relative grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 lg:grid-cols-1 lg:content-start lg:items-start lg:justify-items-center lg:gap-1 lg:text-center"
              >
                {i > 0 ? (
                  <>
                    {/* Vertical on phones, horizontal from desktop. */}
                    <span aria-hidden className={cn("absolute -top-3 left-[0.9375rem] h-3 w-0.5 lg:hidden", line)} />
                    <span aria-hidden className={cn("absolute top-4 right-[calc(50%+1.25rem)] hidden h-0.5 w-[calc(100%-1.75rem)] rounded-full lg:block", line)} />
                  </>
                ) : null}
                <span
                  aria-hidden
                  className={cn(
                    "tabular relative row-span-2 grid size-8 place-items-center rounded-full text-xs font-semibold lg:row-span-1",
                    n ? cn(FILL[s], "text-white ring-4", RING[s]) : passed ? "bg-state-locked/15 text-state-locked" : "bg-background text-muted-foreground border",
                  )}
                >
                  {passed ? <Check className="size-4" /> : i + 1}
                </span>
                <span className="col-start-2 row-start-1 text-sm leading-tight font-medium lg:col-start-1 lg:row-start-auto lg:flex lg:min-h-9 lg:items-center">
                  {STATE_LABEL[s]}
                </span>
                <span
                  data-testid={`state-${s}`}
                  className={cn(
                    "tabular col-start-3 row-span-2 row-start-1 text-lg leading-none font-semibold lg:col-start-1 lg:row-span-1 lg:row-start-auto",
                    !n && "text-muted-foreground font-normal",
                  )}
                >
                  {n || "–"}
                </span>
                <span className="text-muted-foreground col-start-2 row-start-2 text-xs lg:col-start-1 lg:row-start-auto">{HOLDER[s]}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-3" aria-label="Per divisi">
        {rows.map((r) => (
          <div key={r.division} data-testid={`progress-${r.division}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
            <span className="truncate font-medium">{r.division}</span>
            <div
              role="img"
              aria-label={`${r.division}: ${APPROVAL_STATES.filter((s) => r.counts[s]).map((s) => `${STATE_LABEL[s]} ${r.counts[s]}`).join(", ")}`}
              className="bg-muted flex h-2.5 gap-px overflow-hidden rounded-full"
            >
              {APPROVAL_STATES.filter((s) => r.counts[s]).map((s) => (
                <span key={s} title={`${STATE_LABEL[s]}: ${r.counts[s]} baris`} className={cn("h-full", FILL[s])} style={{ width: `${(r.counts[s] / r.total) * 100}%` }} />
              ))}
            </div>
            <span className="text-muted-foreground tabular w-28 text-right text-xs">
              {r.total} baris ·{" "}
              <span data-testid="final" className="text-foreground font-medium">
                {r.finalShare}%
              </span>{" "}
              final
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
