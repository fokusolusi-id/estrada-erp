/** Changes to sensitive masters wait for the Finance Controller (sheet FC12_Master_Data, BR-MD-006). */

export const CHANGE_STATUSES = ["pending", "approved", "applied", "rejected", "cancelled", "failed"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];
export const CHANGE_STATUS_LABEL: Record<ChangeStatus, string> = {
  pending: "Menunggu persetujuan",
  approved: "Disetujui, menunggu tanggal berlaku",
  applied: "Diterapkan",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
  failed: "Gagal diterapkan",
};
/** A record with an open request takes no second one. */
export const OPEN_CHANGE_STATUSES: readonly ChangeStatus[] = ["pending", "approved"];

export type RequestProblem = "reason_required" | "effective_invalid" | "effective_past";

/** Reason required; effective date today or later (YYYY-MM-DD). */
export function requestProblem({ reason, effectiveOn }: { reason: string; effectiveOn: string }, today: string): RequestProblem | null {
  if (!reason.trim()) return "reason_required";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(effectiveOn) ? new Date(`${effectiveOn}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== effectiveOn) return "effective_invalid";
  return effectiveOn < today ? "effective_past" : null;
}

export const isDue = (effectiveOn: string, today: string) => effectiveOn <= today;

export type ChangeDecision = "approve" | "reject" | "cancel";
export type ChangeStepProblem = "wrong_state" | "not_approver" | "own_request" | "note_required" | "not_requester";

/** Requester != approver. Applying (and failing to apply) is the system's step, not a person's. */
export function changeStep(
  from: ChangeStatus,
  decision: ChangeDecision,
  ctx: { actorId: string; requesterId: string; mayApprove: boolean; note?: string },
): { to: ChangeStatus } | { problem: ChangeStepProblem } {
  const own = ctx.actorId === ctx.requesterId;
  if (decision === "cancel") {
    if (!own) return { problem: "not_requester" };
    return OPEN_CHANGE_STATUSES.includes(from) ? { to: "cancelled" } : { problem: "wrong_state" };
  }
  if (!ctx.mayApprove) return { problem: "not_approver" };
  if (own) return { problem: "own_request" };
  if (from !== "pending") return { problem: "wrong_state" };
  if (decision === "reject") return ctx.note?.trim() ? { to: "rejected" } : { problem: "note_required" };
  return { to: "approved" };
}
