/** Early warning: the fifteen rules, who hears of them and when silence escalates (plan D5; sheet P3_Module_Spec, P3-M4). */
import { isCfo } from "./home";
import { formatIdr, type Money } from "./money";
import type { OrgTree } from "./org";
import type { Actor } from "./policy";
import type { Role } from "./roles";

export type Severity = "critical" | "high" | "medium" | "low";
export const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
/** Days to acknowledge before level 1; twice that before level 2 (client decision; no sheet gives them). */
export const ACK_DAYS: Record<Severity, number> = { critical: 1, high: 2, medium: 3, low: 7 };

type Owner = "cfo" | "ceo" | "treasury" | "sales" | "pmo" | "division" | "hcm";

export interface EwRule {
  code: string;
  name: string;
  severity: Severity;
  owners: readonly Owner[];
  /** The sheet sends this one by email; every alert also shows in the app. */
  email: boolean;
  action: string;
  link: string;
}

const rule = (n: number, name: string, severity: Severity, owners: Owner[], email: boolean, link: string, action: string): EwRule => ({ code: `EW-${String(n).padStart(2, "0")}`, name, severity, owners, email, link, action });

export const EW_RULES: readonly EwRule[] = [
  rule(1, "Cash buffer di bawah Rp 20 M atau runway di bawah 2 bulan", "critical", ["cfo"], true, "/cash/mingguan", "Amankan pendanaan dan percepat penagihan."),
  rule(2, "Utilisasi obligo di atas 80% plafon", "critical", ["cfo", "treasury"], true, "/obligo", "Tahan penarikan baru dan siapkan pelunasan."),
  rule(3, "Pendapatan triwulan di bawah target lebih dari 25%", "high", ["ceo", "sales"], true, "/kpi", "Tinjau pipeline dan percepat penagihan termin."),
  rule(4, "Piutang di atas 90 hari lebih dari 10%", "high", ["cfo"], true, "/piutang", "Fokuskan penagihan piutang tertua."),
  rule(5, "DSO di atas 60 hari tiga bulan berturut-turut", "medium", ["cfo"], false, "/piutang", "Perketat termin dan tindak lanjut tagihan."),
  rule(6, "Pipeline coverage di bawah 2x sisa target", "high", ["sales"], true, "/pipeline", "Tambah peluang baru."),
  rule(7, "Margin proyek di bawah 50% margin kontrak", "high", ["pmo"], true, "/portofolio", "Tinjau biaya proyek."),
  rule(8, "Realisasi divisi di atas 110% budget berjalan", "medium", ["division", "cfo"], false, "/rka/monitor", "Tahan belanja yang bisa ditunda."),
  rule(9, "Cost center melebihi RKA lebih dari 15%", "medium", ["division"], false, "/rka/variance", "Isi analisis varians dan koreksi belanja."),
  rule(10, "Konversi sales di bawah 50% target", "medium", ["sales"], false, "/pipeline", "Tinjau kualitas peluang."),
  rule(11, "Invoice lewat jatuh tempo 30 hari bernilai di atas Rp 5 M", "high", ["cfo"], true, "/piutang", "Eskalasi penagihan ke customer."),
  rule(12, "Interest coverage di bawah 3x", "critical", ["cfo"], true, "/pnl", "Kendalikan beban bunga dan jaga EBIT."),
  rule(13, "DER di atas 1,5x", "high", ["cfo"], true, "/closing", "Tinjau struktur utang."),
  rule(14, "Net margin tiga bulan di bawah 5%", "high", ["cfo", "ceo"], true, "/pnl", "Tinjau harga dan biaya."),
  rule(15, "Headcount selisih lebih dari 10% dari rencana", "low", ["hcm"], false, "/", "Sesuaikan rencana rekrutmen."),
];
export const ewRule = (code: string) => EW_RULES.find((r) => r.code === code);

