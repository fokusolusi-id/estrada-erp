import { db, schema } from "@estrada/db";
import { writeRkaWorkbook } from "@estrada/importers";
import { PNL_LABEL } from "@/components/erp/pnl-table";
import { STATE_LABEL } from "@/components/erp/status-badge";
import { requireUser } from "@/lib/session";
import { loadSummary, SUMMARY_ROLES, type SummaryParams } from "@/lib/summary";

/** The Management Summary as an Excel workbook, with the same version, filters and scope as the screen. */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!SUMMARY_ROLES.includes(user.actor.role)) return new Response("Not found", { status: 404 });

  const params = Object.fromEntries(new URL(request.url).searchParams) as SummaryParams;
  const { version, lines, reportLines, org, entityRows, sharedLines } = await loadSummary(user, params);
  if (!version) return new Response("Belum ada versi RKA", { status: 404 });

  const names = new Map((await db.select({ code: schema.orgUnit.code, name: schema.orgUnit.name }).from(schema.orgUnit)).map((u) => [u.code, u.name]));
  const divisionOf = (unit: string) => {
    const code = org.divisionOf(unit);
    return names.get(code) ?? code;
  };

  const toExport = (l: (typeof lines)[number]) => ({
    coaCode: l.coaCode,
    coaName: l.coaName,
    category: l.category,
    requestorUnit: l.requestorUnit,
    ownerUnit: l.ownerUnit,
    entity: l.entity,
    item: l.item,
    months: l.months,
    rka2026: l.rka2026 ?? null,
    actual2026: l.actual2026 ?? null,
    basis: l.basis ?? null,
    notes: l.notes ?? null,
    flags: l.flags ?? [],
    status: STATE_LABEL[l.state],
    sourceRef: l.sourceRef,
  });

  const body = await writeRkaWorkbook({
    year: version.fiscalYear,
    title: version.name,
    lines: lines.map(toExport),
    reportLines: reportLines.map(toExport),
    divisionOf,
    pnlLabel: PNL_LABEL,
    ...(sharedLines ? { entityAllocation: entityRows } : {}),
  });

  const filename = `${version.name.replace(/[^\w .()-]+/g, "_")}.xlsx`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
