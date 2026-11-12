import { Check, CornerUpLeft } from "lucide-react";
import { PAYMENT_STATE_HINT, PAYMENT_STATE_LABEL, type PaymentState } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONE: Record<PaymentState, string> = {
  draft: "bg-state-draft/12 [--dot:var(--state-draft)]",
  submitted: "bg-state-consolidation/12 [--dot:var(--state-consolidation)]",
  returned: "bg-destructive/10 [--dot:var(--destructive)]",
  under_review: "bg-state-finance/15 [--dot:var(--state-finance)]",
  pending_approval: "bg-state-division/12 [--dot:var(--state-division)]",
  approved: "bg-state-awaiting/12 [--dot:var(--state-awaiting)]",
  scheduled: "bg-info/12 [--dot:var(--info)]",
  paid: "bg-success/12 [--dot:var(--success)]",
};

export function PaymentStatusBadge({ state }: { state: PaymentState }) {
  return (
    <Badge className={cn("text-foreground gap-1.5 border-transparent font-medium", TONE[state])} title={PAYMENT_STATE_HINT[state]}>
      <span aria-hidden className="size-1.5 rounded-full bg-(--dot)" />
      {PAYMENT_STATE_LABEL[state]}
    </Badge>
  );
}

/** The flow as the team drew it, with who acts at each step. Returned is shown beside the step it came back from. */
const STEPS: { state: PaymentState; who: string }[] = [
  { state: "submitted", who: "Atasan" },
  { state: "under_review", who: "BFP" },
  { state: "pending_approval", who: "Head Divisi" },
  { state: "approved", who: "Cash Management" },
  { state: "scheduled", who: "Cash Management" },
  { state: "paid", who: "Selesai" },
];
const ORDER: PaymentState[] = ["draft", ...STEPS.map((s) => s.state)];

/**
 * Where the request is. `returnedFrom` is the step that sent a Returned request back, so the stepper can show how far it got.
 */
export function PaymentStepper({ state, returnedFrom }: { state: PaymentState; returnedFrom?: PaymentState | null }) {
  const at = state === "returned" ? (returnedFrom ?? "submitted") : state;
  const current = ORDER.indexOf(at);
  return (
    <ol data-testid="payment-stepper" className="grid gap-3 sm:grid-cols-6 sm:gap-2" aria-label="Alur Permintaan Pembayaran">
      {STEPS.map((s, i) => {
        const idx = i + 1;
        const done = idx < current || (state === "paid" && idx === current);
        const here = idx === current && state !== "paid";
        const sentBack = here && state === "returned";
        const status = done ? "done" : sentBack ? "returned" : here ? "current" : "todo";
        return (
          <li key={s.state} data-state={status} className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-1.5">
            <span
              aria-hidden
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                done && "bg-success border-transparent text-white",
                here && !sentBack && "bg-primary text-primary-foreground ring-primary/25 border-transparent ring-4",
                sentBack && "bg-destructive text-white ring-destructive/20 border-transparent ring-4",
                status === "todo" && "text-muted-foreground bg-background",
              )}
            >
              {done ? <Check className="size-4" /> : sentBack ? <CornerUpLeft className="size-4" /> : idx}
            </span>
            <span className="grid leading-tight">
              <span className={cn("text-sm", here ? "font-semibold" : "font-medium", status === "todo" && "text-muted-foreground")}>{PAYMENT_STATE_LABEL[s.state]}</span>
              <span className="text-muted-foreground text-xs">{sentBack ? "Dikembalikan ke pemohon" : s.who}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
