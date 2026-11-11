import type { ChartUnit } from "./org-chart";
import type { Role } from "./roles";

/**
 * The client's org chart document (Struktur Organisasi), read into units and seats. Each unit may name its head:
 * a name, null for a seat the document marks Vacant, or nothing when the document names no one. Names stay on the
 * seat until Admin links the person's account.
 */
export interface StructureFile {
  units: (Omit<ChartUnit, "parent"> & { parent: string | null; head?: string | null })[];
}

export interface StructureSeat {
  orgUnit: string;
  title: string;
  role: Role;
  holderName: string | null;
}

const TYPES = ["company", "division", "department", "unit"] as const;
const HEAD_ROLE: Record<ChartUnit["type"], Role> = { company: "director", division: "division_owner", department: "default_owner", unit: "requestor" };

/** What loading the file changes: units to upsert in parent order, seats to add, and existing empty seats to name. */
export function planStructure(
  file: StructureFile,
  existing: { units: readonly string[]; seats: readonly { id: string; orgUnit: string; role: Role; holder: string | null; holderName: string | null }[] },
): { units: ChartUnit[]; create: StructureSeat[]; name: { id: string; holderName: string }[]; problems: string[] } {
  const problems: string[] = [];
  const known = new Set(existing.units);
  const pending = file.units.filter((u) => {
    if (TYPES.includes(u.type)) return true;
    problems.push(`${u.code}: jenis ${u.type} tidak dikenal`);
    return false;
  });

  // Parents first, so each insert finds its parent.
  const units: StructureFile["units"] = [];
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    for (const u of [...pending]) {
      if (!u.parent || known.has(u.parent)) {
        units.push(u);
        known.add(u.code);
        pending.splice(pending.indexOf(u), 1);
        progress = true;
      }
    }
  }
  for (const u of pending) problems.push(`${u.code}: induk ${u.parent} tidak ditemukan`);

  const create: StructureSeat[] = [];
  const name: { id: string; holderName: string }[] = [];
  for (const u of units) {
    if (u.head === undefined) continue;
    const role = HEAD_ROLE[u.type];
    const seat = existing.seats.find((s) => s.orgUnit === u.code && s.role === role);
    if (!seat) create.push({ orgUnit: u.code, title: u.type === "unit" ? u.name : `Kepala ${u.name}`, role, holderName: u.head });
    else if (!seat.holder && u.head && seat.holderName !== u.head) name.push({ id: seat.id, holderName: u.head });
  }
  return { units: units.map(({ head: _head, ...u }) => u), create, name, problems };
}
