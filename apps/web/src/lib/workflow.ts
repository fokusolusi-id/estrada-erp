import "server-only";
import { cache } from "react";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  OrgTree,
  actionsFor,
  handoffs,
  isFullyLocked,
  isParticipant,
  notificationsFor,
  seatFor,
  ROLE_LABEL,
  transition,
  type ApprovalAction,
  type ApprovalConfig,
  type ApprovalState,
  type Actor,
  type EmailTemplate,
  type Recipient,
  type Role,
} from "@estrada/domain";
import { env } from "./env";
import { enqueueEmail } from "./email/outbox";

const TRANSITION_LINK: Record<ApprovalAction, string> = {
  submit: "/rka/queue",
  return: "/rka",
  consolidate: "/rka/division",
  approve: "/rka/review",
  clarify: "/rka/division",
  finalize: "/summary",
  lock: "/summary",
};

export const approvalConfig = (): ApprovalConfig => ({ lockRole: env.RKA_LOCK_ROLE as Role });

/** Cached per request: the layout and the page both ask for it, so the org tree is read once. */
export const loadOrg = cache(async () => {
  const units = await db.select({ code: schema.orgUnit.code, parent: schema.orgUnit.parentCode, type: schema.orgUnit.type }).from(schema.orgUnit);
  return new OrgTree(units);
});

export class WorkflowError extends Error {}

/**
 * The one place an RKA line changes state: domain rules, scope check, audit trail and notifications together.
 * Emails go out after the transaction commits, one per recipient per handoff.
 */
export async function applyTransition(actor: Actor, lineIds: string[], action: ApprovalAction, comment?: string) {
  if (!lineIds.length) return;
  const cfg = approvalConfig();
  const org = await loadOrg();

  const result = await db.transaction(async (tx) => {
    const lines = await tx
      .select({ line: schema.budgetLine, versionStatus: schema.budgetVersion.status })
      .from(schema.budgetLine)
      .innerJoin(schema.budgetVersion, eq(schema.budgetVersion.id, schema.budgetLine.versionId))
      .where(inArray(schema.budgetLine.id, lineIds))
      .then((rows) => rows.filter((r) => r.versionStatus === "open").map((r) => r.line));
    if (lines.length !== new Set(lineIds).size) throw new WorkflowError("Sebagian baris tidak ditemukan atau versinya sudah dikunci.");

    const states = new Set(lines.map((l) => l.state));
    if (states.size !== 1) throw new WorkflowError("Baris yang diproses bersama harus berstatus sama.");

    for (const l of lines) {
      const res = { requestorUnit: l.requestorUnit, ownerUnit: l.ownerUnit, entity: l.entityCode, state: l.state };
      if (!actionsFor(actor, res, org, cfg).includes(action)) {
        throw new WorkflowError("Anda tidak berwenang memproses sebagian baris ini.");
      }
    }

    const from = lines[0]!.state;
    const t = transition(from, { action, role: actor.role, ...(comment ? { comment } : {}) }, cfg);

    await tx.update(schema.budgetLine).set({ state: t.to, updatedAt: new Date() }).where(inArray(schema.budgetLine.id, lineIds));
    await tx.insert(schema.approvalEvent).values(
      lines.map((l) => ({
        lineId: l.id,
        fromState: t.from,
        toState: t.to,
        action,
        actorUserId: actor.userId,
        actorRole: actor.role,
        comment: comment ?? null,
      })),
    );
    // The version locks when its last line does; a locked version is never edited again.
    if (t.to === "locked") {
      const versionId = lines[0]!.versionId;
      const states = await tx.select({ state: schema.budgetLine.state }).from(schema.budgetLine).where(eq(schema.budgetLine.versionId, versionId));
      if (isFullyLocked(states.map((r) => r.state))) {
        await tx
          .update(schema.budgetVersion)
          .set({ status: "locked", lockedAt: new Date(), lockedBy: actor.userId })
          .where(eq(schema.budgetVersion.id, versionId));
      }
    }
    return { t, lines };
  });

  await notify(result.lines, action, result.t, cfg, org, comment);
  return result.t;
}

/** One email per recipient per handoff, never one per line; the body names units and counts, never rupiah. */
async function notify(
  lines: { ownerUnit: string; createdBy: string | null }[],
  action: ApprovalAction,
  t: { from: ApprovalState; to: ApprovalState },
  cfg: ApprovalConfig,
  org: OrgTree,
  comment?: string,
) {
  const positions = await db.select().from(schema.position);
  const posForDomain = positions.map((p) => ({ orgUnit: p.orgUnitCode, role: p.role, holder: p.holderUserId, acting: p.actingUserId }));
  const groups = handoffs(lines);
  const holdersOf = (role: Role) =>
    positions.filter((p) => p.role === role).map((p) => p.holderUserId ?? p.actingUserId).filter((x): x is string => !!x);

  type Inbox = Map<string, { units: Set<string>; count: number }>;
  const add = (inbox: Inbox, userId: string, unit: string, count: number) => {
    const box = inbox.get(userId) ?? { units: new Set<string>(), count: 0 };
    box.units.add(unit);
    box.count += count;
    inbox.set(userId, box);
  };
  const send = async (template: EmailTemplate, inbox: Inbox, link: string, extra: Record<string, string> = {}) => {
    if (!inbox.size) return;
    const users = await db.select().from(schema.user).where(inArray(schema.user.id, [...inbox.keys()]));
    for (const u of users) {
      const box = inbox.get(u.id)!;
      await enqueueEmail({
        template,
        to: { userId: u.id, email: u.email, name: u.name },
        payload: { url: `${env.APP_URL}${link}`, unit: [...box.units].join(", "), count: String(box.count), ...extra },
      });
      await db.insert(schema.notification).values({ userId: u.id, template, link });
    }
  };

  for (const n of notificationsFor({ action, from: t.from, to: t.to, ...(comment ? { comment } : {}) })) {
    const inbox: Inbox = new Map();
    const vacant: Inbox = new Map();
    const to: Recipient = n.to;
    const role: Role | null = to === "all_participants" ? null : to === "lock_role" ? cfg.lockRole : to;

    if (to === "all_participants") {
      const participants = positions.filter((p) => isParticipant(p.role)).map((p) => p.holderUserId ?? p.actingUserId);
      for (const id of new Set(participants.filter((x): x is string => !!x))) {
        for (const g of groups) add(inbox, id, g.ownerUnit, g.count);
      }
    } else {
      for (const g of groups) {
        if (role === "requestor") {
          for (const id of g.requestors) add(inbox, id, g.ownerUnit, lines.filter((l) => l.ownerUnit === g.ownerUnit && l.createdBy === id).length);
        } else if (role === "finance" || role === "director") {
          for (const id of holdersOf(role)) add(inbox, id, g.ownerUnit, g.count);
        } else if (role) {
          // A vacant seat is not escalated: Admin is told to assign a pjs.
          const seat = seatFor(g.ownerUnit, role, posForDomain, org);
          if (seat.holder) add(inbox, seat.holder, g.ownerUnit, g.count);
          else for (const id of holdersOf("admin")) add(vacant, id, seat.unit, g.count);
        }
      }
    }

    await send(n.template, inbox, TRANSITION_LINK[action], n.comment ? { comment: n.comment } : {});
    if (role) await send("seat_vacant", vacant, "/admin/positions", { role: ROLE_LABEL[role] });
  }
}
