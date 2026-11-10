import type { Role } from "./roles";

export interface OrgUnitNode {
  code: string;
  parent: string | null;
  type?: "company" | "division" | "department" | "unit";
}

export class OrgTree {
  private readonly parentOf = new Map<string, string | null>();
  private readonly typeOf = new Map<string, OrgUnitNode["type"]>();

  constructor(units: readonly OrgUnitNode[]) {
    for (const u of units) {
      this.parentOf.set(u.code, u.parent);
      this.typeOf.set(u.code, u.type);
    }
  }

  /** The division a unit rolls up to (Kontribusi Divisi); the unit itself when no division is above it. */
  divisionOf(code: string): string {
    let cur: string | null = code;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      if (this.typeOf.get(cur) === "division") return cur;
      seen.add(cur);
      cur = this.parent(cur);
    }
    return code;
  }

  /** Every unit marked as a division, by code. */
  divisions(): string[] {
    return [...this.typeOf].filter(([, t]) => t === "division").map(([c]) => c).sort();
  }

  has(code: string): boolean {
    return this.parentOf.has(code);
  }

  parent(code: string): string | null {
    return this.parentOf.get(code) ?? null;
  }

  /** True when `code` is `ancestor` or sits anywhere below it. */
  isWithin(code: string, ancestor: string): boolean {
    let cur: string | null = code;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      if (cur === ancestor) return true;
      seen.add(cur);
      cur = this.parent(cur);
    }
    return false;
  }
}

export interface Position {
  orgUnit: string;
  role: Role;
  holder: string | null;
  /** Acting holder (pjs) when the head is vacant. */
  acting: string | null;
}

export interface Seat {
  /** Unit whose position answers for `role`; the owner unit itself when no position exists. */
  unit: string;
  exists: boolean;
  /** The holder, else the acting holder (pjs); null when vacant. */
  holder: string | null;
  acting: boolean;
}

/**
 * The position that acts for `role` on lines owned by `orgUnit`: the nearest unit up the tree that has
 * such a position. A vacant seat is reported, never escalated: Admin assigns a pjs to fill it.
 */
export function seatFor(orgUnit: string, role: Role, positions: readonly Position[], org: OrgTree): Seat {
  let unit: string | null = orgUnit;
  while (unit) {
    const here = positions.filter((p) => p.orgUnit === unit && p.role === role);
    if (here.length) {
      const held = here.find((p) => p.holder);
      if (held) return { unit, exists: true, holder: held.holder, acting: false };
      const acting = here.find((p) => p.acting);
      return { unit, exists: true, holder: acting?.acting ?? null, acting: !!acting };
    }
    unit = org.parent(unit);
  }
  return { unit: orgUnit, exists: false, holder: null, acting: false };
}
