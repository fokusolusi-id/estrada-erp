import { REPORT_PERIOD_LABEL, STATEMENT_LABEL, can } from "@estrada/domain";
import { writeSheets } from "@estrada/importers";
import { loadPnlReport } from "@/lib/pnl-report";
import { requireUser } from "@/lib/session";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";

/** The profit and loss as an Excel workbook, for the same period and companies as the screen. */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!can(user.actor, "closing.view", null, await loadOrg())) return new Response("Not found", { status: 404 });
  const r = await loadPnlReport(user.actor, Object.fromEntries(new URL(request.url).searchParams), (await activeView()).entity);
  const title = `Laba Rugi ${r.bulan} (${REPORT_PERIOD_LABEL[r.period]}) · ${r.entities.join(", ")}${r.entities.length > 1 && r.eliminate ? " · sesudah eliminasi" : ""}`;
  const body = await writeSheets(title, [
    { name: "Laba Rugi", columns: ["Pos", "Realisasi", "RKA", "Selisih"], rows: r.rows.map((x) => [STATEMENT_LABEL[x.key], x.actual, x.budget, x.variance]) },
    {
      name: "Per Akun",
      columns: ["Pos", "Akun", "Nama akun", "Realisasi", "RKA", "Selisih"],
      rows: r.rows.flatMap((x) => x.accounts.map((a) => [STATEMENT_LABEL[x.key], a.coaCode, a.name, a.actual, a.budget, a.variance])),
    },
  ]);
  const filename = `Laba Rugi ${r.bulan}.xlsx`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
