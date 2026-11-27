"use server";

import { z } from "zod";
import { CATEGORIES, can } from "@estrada/domain";
import { requestChange } from "@/lib/master-change";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

export type CoaState = { ok: boolean; message: string; errors?: Record<string, string[]> };

/** COA Master belongs to Finance alone (CARA PENGISIAN point 6, confirmed by the client). */
async function requireCoaOwner() {
  const user = await requireUser();
  return can(user.actor, "coa.manage", null, await loadOrg()) ? user : null;
}

const CoaSchema = z.object({
  mode: z.enum(["create", "update"]),
  code: z.string().trim().regex(/^[0-9A-Za-z][0-9A-Za-z-]{1,19}$/, "Kode 2–20 karakter: angka, huruf, tanda hubung"),
  name: z.string().trim().min(3, "Nama wajib diisi"),
  category: z.enum(CATEGORIES),
  defaultOwnerUnit: z.string().optional(),
  parentCode: z.string().optional(),
  active: z.string().optional(),
  guidance: z.string().trim().max(2000).optional(),
  reason: z.string().max(1000).default(""),
  effectiveOn: z.string().default(""),
});

const REFUSAL = "Hanya Finance yang dapat mengubah COA Master.";

/** Every change to COA Master is a request the Finance Controller approves (BR-MD-006). */
export async function saveCoa(_prev: CoaState, form: FormData): Promise<CoaState> {
  const finance = await requireCoaOwner();
  if (!finance) return { ok: false, message: REFUSAL };
  const parsed = CoaSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Periksa isian.", errors: z.flattenError(parsed.error).fieldErrors };
  const v = parsed.data;
  return requestChange(
    finance,
    {
      master: "coa",
      action: v.mode,
      subjectId: v.code,
      payload: {
        name: v.name,
        category: v.category,
        center: v.category === "Revenue" ? "revenue" : "cost",
        defaultOwnerUnit: v.defaultOwnerUnit || null,
        parentCode: v.parentCode || null,
        active: v.active === "on",
        guidance: v.guidance || null,
      },
    },
    v.reason,
    v.effectiveOn,
  );
}

export async function confirmCoa(code: string, reason: string, effectiveOn: string): Promise<CoaState> {
  const finance = await requireCoaOwner();
  if (!finance) return { ok: false, message: REFUSAL };
  return requestChange(finance, { master: "coa", action: "confirm", subjectId: code, payload: {} }, reason, effectiveOn);
}

/** Asks to move every line off a provisional code onto an existing one, retiring the provisional code. */
export async function remapCoa(source: string, target: string, reason: string, effectiveOn: string): Promise<CoaState> {
  const finance = await requireCoaOwner();
  if (!finance) return { ok: false, message: REFUSAL };
  return requestChange(finance, { master: "coa", action: "remap", subjectId: source, payload: { target } }, reason, effectiveOn);
}
