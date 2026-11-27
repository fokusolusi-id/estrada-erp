import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema, type ReportContent } from "@estrada/db";
import {
  AGING_BUCKETS, AGING_LABEL, DEAL_STATUS_LABEL, DELIVERY_HEALTH_LABEL, LIFECYCLE_LABEL, STATEMENT_LABEL, ZERO, agingByCustomer, comparePnl, consolidatePnl, money, pipelineFunnel, sum,
  weeklyCashflow, type Money, type ReportKind,
} from "@estrada/domain";
import { loadCashYear } from "./cash-week";
import { MONTH_NAMES } from "./period";
import { loadActualPnl, loadBudgetPnl } from "./pnl";
import { loadPortfolio } from "./portfolio";
import { loadReceivables } from "./receivable";
import { loadObligo } from "./obligo";

const m = (v: Money) => ({ m: v.toFixed(2) });
const percent = (v: Money | null) => (v ? `${v.toString().replace(".", ",")}%` : "–");

/** The months of the period each company has closed. */
export async function closedMonths(entities: readonly string[], year: number) {
  const rows = await db
    .select({ entity: schema.fiscalPeriod.entityCode, month: schema.fiscalPeriod.month })
    .from(schema.fiscalPeriod)
    .where(and(eq(schema.fiscalPeriod.year, year), eq(schema.fiscalPeriod.status, "closed"), inArray(schema.fiscalPeriod.entityCode, [...entities])));
  return rows;
}

