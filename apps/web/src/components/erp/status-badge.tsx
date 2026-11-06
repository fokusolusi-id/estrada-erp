import type { ApprovalState } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const STATE_LABEL: Record<ApprovalState, string> = {
  draft: "Draft",
  consolidation: "Konsolidasi",
  division_approval: "Persetujuan Divisi",
  finance_review: "Review Finance",
  awaiting_lock: "Menunggu Kunci",
  locked: "Terkunci",
};

/** Each state has its own colour (design matrix): a dot in the state colour on a light tint, text stays readable. */
const TONE: Record<ApprovalState, string> = {
  draft: "bg-state-draft/12 [--dot:var(--state-draft)]",
  consolidation: "bg-state-consolidation/12 [--dot:var(--state-consolidation)]",
  division_approval: "bg-state-division/12 [--dot:var(--state-division)]",
  finance_review: "bg-state-finance/15 [--dot:var(--state-finance)]",
  awaiting_lock: "bg-state-awaiting/12 [--dot:var(--state-awaiting)]",
  locked: "bg-state-locked/12 [--dot:var(--state-locked)]",
};

export function StatusBadge({ state }: { state: ApprovalState }) {
  return (
    <Badge className={cn("text-foreground gap-1.5 border-transparent font-medium", TONE[state])}>
      <span aria-hidden className="size-1.5 rounded-full bg-(--dot)" />
      {STATE_LABEL[state]}
    </Badge>
  );
}
