import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  allocateShared,
  cashForecast,
  consolidateCash,
  loanSchedule,
  money,
  ZERO,
  type CashForecast,
  type CashSettings,
  type EntityOpening,
  type Money,
} from "@estrada/domain";
import { loadAllocation } from "./allocation";
import { loadScopedLines, reportVersions } from "./rka";
import type { CurrentUser } from "./session";

export interface Facility {
  id: string;
  name: string;
  type: "existing" | "new";
  entity: string;
  rate: string;
  openingBalance: Money;
  creditLimit: Money | null;
  notes: string | null;
  drawdown: Money[];
  repayment: Money[];
  outstanding: Money[];
  interest: Money[];
}

export interface CashView {
  year: number;
  versionName: string;
  settings: (CashSettings & { minimumCash: Money }) | null;
  entities: string[];
  openings: Map<string, EntityOpening>;
  facilities: Facility[];
  /** Per entity, then "KONSOLIDASI"; empty until the assumptions are in. */
  forecasts: Map<string, CashForecast>;
}

const zeros = () => Array.from({ length: 12 }, () => ZERO);
export const CONSOLIDATED = "KONSOLIDASI";

/**
 * The forecast for the version being reported (the open one, else the latest locked), from its lines after
 * Biaya Bersama, so each entity carries its share of shared costs (client decision), plus the year's
 * assumptions and Obligo.
 */
export async function loadCash(user: CurrentUser): Promise<CashView | null> {
  const [version] = await reportVersions();
  if (!version) return null;
  const year = version.fiscalYear;

  const [setting, openingRows, facilityRows, entityRows, lines, allocation] = await Promise.all([
    db.select().from(schema.cashSetting).where(eq(schema.cashSetting.fiscalYear, year)),
    db.select().from(schema.cashOpening).where(eq(schema.cashOpening.fiscalYear, year)),
    db.select().from(schema.loanFacility).where(eq(schema.loanFacility.fiscalYear, year)).orderBy(asc(schema.loanFacility.createdAt)),
    db.select().from(schema.companyEntity).where(eq(schema.companyEntity.active, true)),
    loadScopedLines(user, undefined, version.id),
    loadAllocation(version.id),
  ]);
  const moves = facilityRows.length
    ? await db.select().from(schema.loanMove).where(inArray(schema.loanMove.facilityId, facilityRows.map((f) => f.id)))
    : [];

  const entities = [...entityRows.filter((e) => e.costType === "indirect"), ...entityRows.filter((e) => e.costType !== "indirect")].map((e) => e.code);
  const openings = new Map(
    openingRows.map((o) => [
      o.entityCode,
      { cash: money(o.cash), receivables: money(o.receivables), payables: money(o.payables), priorYearTax: money(o.priorYearTax), minimumCash: money(o.minimumCash) },
    ]),
  );
  const facilities: Facility[] = facilityRows.map((f) => {
    const drawdown = zeros();
    const repayment = zeros();
    for (const m of moves.filter((x) => x.facilityId === f.id)) {
      drawdown[m.month - 1] = money(m.drawdown);
      repayment[m.month - 1] = money(m.repayment);
    }
    const s = loanSchedule({ openingBalance: money(f.openingBalance), rate: money(f.rate).toFixed() }, drawdown, repayment);
    return {
      id: f.id,
      name: f.name,
      type: f.type,
      entity: f.entityCode,
      rate: money(f.rate).toFixed(),
      openingBalance: money(f.openingBalance),
      creditLimit: f.creditLimit ? money(f.creditLimit) : null,
      notes: f.notes,
      drawdown,
      repayment,
      ...s,
    };
  });

  const s = setting[0];
  const settings = s
    ? {
        collectionLag: s.collectionLag,
        cogsPaymentLag: s.cogsPaymentLag,
        taxRate: money(s.taxRate).toFixed(),
        minimumCash: money(s.minimumCash),
        interestCoa: s.interestCoa,
        nonCashCoa: s.nonCashCoa,
      }
    : null;

  const forecasts = new Map<string, CashForecast>();
  if (settings) {
    const allocated = allocateShared(lines, allocation.rules, allocation.ctx).lines;
    const blank: EntityOpening = { cash: ZERO, receivables: ZERO, payables: ZERO, priorYearTax: ZERO, minimumCash: ZERO };
    for (const entity of entities) {
      const own = facilities.filter((f) => f.entity === entity);
      const total = (pick: (f: Facility) => Money[]) => own.reduce((acc, f) => acc.map((v, i) => v.plus(pick(f)[i]!)), zeros());
      forecasts.set(
        entity,
        cashForecast(
          allocated.filter((l) => l.entity === entity),
          openings.get(entity) ?? blank,
          settings,
          { drawdown: total((f) => f.drawdown), repayment: total((f) => f.repayment), interest: total((f) => f.interest) },
        ),
      );
    }
    forecasts.set(CONSOLIDATED, consolidateCash([...forecasts.values()], settings.minimumCash));
  }

  return { year, versionName: version.name, settings, entities, openings, facilities, forecasts };
}
