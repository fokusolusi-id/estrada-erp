"use server";

import { z } from "zod";
import { decideChange } from "@/lib/master-change";
import { requireUser } from "@/lib/session";

type Result = { ok: boolean; message: string };

const Id = z.string().uuid();

export async function decideRequest(id: string, decision: "approve" | "reject", note: string): Promise<Result> {
  const user = await requireUser();
  const parsed = z.object({ id: Id, decision: z.enum(["approve", "reject"]), note: z.string().max(1000) }).safeParse({ id, decision, note });
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  return decideChange(user, id, parsed.data.decision, parsed.data.note);
}

export async function cancelRequest(id: string): Promise<Result> {
  const user = await requireUser();
  if (!Id.safeParse(id).success) return { ok: false, message: "Permintaan tidak valid." };
  return decideChange(user, id, "cancel", "");
}
