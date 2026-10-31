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

const TONE: Record<ApprovalState, string> = {
  draft: "bg-secondary text-secondary-foreground",
  consolidation: "bg-accent text-accent-foreground",
  division_approval: "bg-accent text-accent-foreground",
  finance_review: "bg-warning/20 text-foreground",
  awaiting_lock: "bg-warning/30 text-foreground",
  locked: "bg-success/20 text-foreground",
};

export function StatusBadge({ state }: { state: ApprovalState }) {
  return <Badge className={cn("border-transparent", TONE[state])}>{STATE_LABEL[state]}</Badge>;
}
