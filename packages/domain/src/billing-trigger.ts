/** When delivery opens billing (plan C5; sheet FC06_Implementasi; BR-IMP-002). */
import type { BusinessModel } from "./pipeline";

/** A service (Recurring) project issues nothing before its RFS is approved. */
export const waitsForRfs = (v: { businessModel: BusinessModel | null; rfsOn: string | null }) => v.businessModel === "recurring" && !v.rfsOn;

/** The first termin by number that has no live invoice. */
export const nextTermin = (termins: readonly number[], invoiced: readonly number[]): number | null => [...termins].sort((a, b) => a - b).find((no) => !invoiced.includes(no)) ?? null;
