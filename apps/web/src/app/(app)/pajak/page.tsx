import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PPH_LABEL, TAX_KINDS, TAX_KIND_LABEL, TAX_STATUS_LABEL, can, formatIdr, money, taxLate, taxPeriodOf, unitLabel, type Money, type TaxKind } from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { MONTH_NAMES } from "@/lib/period";
import { formatDate, todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadTaxMonth, type TaxRow } from "@/lib/tax";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { KpiCard, KpiStrip } from "@/components/erp/kpi-card";
import { FigureCell } from "@/components/erp/money-cell";
import { PageHeader } from "@/components/erp/page-header";
import { Pph21Form, TaxDocumentForm } from "@/components/erp/tax-forms";
import { ViewNote } from "@/components/erp/view-note";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { savePph21, saveTaxDocument } from "./actions";

export const metadata: Metadata = { title: "Pajak" };

const SOURCE: Record<TaxKind, string> = { faktur_out: "/invoice", faktur_in: "/pembayaran", bupot: "/pembayaran" };

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const user = await requireUser();
  const org = await loadOrg();
  const mayRecord = can(user.actor, "tax.record", null, org);
  if (!mayRecord && !can(user.actor, "tax.view", null, org)) redirect("/");
  const today = todayJakarta();
  const asked = (await searchParams).bulan ?? "";
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : today.slice(0, 7);
  const [view, unit] = await Promise.all([activeView(), displayUnit()]);
  const data = await loadTaxMonth(user.actor, period, view.entity);
  const r = data.report;
  const title = `${MONTH_NAMES[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
  const late = data.items.filter((i) => taxLate(i, today)).sort((a, b) => a.baseDate.localeCompare(b.baseDate));
  const inMonth = (kind: TaxKind) => data.items.filter((i) => i.kind === kind && taxPeriodOf(i) === period).sort((a, b) => a.baseDate.localeCompare(b.baseDate));
  const summary: [string, Money, boolean?][] = [
    ["PPN keluaran (dipungut kita)", r.ppnOut],
    ["PPN masukan (faktur sudah dicatat)", r.ppnIn],
    ["PPN kurang bayar (negatif = lebih bayar)", r.ppnDue, true],
    ["PPN dipungut pembeli (Wapu)", r.ppnWapu],
    ["PPN masukan belum dicatat fakturnya", r.ppnInUnrecorded],
    ...r.withheld.map((w): [string, Money] => [`${w.type ? PPH_LABEL[w.type] : "PPh (tanpa jenis)"} dipotong dari vendor`, w.amount]),
    ["PPh 21", r.pph21],
    ["PPh harus disetor", r.pphDue, true],
    ["PPh dipotong pelanggan (kredit pajak)", r.withheldFromUs],
  ];
  const documents = (rows: TaxRow[], empty: string) =>
    rows.length ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sumber · lawan transaksi</TableHead>
            <TableHead>Nomor dokumen pajak</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">DPP</TableHead>
            <TableHead className="text-right">Pajak</TableHead>
            {mayRecord ? <TableHead /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((i) => (
            <TableRow key={`${i.kind}-${i.sourceId}`} data-testid={`tax-${i.kind}-${i.sourceId}`}>
              <TableCell className="min-w-56 whitespace-normal">
                <Link href={`${SOURCE[i.kind]}/${i.sourceId}`} className="font-medium underline-offset-4 hover:underline">
                  {i.sourceNumber || "(tanpa nomor)"}
                </Link>
                <span className="block text-xs">
                  {i.entity} · {i.party || "—"} · {i.npwp ? `NPWP ${i.npwp}` : "tanpa NPWP"}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {i.document?.number ?? "–"}
                <span className="text-muted-foreground block text-xs">{formatDate(i.document?.date ?? i.baseDate)}</span>
              </TableCell>
              <TableCell className={taxLate(i, today) ? "text-destructive" : ""}>
                {i.document ? TAX_STATUS_LABEL[i.document.status] : "Belum dicatat"}
                {i.wapu ? <span className="text-muted-foreground block text-xs">Wapu</span> : null}
                {i.kind === "bupot" && i.pphType ? <span className="text-muted-foreground block text-xs">{PPH_LABEL[i.pphType]}</span> : null}
              </TableCell>
              {[i.dpp, i.amount].map((v, n) => (
                <TableCell key={n} className="tabular text-right whitespace-nowrap">
                  {formatIdr(v)}
                </TableCell>
              ))}
              {mayRecord ? (
                <TableCell>
                  <TaxDocumentForm kind={i.kind} sourceId={i.sourceId} current={i.document} today={today} onSave={saveTaxDocument} />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <p className="text-muted-foreground text-sm">{empty}</p>
    );
  const section = (heading: string, description: string | null, content: React.ReactNode) => (
    <Card key={heading}>
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4">{content}</CardContent>
    </Card>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={`Pajak ${title}`} description={`PPN dan PPh dari invoice terbit dan Permintaan Pembayaran. Entitas ${data.entities.join(", ")}. Ringkasan dalam ${unitLabel(unit)}.`} note={<ViewNote ignores={["division"]} />} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Masa pajak</span>
            <Input type="month" name="bulan" aria-label="Masa pajak" defaultValue={period} className="w-48" />
          </label>
          <Button type="submit" variant="outline">
            Tampilkan
          </Button>
        </form>
        <Button asChild variant="outline">
          <a href={`/pajak/export?bulan=${period}`}>Unduh Excel</a>
        </Button>
      </div>
      <KpiStrip>
        <KpiCard label="PPN kurang bayar" value={r.ppnDue} unit={unit} signal />
        <KpiCard label="PPh harus disetor" value={r.pphDue} unit={unit} />
        <KpiCard label="PPh dipotong pelanggan" value={r.withheldFromUs} unit={unit} note="Kredit pajak" />
      </KpiStrip>
      {late.length
        ? section("Perlu tindakan", `Lewat 7 hari: faktur keluaran dan bukti potong belum diunggah, atau faktur masukan belum dicatat. ${late.length} dokumen.`, documents(late, ""))
        : null}
      {section(
        "Ringkasan masa",
        "Bahan SPT Masa PPN dan PPh.",
        <Table>
          <TableBody>
            {summary.map(([label, value, strong]) => (
              <TableRow key={label} className={strong ? "bg-muted/40 font-medium" : ""}>
                <TableCell>{label}</TableCell>
                <TableCell className="text-right">
                  <FigureCell value={value} unit={unit} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>,
      )}
      {TAX_KINDS.map((kind) => section(TAX_KIND_LABEL[kind], "Nilai penuh dalam rupiah.", documents(inMonth(kind), "Tidak ada dokumen pada masa ini.")))}
      {mayRecord
        ? section(
            "PPh 21",
            "Total per perusahaan untuk masa ini, dari penggajian di luar aplikasi.",
            <Pph21Form
              key={period}
              period={period}
              entities={data.mine}
              amounts={Object.fromEntries(data.pph21.map((p) => [p.entityCode, formatIdr(money(p.amount)).replace("Rp ", "")]))}
              onSave={savePph21}
            />,
          )
        : null}
    </div>
  );
}
