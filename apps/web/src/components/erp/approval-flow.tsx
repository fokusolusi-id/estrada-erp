import { ArrowRight, CornerUpLeft } from "lucide-react";
import { APPROVAL_STATES, type ApprovalState } from "@estrada/domain";
import { cn } from "@/lib/utils";
import { STATE_LABEL } from "./status-badge";

const HOLDER: Record<ApprovalState, string> = {
  draft: "Requestor mengisi",
  consolidation: "Default Owner memeriksa",
  division_approval: "Division Owner menyetujui",
  finance_review: "Finance mereview",
  awaiting_lock: "Finance mengunci",
  locked: "Hanya dibaca",
};
const NEXT: Partial<Record<ApprovalState, string>> = {
  draft: "Kirim ke Default Owner",
  consolidation: "Kirim ke Division Owner",
  division_approval: "Setujui & kirim ke Finance",
  finance_review: "Finalisasi",
  awaiting_lock: "Kunci versi",
};
const BORDER: Record<ApprovalState, string> = {
  draft: "border-state-draft",
  consolidation: "border-state-consolidation",
  division_approval: "border-state-division",
  finance_review: "border-state-finance",
  awaiting_lock: "border-state-awaiting",
  locked: "border-state-locked",
};
const TINT: Record<ApprovalState, string> = {
  draft: "bg-state-draft/8",
  consolidation: "bg-state-consolidation/8",
  division_approval: "bg-state-division/8",
  finance_review: "bg-state-finance/10",
  awaiting_lock: "bg-state-awaiting/8",
  locked: "bg-state-locked/10",
};

/** The six approval states in order, who holds each, the action that moves a line on, and the two ways back. */
export function ApprovalFlow() {
  return (
    <figure aria-label="Alur persetujuan RKA" className="not-prose grid gap-3">
      <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {APPROVAL_STATES.map((s, i) => (
          <li key={s} className="relative">
            <div className={cn("h-full rounded-lg border-l-4 px-3 py-2.5", BORDER[s], TINT[s])}>
              <div className="text-muted-foreground text-[11px] font-medium">Tahap {i + 1}</div>
              <div className="text-sm font-semibold">{STATE_LABEL[s]}</div>
              <div className="text-muted-foreground mt-0.5 text-xs">{HOLDER[s]}</div>
              {NEXT[s] ? (
                <div className="mt-2 flex items-center gap-1 text-xs font-medium">
                  <ArrowRight aria-hidden className="size-3.5 shrink-0" />
                  {NEXT[s]}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <figcaption className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <CornerUpLeft aria-hidden className="size-3.5" /> Kembalikan: Konsolidasi ke Draft (catatan wajib)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CornerUpLeft aria-hidden className="size-3.5" /> Minta klarifikasi: Review Finance ke Persetujuan Divisi (catatan wajib)
        </span>
      </figcaption>
    </figure>
  );
}
