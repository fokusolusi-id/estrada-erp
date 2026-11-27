import { can } from "@estrada/domain";
import { auditTime, loadAudit, readFilter } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

const MOST = 10_000;

/** The filtered audit log as CSV (SCR-AUD-01 Export), newest first, up to 10.000 rows. */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!can(user.actor, "audit.view", null, await loadOrg())) return new Response("Tidak berwenang", { status: 403 });
  const params = new URL(request.url).searchParams;
  const { rows } = await loadAudit(readFilter((k) => params.get(k) ?? undefined), MOST, 0);
  const csv = toCsv([
    ["Waktu (WIB)", "User", "Kode", "Modul", "Tingkat", "Hasil", "Aksi", "Objek", "IP", "Sebelum", "Sesudah"],
    ...rows.map((r) => [auditTime.format(r.at), r.user, r.code, r.module, r.severity, r.result, r.action, r.object, r.ip ?? "", r.before ? JSON.stringify(r.before) : "", r.after ? JSON.stringify(r.after) : ""]),
  ]);
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="audit-log.csv"' } });
}
