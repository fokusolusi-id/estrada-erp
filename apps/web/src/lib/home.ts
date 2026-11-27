import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  canProject,
  cashSummary,
  headcountByUnit,
  homeWidgets,
  isCfo,
  money,
  monthsElapsed,
  obligoSummary,
  pipelineFunnel,
  spendingByUnit,
  rkaLabel,
  type HomeWidget,
  type OrgTree,
} from "@estrada/domain";
import { CONSOLIDATED, loadCash } from "./cash";
import { loadProjects } from "./implementasi";
import { paymentRealisasi, todayJakarta } from "./payment";
import { pipelineYear } from "./pipeline";
import { loadScopedLines, reportVersions } from "./rka";
import type { CurrentUser } from "./session";
import { activeView, viewLines } from "./view-filter";

/**
 * The reader for company-wide summaries. Cash Management and the CFO see these cards (plan, Beranda per role) while
 * their line scope is FRM alone, so the totals are read as the Direktur would, within their own entities.
 */
export const companyWide = (user: CurrentUser): CurrentUser => ({ ...user, actor: { ...user.actor, role: "director" } });

/** The approved budget is the locked version; until one exists, the version being worked on, and the screen says so. */
export const approvedBudget = <V extends { status: string }>(versions: readonly V[]) => versions.find((v) => v.status === "locked") ?? versions[0];

export async function loadHome(user: CurrentUser, org: OrgTree) {
  const widgets = homeWidgets(user.actor, org);
  const has = (w: HomeWidget) => widgets.includes(w);
  if (!widgets.length) return null;
  const today = todayJakarta();
  const [versions, view] = await Promise.all([reportVersions(), activeView()]);
  const version = approvedBudget(versions);
  const covers = (entity: string) => (user.actor.entities.includes("*") || user.actor.entities.includes(entity)) && (!view.entity || view.entity === entity);
  const months = version ? monthsElapsed(version.fiscalYear, today) : 0;
  const budgetNote = version
    ? `${rkaLabel(version)}${version.status === "locked" ? "" : " (belum dikunci)"}${months ? "" : " · tahun anggaran belum berjalan"}`
    : "Belum ada RKA";

  let spending = null;
  if (version && (has("rka") || has("costCenter"))) {
    const lines = await viewLines(await loadScopedLines(isCfo(user.actor, org) ? companyWide(user) : user, undefined, version.id));
    const used = await paymentRealisasi(lines.map((l) => l.id), version.fiscalYear);
    const by = (unit: (owner: string) => string) =>
      spendingByUnit(lines.map((l) => ({ id: l.id, unit: unit(l.ownerUnit), category: l.category, months: l.months })), used, months);
    spending = { divisions: by((u) => org.divisionOf(u)), units: by((u) => u) };
  }

  let cash = null;
  if (has("cashflow") || has("obligo")) {
    const loaded = await loadCash(companyWide(user));
    const forecast = loaded?.forecasts.get(view.entity ?? CONSOLIDATED);
    cash = {
      note: loaded ? `${loaded.versionName} · ${view.entity ?? "konsolidasi"}, proyeksi` : "Belum ada RKA",
      flow: forecast ? cashSummary(forecast.rows) : null,
      obligo: obligoSummary((loaded?.facilities ?? []).filter((f) => covers(f.entity)), loaded ? monthsElapsed(loaded.year, today) : 0),
    };
  }

  let pipeline = null;
  if (has("pipeline")) {
    const year = await pipelineYear();
    const deals = year ? await db.select().from(schema.pipelineDeal).where(eq(schema.pipelineDeal.fiscalYear, year)) : [];
    pipeline = {
      year,
      rows: pipelineFunnel(
        deals.filter((d) => covers(d.entityCode)).map((d) => ({ status: d.status, value: d.value, probability: d.probability, createdOn: d.createdAt.toISOString().slice(0, 10) })),
        today,
      ),
    };
  }

  let headcount = null;
  if (has("headcount")) {
    // HCM, the Direktur and the Auditor count everyone; a Division Owner counts the division.
    const everyone = user.actor.role === "director" || user.actor.role === "auditor" || org.isWithin(user.actor.orgUnit, "HCM") || isCfo(user.actor, org);
    const inScope = (unit: string) => (everyone || org.isWithin(unit, user.actor.orgUnit)) && (!view.division || org.divisionOf(unit) === view.division);
    const people = await db.select({ unit: schema.employee.unitCode, entity: schema.employee.entityCode }).from(schema.employee).where(eq(schema.employee.active, true));
    const plan = version
      ? await db
          .select({ unit: schema.budgetLine.ownerUnit, entity: schema.budgetLine.entityCode, count: schema.headcountPlan.headCount })
          .from(schema.headcountPlan)
          .innerJoin(schema.budgetLine, eq(schema.budgetLine.id, schema.headcountPlan.lineId))
          .where(and(eq(schema.budgetLine.versionId, version.id)))
      : [];
    headcount = headcountByUnit(
      people.flatMap((p) => (p.unit && covers(p.entity) && inScope(p.unit) ? [p.unit] : [])),
      plan.filter((p) => covers(p.entity) && inScope(p.unit)),
    );
  }

  let projects = null;
  if (has("projects")) {
    const rows = (await loadProjects()).filter((p) => covers(p.entity) && canProject(user.actor, "view", { entity: p.entity, team: null }, org));
    const values = rows.length
      ? await db.select({ id: schema.pipelineDeal.id, value: schema.pipelineDeal.value }).from(schema.pipelineDeal).where(inArray(schema.pipelineDeal.id, rows.map((r) => r.dealId)))
      : [];
    const valueOf = new Map(values.map((v) => [v.id, v.value]));
    projects = rows.map((p) => ({ id: p.id, name: p.name, status: p.status, value: money(valueOf.get(p.dealId) ?? "0") }));
  }

  return { widgets, budgetNote, spending, cash, pipeline, headcount, projects };
}
