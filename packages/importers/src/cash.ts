import { money, ZERO, type CashSettings, type EntityOpening, type Money } from "@estrada/domain";
import { amount, text, type Cell } from "./cells";
import type { ImportedCoa } from "./coa-master";

export interface ImportedFacility {
  name: string;
  type: "existing" | "new";
  entity: string;
  /** Yearly, as a fraction (0.1). */
  rate: string;
  openingBalance: Money;
  limit: Money | null;
  project: string | null;
  notes: string | null;
  drawdown: Money[];
  repayment: Money[];
}

export interface ImportedCash {
  settings: CashSettings & { minimumCash: Money };
  /** Per entity, in the workbook's sheet order (ESTRADA first). */
  openings: Map<string, EntityOpening>;
  facilities: ImportedFacility[];
}

/** The assumption rows, found by the start of their label in column B; the value sits in column D. */
const LABEL = {
  cash: "saldo kas awal 1 jan",
  receivables: "piutang usaha awal",
  payables: "utang usaha vendor awal",
  collectionLag: "lag penagihan invoice",
  cogsPaymentLag: "lag pembayaran vendor",
  minimumCash: "saldo kas minimum (buffer)",
  taxRate: "tarif pph badan",
  priorYearTax: "utang pph ps. 29",
} as const;

function assumptions(rows: Cell[][]): Record<keyof typeof LABEL, Cell> {
  const out = {} as Record<keyof typeof LABEL, Cell>;
  for (const [key, label] of Object.entries(LABEL) as [keyof typeof LABEL, string][]) {
    const row = rows.find((r) => text(r[1]).toLowerCase().startsWith(label));
    if (!row) throw new Error(`Cash sheet: row "${label}" not found`);
    out[key] = row[3] ?? null;
  }
  return out;
}

const rupiah = (c: Cell) => amount(c) ?? ZERO;
const months = (r: Cell[] | undefined) => Array.from({ length: 12 }, (_, i) => (r ? rupiah(r[4 + i] ?? null) : ZERO));

/**
 * Forecast CF Bulanan {year} for the shared assumptions and the group's minimum cash, "CF {year} {ENTITY}" for each
 * entity's opening position, and Obligo Pinjaman Bank for the loans. Interest and depreciation COAs are named after
 * COA Master: the forecast replaces RKA interest with Obligo's and keeps depreciation out of cash.
 */
export function parseCash(
  sheets: { consolidated: Cell[][]; entities: [string, Cell[][]][]; obligo: Cell[][] | null },
  accounts: readonly Pick<ImportedCoa, "code" | "name">[],
): ImportedCash {
  const group = assumptions(sheets.consolidated);
  const named = (prefixes: string[]) => accounts.filter((a) => prefixes.some((p) => a.name.toLowerCase().startsWith(p))).map((a) => a.code);
  const settings = {
    collectionLag: Number(text(group.collectionLag)),
    cogsPaymentLag: Number(text(group.cogsPaymentLag)),
    taxRate: money(text(group.taxRate)).toFixed(),
    minimumCash: rupiah(group.minimumCash),
    interestCoa: named(["beban bunga pinjaman"]),
    nonCashCoa: named(["beban penyusutan", "beban amortisasi"]),
  };

  const openings = new Map<string, EntityOpening>();
  for (const [entity, rows] of sheets.entities) {
    const a = assumptions(rows);
    openings.set(entity, {
      cash: rupiah(a.cash),
      receivables: rupiah(a.receivables),
      payables: rupiah(a.payables),
      priorYearTax: rupiah(a.priorYearTax),
      minimumCash: rupiah(a.minimumCash),
    });
  }

  return { settings, openings, facilities: sheets.obligo ? facilities(sheets.obligo) : [] };
}

/** Section A lists the facilities; section C holds each one's drawdowns and repayments by month. */
function facilities(rows: Cell[][]): ImportedFacility[] {
  const head = rows.findIndex((r) => r.some((c) => text(c) === "Bank / Fasilitas"));
  if (head < 0) return [];
  const names = rows[head]!.map(text);
  const col = (n: string) => names.indexOf(n);
  const schedule = (name: string, component: string) => rows.find((r) => text(r[1]).replace(/^\d+\.\s*/, "") === name && text(r[2]) === component);

  const out: ImportedFacility[] = [];
  for (const r of rows.slice(head + 1)) {
    const name = text(r[col("Bank / Fasilitas")]);
    if (!name) break;
    const rate = amount(r[col("Suku Bunga p.a.")]);
    const openingBalance = rupiah(r[col("Saldo Awal 1 Jan 2027")] ?? null);
    const drawdown = months(schedule(name, "Penarikan Pokok"));
    const repayment = months(schedule(name, "Pelunasan Pokok"));
    // "Fasilitas Baru n" rows are placeholders until Finance fills them in.
    if (!rate && openingBalance.isZero() && [...drawdown, ...repayment].every((m) => m.isZero())) continue;
    out.push({
      name,
      type: text(r[col("Jenis")]).toLowerCase() === "baru" ? "new" : "existing",
      entity: (text(r[col("Entitas")]) || text(r[col("Entitas Manual (jika tanpa proyek)")])).toUpperCase(),
      rate: (rate ?? ZERO).toFixed(),
      openingBalance,
      limit: amount(r[col("Plafon")] ?? null),
      project: text(r[col("Proyek (Invoice 2027)")]) || null,
      notes: text(r[col("Keterangan")]) || null,
      drawdown,
      repayment,
    });
  }
  return out;
}