type Spend = { unit: string; actual: Money; budget: Money };
export interface EwFigures {
  cash: { ending: Money; runwayMonths: Money | null } | null;
  obligo: { used: Money; plafon: Money };
  /** The running quarter's revenue against its phased target. */
  quarterRevenue: { actual: Money; target: Money } | null;
  receivable: { over90: Money; total: Money; overdue30: Money };
  /** Days sales outstanding at the last three month ends, null where there were no sales. */
  dso: (Money | null)[];
  pipeline: { open: Money; remaining: Money } | null;
  interest: { ebit: Money; expense: Money };
  balance: { liabilities: Money; equity: Money } | null;
  rolling: { net: Money; revenue: Money };
  headcount: { actual: number; plan: number };
  divisions: Spend[];
  units: Spend[];
}

export interface EwResult {
  code: string;
  /** The division or unit, for rules judged per one. */
  subject: string;
  /** null when there is nothing to judge. */
  fired: boolean | null;
  detail: string;
}

const num = (v: Money) => v.toDecimalPlaces(1).toString().replace(".", ",");
const rp = (v: Money) => formatIdr(v, { unit: "juta", decimals: 1 });
const BILLION = 1_000_000_000;

export function evaluateRules(f: EwFigures): EwResult[] {
  const out: EwResult[] = [];
  const add = (code: string, verdict: [boolean, string] | null, subject = "") => out.push({ code, subject, fired: verdict ? verdict[0] : null, detail: verdict ? verdict[1] : "Belum ada data" });
  const ratio = (a: Money, b: Money, scale = 1) => (b.gt(0) ? a.times(scale).div(b) : null);
  const judge = (v: Money | null, test: (v: Money) => boolean, text: (v: Money) => string): [boolean, string] | null => (v ? [test(v), text(v)] : null);

  add("EW-01", f.cash ? [f.cash.ending.lt(20 * BILLION) || !!f.cash.runwayMonths?.lt(2), `Saldo ${rp(f.cash.ending)}${f.cash.runwayMonths ? `, runway ${num(f.cash.runwayMonths)} bulan` : ""}`] : null);
  add("EW-02", judge(ratio(f.obligo.used, f.obligo.plafon, 100), (v) => v.gt(80), (v) => `Terpakai ${num(v)}% dari plafon`));
  add("EW-03", f.quarterRevenue ? judge(ratio(f.quarterRevenue.actual, f.quarterRevenue.target, 100), (v) => v.lt(75), (v) => `Capaian ${num(v)}% dari target triwulan`) : null);
  add("EW-04", judge(ratio(f.receivable.over90, f.receivable.total, 100), (v) => v.gt(10), (v) => `${num(v)}% piutang di atas 90 hari`));
  const dso = f.dso.filter((v): v is Money => !!v);
  add("EW-05", dso.length === 3 ? [dso.every((v) => v.gt(60)), `DSO ${dso.map(num).join(", ")} hari`] : null);
  add("EW-06", f.pipeline ? judge(ratio(f.pipeline.open, f.pipeline.remaining), (v) => v.lt(2), (v) => `Coverage ${num(v)}x`) : null);
  // No contract margin and no conversion target are recorded anywhere yet.
  add("EW-07", null);
  for (const [code, list, limit] of [["EW-08", f.divisions, 110], ["EW-09", f.units, 115]] as const) {
    for (const s of list) {
      const v = ratio(s.actual, s.budget, 100);
      if (v) add(code, [v.gt(limit), `${s.unit}: ${num(v)}% dari budget berjalan`], s.unit);
    }
  }
  add("EW-10", null);
  add("EW-11", [f.receivable.overdue30.gt(5 * BILLION), `${rp(f.receivable.overdue30)} lewat 30 hari`]);
  add("EW-12", judge(ratio(f.interest.ebit, f.interest.expense), (v) => v.lt(3), (v) => `EBIT ${num(v)}x beban bunga`));
  add("EW-13", f.balance ? (f.balance.equity.gt(0) ? judge(ratio(f.balance.liabilities, f.balance.equity), (v) => v.gt("1.5"), (v) => `DER ${num(v)}x`) : [true, "Ekuitas nol atau negatif"]) : null);
  add("EW-14", judge(ratio(f.rolling.net, f.rolling.revenue, 100), (v) => v.lt(5), (v) => `Net margin ${num(v)}%`));
  const { actual, plan } = f.headcount;
  add("EW-15", plan > 0 ? [Math.abs(actual - plan) * 10 > plan, `${actual} orang dari rencana ${plan}`] : null);
  return out.sort((a, b) => a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject));
}

