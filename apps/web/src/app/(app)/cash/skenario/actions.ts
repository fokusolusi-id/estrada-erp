"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { canCash, parseIdr, scenarioProblem } from "@estrada/domain";
import { reportVersions } from "@/lib/rka";
import { requireUser } from "@/lib/session";

type Result = { ok: boolean; message: string };

const MESSAGE = {
  amount: "Pendapatan dan CapEx harus angka 0 atau lebih.",
  percent: "Persentase harus antara 0 dan 100.",
  days: "DSO dan DPO harus 0 sampai 360 hari.",
  season: "Persentase 12 bulan harus berjumlah 100.",
};
const Drivers = z.object({ revenue: z.string().max(40), cogsPct: z.string().max(10), opexPct: z.string().max(10), taxPct: z.string().max(10), dso: z.number(), dpo: z.number(), capex: z.string().max(40) });
const Input = z.object({
  scenarios: z.object({ conservative: Drivers, normal: Drivers, aggressive: Drivers }),
  seasonality: z.array(z.string().max(10)).length(12),
});
export type ScenarioInput = z.input<typeof Input>;

/** Finance saves the year's three scenarios and the monthly seasonality. */
export async function saveScenarios(input: ScenarioInput): Promise<Result> {
  const user = await requireUser();
  if (!canCash(user.actor, "manage")) return { ok: false, message: "Hanya Finance yang dapat mengubah skenario." };
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Isian skenario tidak valid." };
  const decimal = (s: string) => s.trim().replace(",", ".");
  const rupiah = (s: string) => {
    try {
      return parseIdr(s.trim() || "0").toFixed();
    } catch {
      return "?";
    }
  };
  const clean = (d: z.output<typeof Drivers>) => ({ ...d, revenue: rupiah(d.revenue), capex: rupiah(d.capex), cogsPct: decimal(d.cogsPct), opexPct: decimal(d.opexPct), taxPct: decimal(d.taxPct) });
  const s = parsed.data.scenarios;
  const values = {
    scenarios: { conservative: clean(s.conservative), normal: clean(s.normal), aggressive: clean(s.aggressive) },
    seasonality: parsed.data.seasonality.map(decimal),
  };
  const problem = scenarioProblem(values);
  if (problem) return { ok: false, message: MESSAGE[problem] };
  const [version] = await reportVersions();
  if (!version) return { ok: false, message: "Belum ada siklus RKA." };
  const year = version.fiscalYear;
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.scenarioSetting).where(eq(schema.scenarioSetting.fiscalYear, year));
    const record = { fiscalYear: year, ...values, updatedBy: user.id, updatedAt: new Date() };
    await tx.insert(schema.scenarioSetting).values(record).onConflictDoUpdate({ target: schema.scenarioSetting.fiscalYear, set: record });
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "cash.scenarios", subjectType: "scenario_setting", subjectId: String(year), before: before ?? null, after: record });
  });
  revalidatePath("/cash/skenario");
  return { ok: true, message: "Skenario disimpan." };
}
