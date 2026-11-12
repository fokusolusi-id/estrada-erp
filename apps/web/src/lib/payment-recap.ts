import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { money, paymentRecap, recapPeriod, type Actor } from "@estrada/domain";
import { activeView } from "./view-filter";
import { todayJakarta } from "./payment";
import { loadOrg } from "./workflow";

export interface RecapParams {
  per?: string;
  dari?: string;
  sampai?: string;
  bank?: string;
}

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAY = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const groupLabel = (key: string) => (key.length === 7 ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : DAY.format(new Date(`${key}T00:00:00Z`)));

/**
 * Rekap Pembayaran: paid requests in a period, per day or per month, within the viewer's entities and the header's
 * Entitas/Divisi, optionally for one bank asal.
 */
export async function loadRecap(actor: Actor, params: RecapParams) {
  const by = params.per === "bulan" ? "month" : "day";
  const period = recapPeriod(by, params.dari, params.sampai, todayJakarta());
  const [view, org, banks] = await Promise.all([activeView(), loadOrg(), db.select().from(schema.companyBankAccount).orderBy(asc(schema.companyBankAccount.bankName))]);
  const covers = (e: string) => actor.entities.includes("*") || actor.entities.includes(e);
  const bankId = banks.some((b) => b.id === params.bank) ? params.bank! : null;

  const rows = await db
    .select()
    .from(schema.paymentRequest)
    .where(and(eq(schema.paymentRequest.state, "paid"), gte(schema.paymentRequest.paidOn, period.from), lte(schema.paymentRequest.paidOn, period.to)));
  const bankLabel = new Map(banks.map((b) => [b.id, `${b.bankName} ${b.accountNumber}`]));
  const paid = rows
    .filter((r) => covers(r.entityCode))
    .filter((r) => !view.entity || r.entityCode === view.entity)
    .filter((r) => !view.division || org.divisionOf(r.requesterUnit) === view.division)
    .filter((r) => !bankId || r.bankAccountId === bankId)
    .map((r) => ({
      id: r.id,
      number: r.number ?? "",
      entity: r.entityCode,
      paidOn: r.paidOn!,
      description: r.description,
      nett: money(r.gross).plus(money(r.ppn)).minus(money(r.pph)),
      bank: (r.bankAccountId && bankLabel.get(r.bankAccountId)) || "–",
    }))
    .sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.number.localeCompare(b.number));

  return {
    by,
    period,
    bankId,
    banks: banks.filter((b) => covers(b.entityCode)).map((b) => ({ id: b.id, label: `${b.bankName} ${b.accountNumber} · ${b.entityCode}` })),
    recap: paymentRecap(paid, by),
  };
}
