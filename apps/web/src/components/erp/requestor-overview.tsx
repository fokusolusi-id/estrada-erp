import { MessageSquare, Undo2 } from "lucide-react";
import type { ApprovalState, RequestorOverview as Overview } from "@estrada/domain";
import { cn } from "@/lib/utils";
import { STATE_LABEL } from "./status-badge";

const DOT: Record<Exclude<ApprovalState, "draft">, string> = {
  consolidation: "bg-state-consolidation",
  division_approval: "bg-state-division",
  finance_review: "bg-state-finance",
  awaiting_lock: "bg-state-awaiting",
  locked: "bg-state-locked",
};

/**
 * RKA Saya at a glance for the requestor: how many lines are sent, which seat holds them now,
 * and what waits on the requestor (lines sent back, lines with a discussion).
 */
export function RequestorOverview({ overview, holders }: { overview: Overview; holders: Record<Exclude<ApprovalState, "draft">, string> }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="bg-accent/50 grid min-w-36 content-center rounded-lg border px-4 py-2">
          <span className="text-muted-foreground text-xs">Sudah dikirim</span>
          <span className="tabular text-2xl font-semibold" data-testid="submitted-count">
            {overview.submitted} <span className="text-muted-foreground text-sm font-normal">baris</span>
          </span>
        </div>
        {overview.positions.map((p) => (
          <div key={p.state} data-testid={`position-${p.state}`} className={cn("grid min-w-32 flex-1 content-center rounded-lg border px-3 py-2", !p.count && "opacity-60")}>
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <span aria-hidden className={cn("size-1.5 rounded-full", DOT[p.state])} />
              {STATE_LABEL[p.state]}
            </span>
            <span className="tabular text-lg font-semibold">{p.count || "–"}</span>
            <span className="text-muted-foreground text-xs">{holders[p.state]}</span>
          </div>
        ))}
      </div>
      {overview.returned || overview.discussed ? (
        <div className="flex flex-wrap gap-2 text-sm">
          {overview.returned ? (
            <a href="#draft" data-testid="returned-count" className="bg-warning/15 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium hover:underline">
              <Undo2 aria-hidden className="size-4" />
              {overview.returned} baris dikembalikan, perlu diubah
            </a>
          ) : null}
          {overview.discussed ? (
            <span data-testid="discussed-count" className="bg-muted inline-flex items-center gap-1.5 rounded-md px-2.5 py-1">
              <MessageSquare aria-hidden className="size-4" />
              {overview.discussed} baris punya diskusi; buka tautan Diskusi di barisnya
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
