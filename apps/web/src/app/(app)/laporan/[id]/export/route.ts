import { money } from "@estrada/domain";
import { writeSheets } from "@estrada/importers";
import { loadReport, stamp } from "@/lib/report-view";
import { requireUser } from "@/lib/session";

/** A report as an Excel workbook: company header, status watermark and who signed off (BR-RPT-002). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const r = await loadReport(user, (await params).id);
  if (!r) return new Response("Not found", { status: 404 });
  const signed = r.signatures.map(([label, name, at]) => `${label}: ${name} (${stamp(at)})`);
  const body = await writeSheets(
    `${r.title} · ${r.company}`,
    r.row.content.sheets.map((s) => ({ name: s.name, columns: s.columns, rows: s.rows.map((row) => row.map((v) => (typeof v === "string" ? v : money(v.m)))) })),
    { header: [r.contact, `Versi ${r.row.version} · ${r.status}`, ...signed].filter(Boolean), watermark: r.approved ? r.company : "DRAFT" },
  );
  const filename = `${r.title} v${r.row.version}.xlsx`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
