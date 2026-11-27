import type { Category } from "@estrada/domain";
import { header, text, type Cell } from "./cells";
import { centerOf, unitResolver, type UnitAlias } from "./units";

export interface StructuredCoa {
  code: string;
  name: string;
  level: number;
  parentCode: string | null;
  /** As the sheet writes it: Current Asset, Operating Expense, Contra Asset, … */
  accountType: string;
  normalBalance: "debit" | "credit" | null;
  statement: "income_statement" | "balance_sheet";
  /** Parent accounts are FALSE: only leaves take postings. */
  postable: boolean;
  /** Takes a segment suffix -S1..-S4. */
  segmented: boolean;
  note: string | null;
  category: Category;
  center: "revenue" | "cost";
  requestorUnits: string[];
  ownerUnits: string[];
  defaultOwnerUnit: string | null;
}

export interface CoaSegment {
  code: string;
  name: string;
  description: string | null;
}

const COLS = ["account_code", "account_name", "level", "parent_code", "account_type", "normal_balance", "statement", "is_postable", "is_segmented", "note", "requestor", "budget_owner", "rka_category"] as const;

const RKA: Record<string, Category> = { REVENUE: "Revenue", COGS: "COGS", OPEX: "OPEX", OTHERS: "OTHERS", CAPEX: "CAPEX", TAX: "TAX" };
const BALANCE = new Set(["ASSET", "CURRENT ASSET", "CONTRA ASSET", "LIABILITY", "CURRENT LIABILITY", "NON-CURRENT LIABILITY", "EQUITY"]);
const STATEMENT = { "income statement": "income_statement", "balance sheet": "balance_sheet" } as const;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function bool(code: string, column: string, v: string): boolean {
  const s = v.toUpperCase();
  if (s === "TRUE") return true;
  if (s === "FALSE") return false;
  throw new Error(`COA ${code}: ${column} "${v}" bukan TRUE/FALSE`);
}

/** Sheet "COA Structured RKA 2027": the full ledger tree, plus the segment legend beside it. Nothing is guessed. */
export function parseCoaStructured(rows: Cell[][], units: readonly UnitAlias[]): { accounts: StructuredCoa[]; segments: CoaSegment[] } {
  const h = header(rows, COLS);
  const names = rows[h.row]!.map(text);
  const seg = { code: names.indexOf("segment_code"), name: names.indexOf("segment_name"), description: names.indexOf("description") };
  const unit = unitResolver(units);
  const accounts: StructuredCoa[] = [];
  const segments: CoaSegment[] = [];

  for (const r of rows.slice(h.row + 1)) {
    const get = (c: (typeof COLS)[number]) => text(r[h.col(c)]);
    if (seg.code >= 0 && text(r[seg.code])) {
      segments.push({ code: text(r[seg.code]), name: squash(text(r[seg.name])), description: squash(text(r[seg.description])) || null });
    }
    const code = get("account_code");
    if (!code) continue;

    const rka = get("rka_category").toUpperCase();
    const category = RKA[rka] ?? (BALANCE.has(rka) ? "BALANCE_SHEET" : null);
    if (!category) throw new Error(`COA ${code}: rka_category "${get("rka_category")}" tidak dikenal`);

    const statement = STATEMENT[get("statement").toLowerCase() as keyof typeof STATEMENT];
    if (!statement) throw new Error(`COA ${code}: statement "${get("statement")}" tidak dikenal`);

    const balance = get("normal_balance").toLowerCase();
    if (balance && balance !== "debit" && balance !== "credit") throw new Error(`COA ${code}: normal_balance "${get("normal_balance")}" tidak dikenal`);

    const level = Number(get("level"));
    if (!Number.isInteger(level) || level < 1) throw new Error(`COA ${code}: level "${get("level")}" tidak valid`);

    const unitsOf = (column: "requestor" | "budget_owner") =>
      get(column)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const u = unit(s);
          if (!u) throw new Error(`COA ${code}: unit ${column} "${s}" tidak dikenal`);
          return u;
        });
    const ownerUnits = unitsOf("budget_owner");

    accounts.push({
      code,
      name: get("account_name"),
      level,
      parentCode: get("parent_code") || null,
      accountType: get("account_type"),
      normalBalance: (balance || null) as StructuredCoa["normalBalance"],
      statement,
      postable: bool(code, "is_postable", get("is_postable")),
      segmented: bool(code, "is_segmented", get("is_segmented")),
      note: get("note") || null,
      category,
      center: centerOf(category),
      requestorUnits: unitsOf("requestor"),
      ownerUnits,
      defaultOwnerUnit: ownerUnits[0] ?? null,
    });
  }

  const codes = new Set<string>();
  for (const a of accounts) {
    if (codes.has(a.code)) throw new Error(`COA ${a.code}: kode muncul dua kali`);
    codes.add(a.code);
  }
  for (const a of accounts) {
    if (a.parentCode && !codes.has(a.parentCode)) throw new Error(`COA ${a.code}: induk ${a.parentCode} tidak ada di file`);
  }
  return { accounts, segments };
}

/** Codes the structured COA does not list: unused ones can go; ones records still point at are retired until Finance moves them. */
export function codesOutsideFile(existing: readonly string[], file: readonly string[], used: ReadonlySet<string>): { remove: string[]; retire: string[] } {
  const listed = new Set(file);
  const outside = existing.filter((c) => !listed.has(c)).sort();
  return { remove: outside.filter((c) => !used.has(c)), retire: outside.filter((c) => used.has(c)) };
}
