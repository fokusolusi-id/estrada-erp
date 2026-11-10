import { formatIdr, headcountFromMonths, spreadEvenly, sum, ZERO, type Category, type HeadcountRow, type Money } from "@estrada/domain";
import { amount, header, text, type Cell } from "./cells";
import { centerOf, category, unitResolver, type UnitAlias } from "./units";
import type { ImportedCoa } from "./coa-master";

export interface ImportedLine {
  /** Where the line came from: the row number in "RKA 2027 Data" and its source division sheet. */
  ref: { no: number; sheet: string; row: number | null };
  coaCode: string;
  coaName: string;
  category: Category;
  requestorUnit: string;
  ownerUnit: string;
  crossDivision: boolean;
  entity: string;
  item: string | null;
  priorRka: Money | null;
  priorActual: Money | null;
  months: Money[];
  basis: string | null;
  notes: string | null;
  /** A recruitment row with a head count whose months the plan rebuilds to the rupiah; loaded as a plan position. */
  headcount: HeadcountRow | null;
  /** The workbook's "Flag Cleaning" notes plus anything the importer found; shown to reviewers. */
  flags: string[];
}

export interface ImportProblem {
  no: number;
  message: string;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
/** The full header of "RKA 2027 Data", in the workbook's order; the export writes exactly these. */
/** The data sheet's columns for a budget year: the comparison columns are the year before, the total is the year itself. */
export const rkaDataColumns = (year: number) =>
  [
    "No", "Sumber Sheet", "Baris Sumber", "COA Code", "COA Name", "Category", "Requestor (Unit)", "Divisi Requestor", "Budget Owner (Unit)",
    "Divisi Budget Owner", "Lintas Divisi", "Entitas", "Dasar Entitas", "Keterangan / Item", "Qty (Org)",
    `RKA ${year - 1}`, `Actual ${year - 1}`, ...MONTHS, `Total RKA ${year}`, "Basis / Assumption", "Notes", "Flag Cleaning",
  ] as const;
/** The workbook this importer was built on. */
export const RKA_DATA_COLUMNS = rkaDataColumns(2027);
/** Columns the importer needs; the derived Divisi and Dasar Entitas columns are optional. */
const required = (year: number) => rkaDataColumns(year).filter((c) => !["Divisi Requestor", "Divisi Budget Owner", "Dasar Entitas"].includes(c));

/** The budget year a data sheet is for, read from its "Total RKA YYYY" header. */
function sheetYear(rows: Cell[][]): number {
  for (const r of rows) for (const c of r) {
    const m = /^Total RKA (\d{4})$/.exec(text(c));
    if (m) return Number(m[1]);
  }
  return 2027;
}

/** Sheet "RKA 2027 Data": the workbook's own clean list of every budget line. Rows it cannot place are reported, never guessed. */
/** The "Total RKA 2027" a source sheet row holds; the data sheet only sums that row's months, so a total typed without them is lost there. */
export type SourceTotal = (sheet: string, row: number) => Money | null;

export function parseRkaData(
  rows: Cell[][],
  units: readonly UnitAlias[],
  sourceTotal: SourceTotal = () => null,
): { lines: ImportedLine[]; problems: ImportProblem[] } {
  const year = sheetYear(rows);
  const h = header(rows, required(year));
  const unit = unitResolver(units);
  const lines: ImportedLine[] = [];
  const problems: ImportProblem[] = [];

  for (const r of rows.slice(h.row + 1)) {
    const coaCode = text(r[h.col("COA Code")]);
    if (!coaCode) continue;
    const no = Number(text(r[h.col("No")])) || 0;
    const fail = (message: string) => problems.push({ no, message });

    const req = text(r[h.col("Requestor (Unit)")]);
    const own = text(r[h.col("Budget Owner (Unit)")]);
    const requestorUnit = unit(req);
    const ownerUnit = unit(own);
    const cat = category(text(r[h.col("Category")]));
    const entity = text(r[h.col("Entitas")]).toUpperCase();
    if (!requestorUnit) { fail(`Unit pengusul tidak dikenal: ${req}`); continue; }
    if (!ownerUnit) { fail(`Unit pemilik anggaran tidak dikenal: ${own}`); continue; }
    if (!cat) { fail(`Kategori tidak dikenal: ${text(r[h.col("Category")])}`); continue; }
    if (!entity) { fail("Entitas kosong"); continue; }

    let months = MONTHS.map((m) => amount(r[h.col(m)]) ?? ZERO);
    const flags = text(r[h.col("Flag Cleaning")]).split(";").map((f) => f.trim()).filter(Boolean);
    const sourceRow = Number(text(r[h.col("Baris Sumber")]));
    const sheet = text(r[h.col("Sumber Sheet")]);
    let typed = amount(r[h.col(`Total RKA ${year}`)]);
    if (sum(months).isZero() && (!typed || typed.isZero()) && sheet && sourceRow > 0) typed = sourceTotal(sheet, sourceRow);
    if (typed && !typed.isZero() && sum(months).isZero()) {
      // A total typed without months is spread evenly; the owner can still change any month (client decision).
      months = spreadEvenly(typed);
      flags.push(`Total ${formatIdr(typed)} tanpa rincian bulan, dibagi rata Jan–Des`);
    } else if (typed && !typed.minus(sum(months)).abs().lte(0.01)) {
      flags.push(`Total diketik ${formatIdr(typed)} tidak sama dengan jumlah bulan`);
    }
    const qty = text(r[h.col("Qty (Org)")]);
    const notes = [text(r[h.col("Notes")]), qty ? `Qty ${qty} org` : ""].filter(Boolean).join(" · ");
    const item = text(r[h.col("Keterangan / Item")]) || null;
    const heads = Number(qty);
    const headcount = item && qty && Number.isInteger(heads) ? headcountFromMonths(item, heads, months) : null;

    lines.push({
      ref: { no, sheet, row: Number.isFinite(sourceRow) && sourceRow > 0 ? sourceRow : null },
      coaCode,
      coaName: text(r[h.col("COA Name")]),
      category: cat,
      requestorUnit,
      ownerUnit,
      crossDivision: text(r[h.col("Lintas Divisi")]).toLowerCase() === "ya",
      entity,
      item,
      priorRka: amount(r[h.col(`RKA ${year - 1}`)]),
      priorActual: amount(r[h.col(`Actual ${year - 1}`)]),
      months,
      basis: text(r[h.col("Basis / Assumption")]) || null,
      notes: notes || null,
      headcount,
      flags,
    });
  }
  return { lines, problems };
}

/** Codes the lines use that COA Master lacks: added as provisional accounts for Finance to confirm or remap. */
export function provisionalAccounts(lines: readonly ImportedLine[], accounts: readonly ImportedCoa[]): ImportedCoa[] {
  const known = new Set(accounts.map((a) => a.code));
  const out = new Map<string, ImportedCoa>();
  for (const l of lines) {
    if (known.has(l.coaCode) || out.has(l.coaCode)) continue;
    out.set(l.coaCode, {
      code: l.coaCode,
      name: l.coaName,
      category: l.category,
      center: centerOf(l.category),
      defaultOwnerUnit: l.ownerUnit,
      active: true,
      guidance: "Belum ada di COA Master. Perlu keputusan Finance.",
      examples: null,
      provisional: true,
    });
  }
  return [...out.values()];
}
