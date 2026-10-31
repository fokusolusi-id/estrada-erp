import type { ApprovalConfig, ApprovalState } from "./approval";
import type { Role } from "./roles";

export const COMMENT_MAX = 2000;

/** Why a comment cannot be posted, or null. Who may post is `can(actor, "line.comment", ...)`. */
export function commentProblem(body: string): "empty" | "too_long" | null {
  const text = body.trim();
  if (!text) return "empty";
  if (text.length > COMMENT_MAX) return "too_long";
  return null;
}

export type CommentRecipient =
  | { kind: "user"; userId: string }
  /** The holder of this role's seat for the unit, found the same way approvals find it. */
  | { kind: "seat"; role: Role; unit: string }
  /** Everyone in a company-wide role. */
  | { kind: "role"; role: Role };

export interface CommentedLine {
  state: ApprovalState;
  requestorUnit: string;
  ownerUnit: string;
  /** The requestor who created the line; null for imported and seeded lines. */
  createdBy: string | null;
}

/**
 * Who hears about a new comment: the requestor who knows the line, whoever holds it now, and everyone
 * already in the thread. The caller removes the author. Locked lines take no comments, so have no holder.
 */
export function commentAudience(line: CommentedLine, earlierAuthors: readonly string[], cfg: ApprovalConfig): CommentRecipient[] {
  const out: CommentRecipient[] = [];
  const users = new Set<string>();
  const addUser = (userId: string) => {
    if (users.has(userId)) return;
    users.add(userId);
    out.push({ kind: "user", userId });
  };

  // Imported lines have no creator: the requesting unit's requestor answers for them.
  if (line.createdBy) addUser(line.createdBy);
  else out.push({ kind: "seat", role: "requestor", unit: line.requestorUnit });
  switch (line.state) {
    case "draft":
      break;
    case "consolidation":
      out.push({ kind: "seat", role: "default_owner", unit: line.ownerUnit });
      break;
    case "division_approval":
      out.push({ kind: "seat", role: "division_owner", unit: line.ownerUnit });
      break;
    case "finance_review":
      out.push({ kind: "role", role: "finance" });
      break;
    case "awaiting_lock":
      out.push({ kind: "role", role: cfg.lockRole });
      break;
    case "locked":
      break;
  }
  for (const a of earlierAuthors) addUser(a);
  return out;
}

/**
 * Comments email at most once per person per window, never once per comment: a burst of questions is one
 * email, and the rest wait in the thread (and the in-app list).
 */
export function commentEmailDue(lastSent: Date | null, now: Date, windowMinutes = 60): boolean {
  return !lastSent || now.getTime() - lastSent.getTime() >= windowMinutes * 60_000;
}
