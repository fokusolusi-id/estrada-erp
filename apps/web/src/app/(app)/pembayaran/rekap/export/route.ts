import { can } from "@estrada/domain";
import { writePaymentRecap } from "@estrada/importers";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { groupLabel, loadRecap } from "@/lib/payment-recap";
import { formatDate } from "@/lib/payment";

/** The Rekap Pembayaran as an Excel workbook, with the same period, bank and header view as the screen. */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!can(user.actor, "payment.report", null, await loadOrg())) return new Response("Not found", { status: 404 });
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { by, period, recap } = await loadRecap(user.actor, params);
  const per = by === "month" ? "bulan" : "hari";

  const body = await writePaymentRecap({
    title: `Rekap Pembayaran per ${per}, ${formatDate(period.from)} – ${formatDate(period.to)}`,
    groups: recap.groups.map((g) => ({ label: groupLabel(g.key), rows: g.rows, total: g.total })),
    byBank: recap.byBank,
    total: recap.total,
  });
  const filename = `Rekap Pembayaran ${period.from} sd ${period.to}.xlsx`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