/** A report's tables from what the modules recorded: closed months come from their snapshots. */
export async function buildReport(kind: ReportKind, entities: string[], year: number, months: number[], today: string): Promise<ReportContent> {
  const end = months.at(-1)!;
  switch (kind) {
    case "pnl":
    case "variance": {
      const [actual, budget] = await Promise.all([loadActualPnl(entities, year, months), loadBudgetPnl(entities, year, months)]);
      const together = consolidatePnl(actual.companies, entities.length > 1);
      const rows = comparePnl(together.lines, budget.lines);
      const accounts = rows.flatMap((r) => r.accounts.map((a) => [STATEMENT_LABEL[r.key], a.coaCode, a.name, m(a.actual), m(a.budget), m(a.variance), percent(a.achieved)]));
      const columns = ["Pos", "Akun", "Nama akun", "Realisasi", "RKA", "Selisih", "Capaian"];
      if (kind === "variance") return { sheets: [{ name: "Per Akun", columns, rows: accounts }] };
      return {
        sheets: [
          { name: "Laba Rugi", columns: ["Pos", "Realisasi", "RKA", "Selisih"], rows: rows.map((r) => [STATEMENT_LABEL[r.key], m(r.actual), m(r.budget), m(r.variance)]) },
          { name: "Per Akun", columns, rows: accounts },
        ],
      };
    }
    case "balance": {
      const sheets = await db.select().from(schema.balanceSheet).where(and(eq(schema.balanceSheet.year, year), eq(schema.balanceSheet.month, end), inArray(schema.balanceSheet.entityCode, entities)));
      const fields = [["Aset lancar", "currentAssets"], ["Total aset", "totalAssets"], ["Liabilitas jangka pendek", "currentLiabilities"], ["Total liabilitas", "totalLiabilities"], ["Ekuitas", "equity"]] as const;
      const of = (e: string) => sheets.find((s) => s.entityCode === e);
      const complete = entities.every(of);
      return {
        sheets: [
          {
            name: "Neraca",
            columns: ["Pos", ...entities, ...(entities.length > 1 ? ["Jumlah (tanpa eliminasi)"] : [])],
            rows: fields.map(([label, f]) => [
              label,
              ...entities.map((e) => (of(e) ? m(money(of(e)![f])) : "belum diisi")),
              ...(entities.length > 1 ? [complete ? m(sum(entities.map((e) => money(of(e)![f])))) : "belum lengkap"] : []),
            ]),
          },
        ],
      };
    }
    case "cashflow": {
      const cash = await loadCashYear(year);
      return {
        sheets: [
          {
            name: "Arus Kas",
            columns: ["Bulan", "Saldo awal", "Masuk Direct", "Masuk Indirect", "Keluar", "Saldo akhir"],
            rows: months.map((month) => {
              const t = weeklyCashflow(cash.openings, cash.events, { year, month, entities }).total;
              return [MONTH_NAMES[month - 1]!, m(t.opening), m(t.inDirect), m(t.inIndirect), m(t.available.minus(t.ending)), m(t.ending)];
            }),
          },
        ],
      };
    }
    case "aging": {
      const { open } = await loadReceivables((e) => entities.includes(e));
      return {
        sheets: [
          {
            name: "Umur Piutang",
            columns: ["Customer", ...AGING_BUCKETS.map((b) => AGING_LABEL[b]), "Total"],
            rows: agingByCustomer(open, today).map((r) => [r.customer, ...AGING_BUCKETS.map((b) => m(r.buckets[b])), m(r.total)]),
          },
          { name: "Per Invoice", columns: ["Invoice", "PT", "Customer", "Proyek", "Jatuh tempo", "Sisa"], rows: open.map((i) => [i.number, i.entity, i.customer, i.project, i.dueOn, m(i.outstanding)]) },
        ],
      };
    }
    case "sales": {
      const deals = (await db.select().from(schema.pipelineDeal).where(eq(schema.pipelineDeal.fiscalYear, year))).filter((d) => entities.includes(d.entityCode));
      const funnel = pipelineFunnel(deals.map((d) => ({ status: d.status, value: d.value, probability: d.probability, createdOn: d.createdAt.toISOString().slice(0, 10) })), today);
      return {
        sheets: [
          { name: "Per Status", columns: ["Status", "Deal", "Nilai", "Tertimbang"], rows: funnel.map((f) => [DEAL_STATUS_LABEL[f.status], String(f.deals), m(f.value), m(f.weighted)]) },
          { name: "Per Deal", columns: ["PT", "Customer", "Proyek", "Status", "Nilai"], rows: deals.map((d) => [d.entityCode, d.customer, d.project, DEAL_STATUS_LABEL[d.status], m(money(d.value))]) },
        ],
      };
    }
    case "delivery": {
      const rows = await loadPortfolio(entities, today);
      return {
        sheets: [
          {
            name: "Implementasi",
            columns: ["PT", "Proyek", "Customer", "Status", "Kondisi", "Kontrak"],
            rows: rows.map((p) => [p.entity, p.name, p.customer, LIFECYCLE_LABEL[p.stage], p.health ? DELIVERY_HEALTH_LABEL[p.health] : "–", m(p.contract)]),
          },
        ],
      };
    }
    case "obligo": {
      const { facilities, drawings } = await loadObligo(today);
      const mine = drawings.filter((d) => entities.includes(d.entityCode) && d.owed.gt(ZERO));
      const shown = facilities.filter((f) => !f.entityCode || entities.includes(f.entityCode));
      return {
        sheets: [
          {
            name: "Fasilitas",
            columns: ["Bank", "Fasilitas", "PT", "Plafon", "Terpakai"],
            rows: shown.map((f) => [f.bankName, f.name, f.entityCode ?? "Grup", m(money(f.plafon)), m(sum(mine.filter((d) => d.facilityId === f.id).map((d) => d.owed)))]),
          },
          {
            name: "Penarikan",
            columns: ["PT", "Jenis", "Nomor", "Proyek", "Jatuh tempo", "Terpakai"],
            rows: mine.map((d) => [d.entityCode, d.kind === "bg" ? "Bank Garansi" : "Pinjaman", d.reference ?? d.underlying, d.project ?? "–", d.dueOn ?? "–", m(d.owed)]),
          },
        ],
      };
    }
  }
}
