import { PPH_LABEL, TAX_KIND_LABEL, TAX_STATUS_LABEL, can, taxPeriodOf, type TaxKind } from "@estrada/domain";
import { writeSheets } from "@estrada/importers";
import { MONTH_NAMES } from "@/lib/period";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadTaxMonth } from "@/lib/tax";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";

const SHEETS: [TaxKind, string][] = [["faktur_out", "PPN Keluaran"], ["faktur_in", "PPN Masukan"], ["bupot", "Bukti Potong"]];

/** The month's faktur and bukti potong as an Excel workbook, for the same companies as the screen. */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!can(user.actor, "tax.view", null, await loadOrg()) && !can(user.actor, "tax.record", null, await loadOrg())) return new Response("Not found", { status: 404 });
  const asked = new URL(request.url).searchParams.get("bulan") ?? "";
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : todayJakarta().slice(0, 7);
  const { items, entities } = await loadTaxMonth(user.actor, period, (await activeView()).entity);
  const month = `${MONTH_NAMES[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
  const body = await writeSheets(
    `Pajak ${month} · ${entities.join(", ")}`,
    SHEETS.map(([kind, name]) => ({
      name,
      columns: ["Entitas", `Nomor ${TAX_KIND_LABEL[kind]}`, "Tanggal dokumen", "Status", "Nomor sumber", "Lawan transaksi", "NPWP", "DPP", kind === "bupot" ? "PPh" : "PPN", kind === "bupot" ? "Jenis PPh" : "Wapu"],
      rows: items
        .filter((i) => i.kind === kind && taxPeriodOf(i) === period)
        .map((i) => [
          i.entity, i.document?.number ?? "", i.document?.date ?? "", i.document ? TAX_STATUS_LABEL[i.document.status] : "Belum dicatat", i.sourceNumber, i.party, i.npwp, i.dpp, i.amount,
          kind === "bupot" ? (i.pphType ? PPH_LABEL[i.pphType] : "") : i.wapu ? "Ya" : "",
        ]),
    })),
  );
  const filename = `Pajak ${period}.xlsx`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
