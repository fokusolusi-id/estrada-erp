import type { OrgUnitNode } from "./org";
import { ROLES, type Role } from "./roles";

/**
 * Struktur Organisasi drawn as a chart: units (Unit & Entitas) nested by parent, each with its positions and who
 * holds them (Posisi & pjs).
 */

export interface ChartUnit {
  code: string;
  name: string;
  type: NonNullable<OrgUnitNode["type"]>;
  parent: string | null;
}

export interface ChartSeat {
  id: string;
  orgUnit: string;
  title: string;
  role: Role;
  holder: string | null;
  acting: string | null;
  /** The name on the org chart document while the person has no account yet. */
  holderName?: string | null;
}

export interface ChartNode extends ChartUnit {
  positions: ChartSeat[];
  children: ChartNode[];
  /** Empty seats (no holder, no pjs) here and anywhere below. */
  vacant: number;
}

/** Held by an account, by a pjs, named on the document but without an account yet, or empty. */
export type SeatStatus = "filled" | "acting" | "named" | "vacant";

export const seatStatus = (s: { holder: string | null; acting: string | null; holderName?: string | null }): SeatStatus =>
  s.holder ? "filled" : s.acting ? "acting" : s.holderName ? "named" : "vacant";

// Heads first: the order a reader expects on a chart.
const RANK: Role[] = ["director", "division_owner", "default_owner", "finance", "auditor", "requestor", "admin"];
const rank = (r: Role) => (RANK.includes(r) ? RANK.indexOf(r) : ROLES.length);

/** The chart's roots (normally the company), each unit with its positions and sub-units. */
export function orgChart(units: readonly ChartUnit[], seats: readonly ChartSeat[]): ChartNode[] {
  const nodes = new Map<string, ChartNode>(units.map((u) => [u.code, { ...u, positions: [], children: [], vacant: 0 }]));
  for (const s of seats) nodes.get(s.orgUnit)?.positions.push(s);
  const roots: ChartNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parent ? nodes.get(n.parent) : undefined;
    (parent && parent !== n ? parent.children : roots).push(n);
  }
  const finish = (n: ChartNode): number => {
    n.positions.sort((a, b) => rank(a.role) - rank(b.role) || a.title.localeCompare(b.title));
    n.children.sort((a, b) => a.code.localeCompare(b.code));
    n.vacant = n.positions.filter((p) => seatStatus(p) === "vacant").length + n.children.reduce((sum, c) => sum + finish(c), 0);
    return n.vacant;
  };
  roots.sort((a, b) => a.code.localeCompare(b.code)).forEach(finish);
  return roots;
}
