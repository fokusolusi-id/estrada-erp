import { sum, ZERO, type Money } from "./money";

export type Category = "Revenue" | "COGS" | "OPEX" | "OTHERS" | "CAPEX";

export interface CoaAccount {
  code: string;
  category: Category;
  status: "active" | "inactive";
}

export interface BudgetLine {
  id: string;
  coaCode: string;
  entity: string;
  requestorUnit: string;
  ownerUnit: string;
  /** Exactly 12 amounts, Jan..Dec */
  months: Money[];
  basis?: string;
  notes?: string;
  project?: string;
}

export interface ValidationError {
  field: keyof BudgetLine;
  code:
    | "months_length"
    | "negative_amount"
    | "coa_unknown"
    | "coa_inactive"
    | "entity_unknown"
    | "basis_required";
}

export interface ValidationContext {
  coa: ReadonlyMap<string, CoaAccount>;
  entities: ReadonlySet<string>;
  /** Lines whose annual total reaches this amount must state a basis. */
  materialThreshold?: Money;
}

export function lineTotal(line: Pick<BudgetLine, "months">): Money {
  return sum(line.months);
}

export function validateLine(line: BudgetLine, ctx: ValidationContext): ValidationError[] {
  const errors: ValidationError[] = [];
  if (line.months.length !== 12) errors.push({ field: "months", code: "months_length" });
  if (line.months.some((m) => m.isNegative())) errors.push({ field: "months", code: "negative_amount" });

  const account = ctx.coa.get(line.coaCode);
  if (!account) errors.push({ field: "coaCode", code: "coa_unknown" });
  else if (account.status !== "active") errors.push({ field: "coaCode", code: "coa_inactive" });

  if (!ctx.entities.has(line.entity)) errors.push({ field: "entity", code: "entity_unknown" });

  if (ctx.materialThreshold && !line.basis?.trim() && lineTotal(line).gte(ctx.materialThreshold)) {
    errors.push({ field: "basis", code: "basis_required" });
  }
  return errors;
}

export interface Summary {
  months: Money[];
  total: Money;
  lines: number;
}

/** Group lines by any key (category, division, entity) — every workbook report is one of these. */
export function summarize<K>(lines: readonly BudgetLine[], keyOf: (l: BudgetLine) => K): Map<K, Summary> {
  const out = new Map<K, Summary>();
  for (const line of lines) {
    const key = keyOf(line);
    const acc = out.get(key) ?? { months: Array.from({ length: 12 }, () => ZERO), total: ZERO, lines: 0 };
    acc.months = acc.months.map((m, i) => m.plus(line.months[i] ?? ZERO));
    acc.total = acc.total.plus(lineTotal(line));
    acc.lines += 1;
    out.set(key, acc);
  }
  return out;
}
