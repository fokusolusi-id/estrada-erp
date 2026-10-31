import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  ROLE_LABEL,
  actionsFor,
  can,
  money,
  openRemark,
  ZERO,
  type ApprovalAction,
  type ApprovalState,
  type Category,
} from "@estrada/domain";
import type { Remark, TimelineEvent } from "@/components/erp/approval-timeline";
import type { GridLine } from "@/components/erp/budget-grid";
import type { CurrentUser } from "./session";
import { approvalConfig, loadOrg } from "./workflow";

export async function openVersion() {
  const [version] = await db
    .select()
    .from(schema.budgetVersion)
    .where(eq(schema.budgetVersion.status, "open"))
    .orderBy(asc(schema.budgetVersion.createdAt))
    .limit(1);
  return version ?? null;
}

export interface ScopedLine extends GridLine {
  category: Category;
  item: string | null;
  history: TimelineEvent[];
  remark?: Remark;
  actions: ApprovalAction[];
  canEdit: boolean;
}

/** Lines of the open version this position may see, with what it may do to each. Authorised in the domain. */
export async function loadScopedLines(user: CurrentUser, states?: readonly ApprovalState[]): Promise<ScopedLine[]> {
  const version = await openVersion();
  if (!version) return [];
  const org = await loadOrg();
  const cfg = approvalConfig();

  const rows = await db
    .select({ line: schema.budgetLine, coaName: schema.coaAccount.name, category: schema.coaAccount.category })
    .from(schema.budgetLine)
    .innerJoin(schema.coaAccount, eq(schema.coaAccount.code, schema.budgetLine.coaCode))
    .where(eq(schema.budgetLine.versionId, version.id))
    .orderBy(asc(schema.budgetLine.ownerUnit), asc(schema.budgetLine.coaCode), asc(schema.budgetLine.createdAt));

  const visible = rows.filter(({ line }) => {
    if (states && !states.includes(line.state)) return false;
    return can(user.actor, "line.view", { requestorUnit: line.requestorUnit, ownerUnit: line.ownerUnit, entity: line.entityCode, state: line.state }, org);
  });

  const amounts = visible.length
    ? await db.select().from(schema.budgetLineAmount).where(inArray(schema.budgetLineAmount.lineId, visible.map((v) => v.line.id)))
    : [];
  const events = visible.length
    ? await db
        .select({ event: schema.approvalEvent, actorName: schema.user.name })
        .from(schema.approvalEvent)
        .innerJoin(schema.user, eq(schema.user.id, schema.approvalEvent.actorUserId))
        .where(inArray(schema.approvalEvent.lineId, visible.map((v) => v.line.id)))
        .orderBy(asc(schema.approvalEvent.createdAt))
    : [];
  const historyOf = new Map<string, TimelineEvent[]>();
  for (const { event: e, actorName } of events) {
    const list = historyOf.get(e.lineId) ?? [];
    list.push({
      action: e.action as ApprovalAction,
      fromState: e.fromState,
      toState: e.toState,
      actorName,
      actorRole: ROLE_LABEL[e.actorRole],
      comment: e.comment,
      at: e.createdAt.toISOString(),
    });
    historyOf.set(e.lineId, list);
  }

  const monthsOf = new Map<string, ReturnType<typeof money>[]>();
  for (const a of amounts) {
    const months = monthsOf.get(a.lineId) ?? Array.from({ length: 12 }, () => ZERO);
    months[a.month - 1] = money(a.amount);
    monthsOf.set(a.lineId, months);
  }

  return visible.map(({ line, coaName, category }) => {
    const res = { requestorUnit: line.requestorUnit, ownerUnit: line.ownerUnit, entity: line.entityCode, state: line.state };
    const history = historyOf.get(line.id) ?? [];
    const open = openRemark(history.map((h) => ({ ...h, at: new Date(h.at) })), line.state);
    return {
      id: line.id,
      coaCode: line.coaCode,
      coaName,
      category,
      entity: line.entityCode,
      requestorUnit: line.requestorUnit,
      ownerUnit: line.ownerUnit,
      months: monthsOf.get(line.id) ?? Array.from({ length: 12 }, () => ZERO),
      state: line.state,
      item: line.item,
      history,
      rka2026: line.rka2026 ? money(line.rka2026) : null,
      actual2026: line.actual2026 ? money(line.actual2026) : null,
      flags: line.reviewFlags,
      ...(open?.comment ? { remark: { by: open.actorName, comment: open.comment } } : {}),
      ...(line.basis ? { basis: line.basis } : {}),
      actions: actionsFor(user.actor, res, org, cfg),
      canEdit: can(user.actor, "line.edit", res, org),
    };
  });
}

/** Master data for the line editor: active COA, active entities within the user's scope, org units. */
export async function editorMasters(user: CurrentUser) {
  const [coa, entities, units] = await Promise.all([
    db.select().from(schema.coaAccount).where(eq(schema.coaAccount.active, true)).orderBy(asc(schema.coaAccount.code)),
    db.select().from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
    db.select().from(schema.orgUnit).orderBy(asc(schema.orgUnit.code)),
  ]);
  const scoped = user.actor.entities.includes("*") ? entities : entities.filter((e) => user.actor.entities.includes(e.code));
  return {
    coa: coa.map((c) => ({ code: c.code, name: c.name, category: c.category, defaultOwnerUnit: c.defaultOwnerUnit })),
    entities: scoped.map((e) => e.code),
    units: units.filter((u) => u.type !== "company").map((u) => ({ code: u.code, name: u.name })),
  };
}
