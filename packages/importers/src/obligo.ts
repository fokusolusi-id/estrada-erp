import { amount, header, text, type Cell } from "./cells";

export interface ImportedBankFacility {
  bankName: string;
  name: string;
  entityCode: string | null;
  plafon: string;
  interestDay: number | null;
  drawings: { amount: string; underlying: string; dueOn: string | null; note: string | null }[];
}

/** The cut-off sheet 14 states its outstanding at. */
export const OBLIGO_CUTOFF = "2026-04-14";
/** Monthly interest dates, from sheet 10_Liabilities. */
const INTEREST_DAY: Record<string, number> = { Mandiri: 15, BRI: 25, BCA: 3 };
const ENTITY: Record<string, string | null> = { Estrada: "ESTRADA", Matrik: "MATRIK", "-": null };

function dateOf(c: Cell): string | null {
  const s = text(c);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Sheet "14_Obligo_Status_Apr2026": the table down to its first subtotal. The sheet names no type: all are KMK. */
export function parseObligo(rows: Cell[][]): ImportedBankFacility[] {
  const COLS = ["Bank", "Fasilitas", "Perusahaan", "Plafon (IDR)", "Outstanding (IDR)", "Underlying Projek", "Due Date", "Status Tagihan"] as const;
  const h = header(rows, COLS);
  const found: ImportedBankFacility[] = [];
  for (const r of rows.slice(h.row + 1)) {
    const get = (c: (typeof COLS)[number]) => text(r[h.col(c)]).replace(/\s+/g, " ").trim();
    const bankName = get("Bank");
    if (!bankName || /^(SUB-)?TOTAL/i.test(bankName)) break;
    const company = get("Perusahaan");
    if (!(company in ENTITY)) throw new Error(`Obligo ${bankName}: Perusahaan "${company}" tidak dikenal`);
    const [name, entityCode] = [get("Fasilitas"), ENTITY[company]!];
    let f = found.find((x) => x.bankName === bankName && x.name === name && x.entityCode === entityCode);
    if (!f) {
      const plafon = amount(r[h.col("Plafon (IDR)")]);
      if (!plafon) throw new Error(`Obligo ${bankName} ${name}: Plafon tidak terbaca`);
      found.push((f = { bankName, name, entityCode, plafon: plafon.toFixed(2), interestDay: INTEREST_DAY[bankName] ?? null, drawings: [] }));
    }
    const owed = amount(r[h.col("Outstanding (IDR)")]);
    if (owed?.gt(0)) {
      const note = get("Status Tagihan");
      f.drawings.push({ amount: owed.toFixed(2), underlying: get("Underlying Projek"), dueOn: dateOf(r[h.col("Due Date")]), note: note && note !== "-" ? note : null });
    }
  }
  return found;
}
