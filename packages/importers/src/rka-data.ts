import { formatIdr, headcountFromMonths, sum, ZERO, type Category, type HeadcountRow, type Money } from "@estrada/domain";
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
  rka2026: Money | null;
  actual2026: Money | null;
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
export const RKA_DATA_COLUMNS = ["No", "Sumber Sheet", "Baris Sumber", "COA Code", "COA Name", "Category", "Requestor (Unit)", "Divisi Requestor", "Budget Owner (Unit)", "Divisi Budget Owner", "Lintas Divisi", "Entitas", "Dasar Entitas", "Keterangan / Item", "Qty (Org)", "RKA 2026", "Actual 2026", ...MONTHS, "Total RKA 2027", "Basis / Assumption", "Notes", "Flag Cleaning"] as const;
/** Columns the importer needs; the derived Divisi and Dasar Entitas columns are optional. */
const COLS = RKA_DATA_COLUMNS.filter((c) => !["Divisi Requestor", "Divisi Budget Owner", "Dasar Entitas"].includes(c));

/** Sheet "RKA 2027 Data": the workbook's own clean list of every budget line. Rows it cannot place are reported, never guessed. */
export function parseRkaData(rows: Cell[][], units: readonly UnitAlias[]): { lines: ImportedLine[]; problems: ImportProblem[] } {
  const h = header(rows, COLS);
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

    const months = MONTHS.map((m) => amount(r[h.col(m)]) ?? ZERO);
    const flags = text(r[h.col("Flag Cleaning")]).split(";").map((f) => f.trim()).filter(Boolean);
    const typed = amount(r[h.col("Total RKA 2027")]);
    if (typed && !typed.minus(sum(months)).abs().lte(0.01)) {
      flags.push(`Total diketik ${formatIdr(typed)} tidak sama dengan jumlah bulan`);
    }
    const qty = text(r[h.col("Qty (Org)")]);
    const notes = [text(r[h.col("Notes")]), qty ? `Qty ${qty} org` : ""].filter(Boolean).join(" · ");
    const item = text(r[h.col("Keterangan / Item")]) || null;
    const heads = Number(qty);
    const headcount = item && qty && Number.isInteger(heads) ? headcountFromMonths(item, heads, months) : null;
    const sourceRow = Number(text(r[h.col("Baris Sumber")]));

    lines.push({
      ref: { no, sheet: text(r[h.col("Sumber Sheet")]), row: Number.isFinite(sourceRow) && sourceRow > 0 ? sourceRow : null },
      coaCode,
      coaName: text(r[h.col("COA Name")]),
      category: cat,
      requestorUnit,
      ownerUnit,
      crossDivision: text(r[h.col("Lintas Divisi")]).toLowerCase() === "ya",
      entity,
      item,
      rka2026: amount(r[h.col("RKA 2026")]),
      actual2026: amount(r[h.col("Actual 2026")]),
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
