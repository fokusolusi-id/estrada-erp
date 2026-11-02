import type { Role } from "./roles";

export const APPROVAL_STATES = [
  "draft",
  "consolidation",
  "division_approval",
  "finance_review",
  "awaiting_lock",
  "locked",
] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export type ApprovalAction = "submit" | "return" | "consolidate" | "approve" | "clarify" | "finalize" | "lock";

interface Rule {
  from: ApprovalState;
  action: ApprovalAction;
  to: ApprovalState;
  role: Role | "lock_role";
  requiresComment?: boolean;
}

/** CARA PENGISIAN point 10, as a state machine. */
const RULES: readonly Rule[] = [
  { from: "draft", action: "submit", to: "consolidation", role: "requestor" },
  { from: "consolidation", action: "return", to: "draft", role: "default_owner", requiresComment: true },
  { from: "consolidation", action: "consolidate", to: "division_approval", role: "default_owner" },
  { from: "division_approval", action: "approve", to: "finance_review", role: "division_owner" },
  { from: "finance_review", action: "clarify", to: "division_approval", role: "finance", requiresComment: true },
  { from: "finance_review", action: "finalize", to: "awaiting_lock", role: "finance" },
  { from: "awaiting_lock", action: "lock", to: "locked", role: "lock_role" },
];

export interface ApprovalConfig {
  /** Who locks the final version. Head Finance by default (client answer 3). */
  lockRole: Role;
}
const DEFAULT_CONFIG: ApprovalConfig = { lockRole: "finance" };

export interface TransitionRequest {
  action: ApprovalAction;
  role: Role;
  comment?: string;
}

export interface TransitionResult {
  from: ApprovalState;
  to: ApprovalState;
  action: ApprovalAction;
  comment?: string;
}

const roleOf = (rule: Rule, cfg: ApprovalConfig): Role => (rule.role === "lock_role" ? cfg.lockRole : rule.role);

export function allowedActions(state: ApprovalState, role: Role, cfg: ApprovalConfig = DEFAULT_CONFIG): ApprovalAction[] {
  return RULES.filter((r) => r.from === state && roleOf(r, cfg) === role).map((r) => r.action);
}

export function transition(
  state: ApprovalState,
  req: TransitionRequest,
  cfg: ApprovalConfig = DEFAULT_CONFIG,
): TransitionResult {
  const rule = RULES.find((r) => r.from === state && r.action === req.action && roleOf(r, cfg) === req.role);
  if (!rule) throw new Error(`Action "${req.action}" by ${req.role} is not allowed in state "${state}"`);
  if (rule.requiresComment && !req.comment?.trim()) {
    throw new Error(`Action "${req.action}" requires a comment`);
  }
  return { from: state, to: rule.to, action: req.action, ...(req.comment ? { comment: req.comment } : {}) };
}

export interface ApprovalEventLike {
  action: ApprovalAction;
  toState: ApprovalState;
  comment: string | null;
  at: Date;
}

/** The latest return or clarification, while the line still sits in the state it was sent back to. */
export function openRemark<E extends ApprovalEventLike>(events: readonly E[], current: ApprovalState): E | null {
  const last = [...events].sort((a, b) => a.at.getTime() - b.at.getTime()).at(-1);
  if (!last || last.toState !== current) return null;
  return last.action === "return" || last.action === "clarify" ? last : null;
}
