import { DEAL_STATUSES, duplicateProjects, money, type DealInput, type DealStatus, type DealType, type Money } from "@estrada/domain";
import { amount, header, text, type Cell } from "./cells";
import type { ImportedCoa } from "./coa-master";
import type { ImportProblem } from "./rka-data";

export interface ImportedDeal extends DealInput {
  ref: { no: number };
}

const COLS = ["No", "Perusahaan/Entitas", "Customer", "End Customer", "Segmen", "Project Name", "COA", "Project Value (Exclude PPN)", "Status", "Probabilitas (%)", "Type Project", "Start", "End"] as const;

/** The sheet mixes Indonesian and English month names. */
const MONTH: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, agt: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12,
};

/** "250M" in the legend means Rp 250 miliar. */
function target(c: Cell): Money | null {
  const s = text(c).replace(/\s/g, "");
  const m = /^(\d+(?:[.,]\d+)?)M$/i.exec(s);
  if (m) return money(m[1]!.replace(",", ".")).times(1e9);
  return amount(c);
}

/**
 * The Pipeline sheet: one deal per numbered row, plus BCD's revenue target per segment in the legend beside it.
 * The weighted value is computed (value × probability), never read: the sheet's own column holds a stray subtotal.
 */
export function parsePipeline(
  rows: Cell[][],
  accounts: readonly Pick<ImportedCoa, "code" | "name" | "provisional">[],
): { deals: ImportedDeal[]; targets: { segment: string; target: Money }[]; problems: ImportProblem[]; warnings: ImportProblem[] } {
  const h = header(rows, COLS);
  const names = rows[h.row]!.map(text);
  const segmentCol = names.indexOf("SEGMEN");
  // Optional: the 2027 sheet has no lead time column yet.
  const leadCol = names.findIndex((n) => /^lead\s*time/i.test(n));
  const deals: ImportedDeal[] = [];
  const targets: { segment: string; target: Money }[] = [];
  const problems: ImportProblem[] = [];

  // COA Master codes first: a provisional code may carry the same name.
  const byName = [...accounts].sort((a, b) => Number(!!a.provisional) - Number(!!b.provisional));
  const coaOf = (name: string) => {
    const n = name.toLowerCase();
    return (byName.find((a) => a.name.toLowerCase() === n) ?? byName.find((a) => a.name.toLowerCase().startsWith(n)))?.code ?? null;
  };

  for (const r of rows.slice(h.row + 1)) {
    if (segmentCol >= 0) {
      const seg = text(r[segmentCol]);
      const t = seg ? target(r[segmentCol + 1] ?? null) : null;
      if (seg && t) targets.push({ segment: seg, target: t });
    }
    const no = Number(text(r[h.col("No")]));
    const project = text(r[h.col("Project Name")]);
    if (!Number.isInteger(no) || no <= 0 || !project) continue;
    const fail = (message: string) => problems.push({ no, message });

    const status = text(r[h.col("Status")]).toUpperCase();
    // CW (Closed Won) is set in the app with its Billing Termin, never imported.
    if (status === "CW" || !(DEAL_STATUSES as readonly string[]).includes(status)) { fail(`Status tidak dikenal: ${status}`); continue; }
    const typeText = text(r[h.col("Type Project")]).toLowerCase();
    if (typeText !== "new" && typeText !== "renewal") { fail(`Type Project tidak dikenal: ${text(r[h.col("Type Project")])}`); continue; }
    const start = MONTH[text(r[h.col("Start")]).toLowerCase().slice(0, 3)];
    const end = MONTH[text(r[h.col("End")]).toLowerCase().slice(0, 3)];
    if (!start || !end) { fail(`Bulan tidak dikenal: ${!start ? text(r[h.col("Start")]) : text(r[h.col("End")])}`); continue; }
    const value = amount(r[h.col("Project Value (Exclude PPN)")]);
    if (!value) { fail("Project Value kosong"); continue; }
    const p = amount(r[h.col("Probabilitas (%)")]);
    if (!p) { fail("Probabilitas kosong"); continue; }

    const lead = leadCol >= 0 ? amount(r[leadCol] ?? null) : null;
    const coaName = text(r[h.col("COA")]);
    const coaCode = coaName ? coaOf(coaName) : null;
    deals.push({
      ref: { no },
      entity: text(r[h.col("Perusahaan/Entitas")]).toUpperCase(),
      customer: text(r[h.col("Customer")]),
      endCustomer: text(r[h.col("End Customer")]) || null,
      segment: text(r[h.col("Segmen")]),
      project,
      coaCode,
      value: value.toFixed(),
      status: status as DealStatus,
      // Excel stores 90% as 0.9.
      probability: (p.lte(1) ? p.times(100) : p).toFixed(),
      type: typeText as DealType,
      startMonth: start,
      endMonth: end,
      notes: coaName && !coaCode ? `COA di workbook: ${coaName}` : null,
      leadTimeMonths: lead && lead.isInteger() && lead.gte(0) && lead.lte(24) ? lead.toNumber() : null,
    });
  }
  // Kontrol RKA: these load, but the app will not save the deal again until they are fixed.
  const warnings: ImportProblem[] = [
    ...deals.filter((d) => !d.coaCode).map((d) => ({ no: d.ref.no, message: "COA pendapatan belum dikenali; wajib diisi di aplikasi" })),
    ...duplicateProjects(deals).flatMap((g) => g.slice(1).map((d) => ({ no: d.ref.no, message: `Project Name sama dengan No ${g[0]!.ref.no} di entitas ${d.entity}; harus unik` }))),
  ];
  return { deals, targets, problems, warnings };
}