const DAY = 86_400_000;
export function escalationLevel(severity: Severity, firedOn: string, today: string): 0 | 1 | 2 {
  const days = Math.round((Date.parse(today) - Date.parse(firedOn)) / DAY);
  return days >= ACK_DAYS[severity] * 2 ? 2 : days >= ACK_DAYS[severity] ? 1 : 0;
}

export interface AlertSeat {
  occupant: string | null;
  orgUnit: string;
  role: Role;
  entities: readonly string[];
}

const HEADS: readonly Role[] = ["division_owner", "default_owner"];

function holders(owner: Owner, subject: string, seats: readonly AlertSeat[], org: OrgTree): AlertSeat[] {
  const head = (unit: string) => seats.filter((s) => s.role === "division_owner" && org.isWithin(s.orgUnit, unit));
  switch (owner) {
    case "cfo":
      return head("FRM");
    case "ceo":
      return seats.filter((s) => s.role === "director" && s.entities.includes("*"));
    case "treasury":
      return seats.filter((s) => s.role === "cash_manager");
    case "sales":
      return head("BCD");
    case "pmo":
      return seats.filter((s) => HEADS.includes(s.role) && org.isWithin(s.orgUnit, "PMO"));
    case "hcm":
      return seats.filter((s) => HEADS.includes(s.role) && org.isWithin(s.orgUnit, "HCM"));
    case "division":
      return seats.filter((s) => s.role === "division_owner" && org.isWithin(subject, s.orgUnit));
  }
}

/** The people a new alert is assigned to; the CFO when none of the rule's seats is held. */
export function ruleRecipients(code: string, subject: string, seats: readonly AlertSeat[], org: OrgTree): string[] {
  const of = (owner: Owner) => holders(owner, subject, seats, org).flatMap((s) => (s.occupant ? [s.occupant] : []));
  const ids = (ewRule(code)?.owners ?? []).flatMap(of);
  return [...new Set(ids.length ? ids : of("cfo"))];
}

/** Level 1 goes to the CFO, level 2 to the group Direktur. */
export const escalationTargets = (level: 1 | 2, seats: readonly AlertSeat[], org: OrgTree): string[] => [...new Set(holders(level === 1 ? "cfo" : "ceo", "", seats, org).flatMap((s) => (s.occupant ? [s.occupant] : [])))];

export const ALERT_STATUSES = ["open", "acknowledged", "resolved", "false_positive", "cleared"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];
export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = { open: "Terbuka", acknowledged: "Diterima", resolved: "Selesai", false_positive: "Salah alarm", cleared: "Pulih sendiri" };
/** A closed alert whose condition still holds opens again after this many days. */
export const REOPEN_DAYS = 7;

export type AlertAction = "ack" | "resolve" | "false_positive";
export function nextAlertStep(status: AlertStatus, action: AlertAction, note: string): { ok: true; to: AlertStatus } | { ok: false; problem: "closed" | "note" } {
  if (status !== "open" && !(status === "acknowledged" && action !== "ack")) return { ok: false, problem: "closed" };
  if (action !== "ack" && !note.trim()) return { ok: false, problem: "note" };
  return { ok: true, to: action === "ack" ? "acknowledged" : action === "resolve" ? "resolved" : "false_positive" };
}

/** Group figures are for the owners and for whoever oversees the whole group. */
export function canViewAlert(actor: Actor, alert: { assignees: readonly string[] }, org: OrgTree): boolean {
  if (alert.assignees.includes(actor.userId)) return true;
  const group = actor.entities.includes("*");
  return group && (actor.role === "finance" || actor.role === "director" || actor.role === "auditor" || isCfo(actor, org));
}

export function canActOnAlert(actor: Actor, alert: { assignees: readonly string[] }, org: OrgTree): boolean {
  return alert.assignees.includes(actor.userId) || (actor.entities.includes("*") && (actor.role === "director" || isCfo(actor, org)));
}

export const canRunCheck = (actor: Actor, org: OrgTree) => actor.entities.includes("*") && (actor.role === "finance" || isCfo(actor, org));
