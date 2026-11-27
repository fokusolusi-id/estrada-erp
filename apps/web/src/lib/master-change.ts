import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, lte } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { CHANGE_STATUS_LABEL, OPEN_CHANGE_STATUSES, can, changeStep, isDue, requestProblem, type ChangeDecision, type ChangeStatus, type ChangeStepProblem, type RequestProblem } from "@estrada/domain";
import { enqueueEmail } from "./email/outbox";
import { env } from "./env";
import { checkChange, writeChange, type ChangeProblem, type MasterChange } from "./master-change-apply";
import type { CurrentUser } from "./session";
import { loadOrg } from "./workflow";

type Result = { ok: boolean; message: string; errors?: Record<string, string[]> };
type Request = typeof schema.masterChangeRequest.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const REQUEST_MESSAGE: Record<RequestProblem, string> = {
  reason_required: "Alasan perubahan wajib diisi.",
  effective_invalid: "Tanggal berlaku tidak valid.",
  effective_past: "Tanggal berlaku tidak boleh sebelum hari ini.",
};
const STEP_MESSAGE: Record<ChangeStepProblem, string> = {
  wrong_state: "Permintaan ini sudah diputuskan.",
  not_approver: "Hanya Finance Controller (Division Owner FRM) yang memutuskan.",
  own_request: "Pemohon tidak dapat memutuskan permintaannya sendiri.",
  note_required: "Tulis alasan penolakan.",
  not_requester: "Hanya pemohon yang dapat membatalkan.",
};
export const subjectLabel = (r: { master: string; subjectId: string }) => `${r.master === "coa" ? "COA" : "Perusahaan"} ${r.subjectId}`;

export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

class Refused extends Error {
  constructor(readonly problem: ChangeProblem) {
    super(problem.message);
  }
}

const link = () => `${env.APP_URL}/master/persetujuan`;

/** Records a change to a sensitive master and asks the Finance Controller. The master is not touched yet. */
export async function requestChange(user: CurrentUser, change: MasterChange, reason: string, effectiveOn: string): Promise<Result> {
  const invalid = requestProblem({ reason, effectiveOn }, today());
  if (invalid) return { ok: false, message: REQUEST_MESSAGE[invalid] };
  const checked = await checkChange(db, change);
  if ("problem" in checked) return { ok: false, ...checked.problem };
  const [open] = await db
    .select({ id: schema.masterChangeRequest.id })
    .from(schema.masterChangeRequest)
    .where(and(eq(schema.masterChangeRequest.master, change.master), eq(schema.masterChangeRequest.subjectId, change.subjectId), inArray(schema.masterChangeRequest.status, [...OPEN_CHANGE_STATUSES])));
  if (open) return { ok: false, message: `Masih ada permintaan yang terbuka untuk ${change.subjectId}.` };

  const values = { master: change.master, subjectId: change.subjectId, action: change.action, payload: { ...change.payload }, before: checked.before, reason: reason.trim(), effectiveOn, requesterId: user.id };
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.masterChangeRequest).values(values).returning({ id: schema.masterChangeRequest.id });
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "master.request.submit", subjectType: "master_change_request", subjectId: row!.id, before: checked.before, after: values });
  });

  for (const to of await approvers(user.id)) {
    await enqueueEmail({ template: "master_change_submitted", to, payload: { url: link(), subject: subjectLabel(change), requester: user.name, effective: effectiveOn } });
  }
  revalidatePath("/master/persetujuan");
  return { ok: true, message: `Permintaan perubahan ${change.subjectId} dikirim ke Finance Controller. Perubahan berlaku setelah disetujui.` };
}

/** Whoever sits in the Finance Controller's seat, but never the requester. */
async function approvers(requesterId: string) {
  const seats = await db.select().from(schema.position).where(and(eq(schema.position.orgUnitCode, "FRM"), eq(schema.position.role, "division_owner")));
  const ids = [...new Set(seats.flatMap((s) => [s.holderUserId, s.actingUserId]).filter((id): id is string => !!id && id !== requesterId))];
  if (!ids.length) return [];
  const users = await db.select().from(schema.user).where(inArray(schema.user.id, ids));
  return users.map((u) => ({ userId: u.id, email: u.email, name: u.name }));
}

async function tellRequester(r: Request, status: ChangeStatus, note: string | null) {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, r.requesterId));
  if (!u) return;
  await enqueueEmail({
    template: "master_change_decided",
    to: { userId: u.id, email: u.email, name: u.name },
    payload: { url: link(), subject: subjectLabel(r), status: CHANGE_STATUS_LABEL[status], ...(note ? { comment: note } : {}) },
  });
}

