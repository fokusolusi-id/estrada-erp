import type { ApprovalAction, ApprovalState } from "./approval";
import type { Role } from "./roles";

export type EmailTemplate =
  | "cycle_opened"
  | "lines_submitted"
  | "division_ready"
  | "finance_review"
  | "ready_to_lock"
  | "rka_locked"
  | "returned"
  | "clarification"
  | "reminder_pending"
  | "deadline_near"
  | "seat_vacant"
  | "invitation"
  | "password_reset";

export type Recipient = Role | "lock_role" | "all_participants";

export interface Notification {
  template: EmailTemplate;
  to: Recipient;
  comment?: string;
}

export interface TransitionEvent {
  action: ApprovalAction;
  from: ApprovalState;
  to: ApprovalState;
  comment?: string;
}

const FORWARD: Partial<Record<ApprovalAction, Notification>> = {
  submit: { template: "lines_submitted", to: "default_owner" },
  consolidate: { template: "division_ready", to: "division_owner" },
  approve: { template: "finance_review", to: "finance" },
  finalize: { template: "ready_to_lock", to: "lock_role" },
  lock: { template: "rka_locked", to: "all_participants" },
};

/** One email per handoff; amounts never go in the email body. */
export function notificationsFor(e: TransitionEvent): Notification[] {
  if (e.action === "return") return [{ template: "returned", to: "requestor", comment: e.comment ?? "" }];
  if (e.action === "clarify") return [{ template: "clarification", to: "division_owner", comment: e.comment ?? "" }];
  const n = FORWARD[e.action];
  return n ? [n] : [];
}

const PARTICIPANTS: readonly Role[] = ["requestor", "default_owner", "division_owner", "finance", "director"];

/** Who "all_participants" means: the roles that take part in the RKA cycle. Admin and Auditor do not. */
export function isParticipant(role: Role): boolean {
  return PARTICIPANTS.includes(role);
}
