import type { OrgTree } from "./org";
import type { Actor } from "./policy";

/**
 * The header's Entitas and Divisi: what every screen shows. A view only narrows what the position may already see;
 * authorisation stays with `can()`. Null is Semua.
 */
export interface ViewFilter {
  entity: string | null;
  division: string | null;
}

export interface ViewChoices {
  entities: string[];
  divisions: string[];
}

const COMPANY_WIDE = new Set(["finance", "director", "auditor", "admin"]);

/** The entities and divisions on offer: the position's own entities, and the divisions at, above or below its unit. */
export function viewChoices(actor: Actor, entities: readonly string[], org: OrgTree): ViewChoices {
  const all = org.divisions();
  return {
    entities: actor.entities.includes("*") ? [...entities] : entities.filter((e) => actor.entities.includes(e)),
    divisions: COMPANY_WIDE.has(actor.role) ? all : all.filter((d) => org.isWithin(d, actor.orgUnit) || org.isWithin(actor.orgUnit, d)),
  };
}

/** The saved choice when it is on offer, else Semua. A single choice filters nothing: the scope already is the view. */
export function pickView(saved: { entity?: string; division?: string }, choices: ViewChoices): ViewFilter {
  const pick = (value: string | undefined, offered: string[]) => (offered.length > 1 && value && offered.includes(value) ? value : null);
  return { entity: pick(saved.entity, choices.entities), division: pick(saved.division, choices.divisions) };
}

/** Lines of the chosen entity whose budget owner sits in the chosen division (the Kontribusi Divisi rule). */
export function inView(view: ViewFilter, org: OrgTree) {
  return (line: { entity: string; ownerUnit: string }) =>
    (!view.entity || line.entity === view.entity) && (!view.division || org.divisionOf(line.ownerUnit) === view.division);
}

/** Table columns that would repeat one value on every row because the header narrowed them. */
export interface HiddenColumns {
  entity: boolean;
  owner: boolean;
}

/**
 * Entitas goes once one entity is picked. Pemilik goes once a division is picked and only one owner unit is left;
 * a division with several departments keeps it. Under Semua every column stays.
 */
export function repeatedColumns(view: ViewFilter, lines: readonly { entity: string; ownerUnit: string }[]): HiddenColumns {
  return { entity: !!view.entity, owner: !!view.division && new Set(lines.map((l) => l.ownerUnit)).size === 1 };
}