/** Moves a request on, only if it is still where it was read: two people cannot decide it twice. */
async function move(tx: Tx, r: Request, to: ChangeStatus, patch: Partial<Request>) {
  const rows = await tx
    .update(schema.masterChangeRequest)
    .set({ ...patch, status: to })
    .where(and(eq(schema.masterChangeRequest.id, r.id), eq(schema.masterChangeRequest.status, r.status)))
    .returning({ id: schema.masterChangeRequest.id });
  if (!rows.length) throw new Refused({ message: STEP_MESSAGE.wrong_state });
}

async function apply(tx: Tx, r: Request, approvedBy: string | null) {
  const change = { master: r.master, action: r.action, subjectId: r.subjectId, payload: r.payload } as unknown as MasterChange;
  const checked = await checkChange(tx, change);
  if ("problem" in checked) throw new Refused(checked.problem);
  const after = await writeChange(tx, change);
  await move(tx, r, "applied", { appliedAt: new Date() });
  await tx.insert(schema.auditLog).values({
    actorUserId: approvedBy,
    action: `${r.master}.${r.action}`,
    subjectType: r.master === "coa" ? "coa_account" : "company_entity",
    subjectId: r.subjectId,
    before: checked.before,
    after: { ...after, requestId: r.id, requestedBy: r.requesterId, approvedBy, reason: r.reason, effectiveOn: r.effectiveOn },
  });
}

const refresh = () => ["/master/persetujuan", "/coa", "/admin/master", "/rka"].forEach((p) => revalidatePath(p));

/** Approve, reject or cancel. An approval whose effective date has come is applied in the same step. */
export async function decideChange(user: CurrentUser, id: string, decision: ChangeDecision, note: string): Promise<Result> {
  const [r] = await db.select().from(schema.masterChangeRequest).where(eq(schema.masterChangeRequest.id, id));
  if (!r) return { ok: false, message: "Permintaan tidak ditemukan." };
  const mayApprove = can(user.actor, "master.approve", null, await loadOrg());
  const step = changeStep(r.status, decision, { actorId: user.id, requesterId: r.requesterId, mayApprove, note });
  if ("problem" in step) return { ok: false, message: STEP_MESSAGE[step.problem] };

  const due = step.to === "approved" && isDue(r.effectiveOn, today());
  const patch = decision === "cancel" ? {} : { decidedBy: user.id, decidedAt: new Date(), note: note.trim() || null };
  try {
    await db.transaction(async (tx) => {
      await move(tx, r, step.to, patch);
      await tx.insert(schema.auditLog).values({
        actorUserId: user.id,
        action: `master.request.${decision}`,
        subjectType: "master_change_request",
        subjectId: r.id,
        before: { status: r.status },
        after: { status: step.to, note: note.trim() || null },
      });
      if (due) await apply(tx, { ...r, status: "approved" }, user.id);
    });
  } catch (e) {
    if (e instanceof Refused) return { ok: false, message: `Belum dapat diterapkan: ${e.problem.errors ? Object.values(e.problem.errors).flat().join(" ") : e.problem.message}` };
    throw e;
  }

  const status = due ? "applied" : step.to;
  if (decision !== "cancel") await tellRequester(r, status, note.trim() || null);
  refresh();
  return { ok: true, message: `${subjectLabel(r)}: ${CHANGE_STATUS_LABEL[status].toLowerCase()}.` };
}

/** The daily job: applies approved changes whose effective date has come; one that no longer fits is marked failed. */
export async function applyDueChanges(date = today()): Promise<{ applied: number; failed: number }> {
  const due = await db
    .select()
    .from(schema.masterChangeRequest)
    .where(and(eq(schema.masterChangeRequest.status, "approved"), lte(schema.masterChangeRequest.effectiveOn, date)));
  const done = { applied: 0, failed: 0 };
  for (const r of due) {
    try {
      await db.transaction((tx) => apply(tx, r, r.decidedBy));
      done.applied++;
    } catch (e) {
      const note = e instanceof Error ? e.message : String(e);
      await db.transaction(async (tx) => {
        await move(tx, r, "failed", { note });
        await tx.insert(schema.auditLog).values({ action: "master.request.fail", subjectType: "master_change_request", subjectId: r.id, before: { status: r.status }, after: { status: "failed", note } });
      });
      await tellRequester(r, "failed", note);
      done.failed++;
    }
  }
  return done;
}
