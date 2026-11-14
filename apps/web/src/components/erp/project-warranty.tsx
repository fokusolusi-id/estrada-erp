"use client";

import { useState, useTransition } from "react";
import { DEFECT_STATUS_LABEL, costBearer, isOpenDefect, type DefectAction, type DefectStatus } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Result = { ok: boolean; message: string };
type Step = Exclude<DefectAction, "report">;

export interface DefectView {
  id: string;
  /** Site code, when the fault is tied to one. */
  site: string | null;
  description: string;
  status: DefectStatus;
  /** Names for the record. */
  reportedBy: string;
  reportedOn: string;
  confirmedIso: string | null;
  confirmedPmo: string | null;
  rejectNote: string | null;
  fixNote: string | null;
  /** A closed defect was inherited: the project paid for it. */
  wasInherited?: boolean;
  /** The steps this user may take on this defect right now. */
  steps: Step[];
}

export interface WarrantyView {
  bastOn: string | null;
  msoAcceptedOn: string | null;
  /** Days between BAST and MSO's acceptance; null until both exist. */
  transitionDays: number | null;
  warrantyEndsOn: string | null;
  closedOn: string | null;
  /** What still stands in the way of closing, in the user's words. */
  closureBlockers: string[];
  canSetWarranty: boolean;
  canReport: boolean;
  canClose: boolean;
}

const SELECT = "border-input focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]";
const STEP_LABEL: Record<Step, string> = { confirm_iso: "Tetapkan cacat bawaan (ISO)", confirm_pmo: "Tetapkan cacat bawaan (PMO)", reject: "Gangguan operasional", fix: "Catat perbaikan", close: "Tutup" };
const NEEDS_TEXT: Partial<Record<Step, string>> = { reject: "Alasan bukan cacat bawaan", fix: "Perbaikan yang dilakukan" };

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmt = (d: string | null) => (d ? day.format(new Date(`${d}T00:00:00Z`)) : "–");

function Message({ m }: { m: Result | null }) {
  return m ? <p className={m.ok ? "text-success text-sm" : "text-destructive text-sm"}>{m.message}</p> : null;
}

/**
 * Warranty and closing: when responsibility moved, when the warranty ends, the faults ISO or MSO believe the project
 * left behind and who settles them, and the Head PMO's declaration that the project is closed.
 */
export function ProjectWarranty({
  view,
  defects,
  sites,
  onSetWarranty,
  onReport,
  onStep,
  onClose,
}: {
  view: WarrantyView;
  defects: DefectView[];
  sites: { id: string; kode: string }[];
  onSetWarranty: (endsOn: string) => Promise<Result>;
  onReport: (input: { description: string; siteId: string | null }) => Promise<Result>;
  onStep: (defectId: string, action: Step, text?: string) => Promise<Result>;
  onClose: () => Promise<Result>;
}) {
  const [endsOn, setEndsOn] = useState(view.warrantyEndsOn ?? "");
  const [report, setReport] = useState({ description: "", siteId: "" });
  const [open, setOpen] = useState<{ id: string; step: Step } | null>(null);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<{ at: string; result: Result } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (at: string, action: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      setMessage({ at, result });
      if (result.ok) after?.();
    });
  const at = (where: string) => (message?.at === where ? message.result : null);
  const closed = !!view.closedOn;
  const openCount = defects.filter((d) => isOpenDefect(d.status)).length;

  const facts = [
    { label: "BAST", value: fmt(view.bastOn) },
    { label: "Diterima MSO", value: fmt(view.msoAcceptedOn), note: "Tanggung jawab layanan berpindah" },
    { label: "Masa peralihan", value: view.transitionDays === null ? "–" : `${view.transitionDays} hari`, note: "Tetap tanggung jawab PMO" },
    { label: "Akhir garansi", value: fmt(view.warrantyEndsOn) },
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-lg border p-4" data-testid="warranty-dates">
        <p className="text-sm font-medium">1. Masa peralihan dan masa garansi</p>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-muted-foreground text-xs">{f.label}</dt>
              <dd className="tabular mt-1 text-base font-semibold">{f.value}</dd>
              {f.note ? <dd className="text-muted-foreground text-xs">{f.note}</dd> : null}
            </div>
          ))}
        </dl>
        {view.canSetWarranty && !closed ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run("warranty", () => onSetWarranty(endsOn));
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="warranty-end">Tanggal akhir garansi terakhir</Label>
              <Input id="warranty-end" type="date" className="w-44" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
            <Button type="submit" size="sm" disabled={pending || !endsOn || endsOn === view.warrantyEndsOn}>
              Simpan akhir garansi
            </Button>
            <Message m={at("warranty")} />
          </form>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-lg border p-4" data-testid="warranty-defects">
        <div>
          <p className="text-sm font-medium">2. Cacat bawaan proyek</p>
          <p className="text-muted-foreground text-xs">
            Gangguan yang dilaporkan ISO atau MSO menjadi cacat bawaan hanya bila Head ISO dan Head PMO sama-sama menetapkannya: diperbaiki Delivery Control atas biaya proyek. Selain itu,
            gangguan operasional yang ditangani ISO.
          </p>
        </div>
        {view.canReport && !closed ? (
          <form
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              run("report", () => onReport({ description: report.description, siteId: report.siteId || null }), () => setReport({ description: "", siteId: "" }));
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="defect-description">Uraian gangguan</Label>
              <Input id="defect-description" maxLength={2000} value={report.description} onChange={(e) => setReport({ ...report, description: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="defect-site">Lokasi</Label>
              <select id="defect-site" className={SELECT} value={report.siteId} onChange={(e) => setReport({ ...report, siteId: e.target.value })}>
                <option value="">Seluruh proyek</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.kode}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" disabled={pending || !report.description.trim()}>
              Laporkan
            </Button>
          </form>
        ) : null}
        <Message m={at("report")} />
        {defects.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gangguan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Penetapan</TableHead>
                <TableHead className="sr-only">Tindakan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {defects.map((d) => (
                <TableRow key={d.id} data-testid={`defect-${d.id}`}>
                  <TableCell className="whitespace-normal">
                    {d.description}
                    <span className="text-muted-foreground block text-xs">
                      {d.site ? `${d.site} · ` : ""}
                      {d.reportedBy} · {fmt(d.reportedOn)}
                    </span>
                    {d.fixNote ? <span className="block text-xs">Perbaikan: {d.fixNote}</span> : null}
                    {d.rejectNote ? <span className="block text-xs">Alasan: {d.rejectNote}</span> : null}
                    {costBearer(d.status, d.wasInherited) ? (
                      <span className="text-muted-foreground block text-xs" data-testid="cost">
                        Biaya: {costBearer(d.status, d.wasInherited)!.note}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.status === "Cacat_Bawaan" ? "destructive" : isOpenDefect(d.status) ? "secondary" : "outline"} data-testid="status">
                      {DEFECT_STATUS_LABEL[d.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal">
                    Head ISO: {d.confirmedIso ?? "belum"}
                    <span className="block">Head PMO: {d.confirmedPmo ?? "belum"}</span>
                  </TableCell>
                  <TableCell className="min-w-64 whitespace-normal">
                    {open?.id === d.id ? (
                      <form
                        className="grid gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          run(d.id, () => onStep(d.id, open.step, text), () => setOpen(null));
                        }}
                      >
                        <Label htmlFor={`defect-text-${d.id}`}>{NEEDS_TEXT[open.step]}</Label>
                        <Input id={`defect-text-${d.id}`} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(null)}>
                            Batal
                          </Button>
                          <Button type="submit" size="sm" disabled={pending || !text.trim()}>
                            Simpan
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-2">
                        {d.steps.map((step) => (
                          <Button
                            key={step}
                            size="sm"
                            variant={step === "reject" ? "outline" : "default"}
                            disabled={pending || !!open}
                            onClick={() => {
                              if (NEEDS_TEXT[step]) {
                                setText("");
                                setMessage(null);
                                setOpen({ id: d.id, step });
                              } else run(d.id, () => onStep(d.id, step));
                            }}
                          >
                            {STEP_LABEL[step]}
                          </Button>
                        ))}
                      </div>
                    )}
                    <Message m={at(d.id)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-sm">{view.msoAcceptedOn ? "Belum ada laporan." : "Laporan dibuka setelah MSO menerima serah terima."}</p>
        )}
      </section>

      <section className="grid gap-3 rounded-lg border p-4" data-testid="warranty-closure">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">3. Penutupan proyek</p>
          <Badge variant={closed ? "default" : "outline"} data-testid="closure-state">
            {closed ? `Ditutup ${fmt(view.closedOn)}` : view.closureBlockers.length ? "Belum dapat ditutup" : "Siap ditutup"}
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs">
          PMO lepas dari proyek pada akhir masa garansi terakhir, bukan pada BAST. Cacat bawaan yang masih terbuka ({openCount}) memperpanjang masa garansi sampai ditutup.
        </p>
        {!closed && view.closureBlockers.length ? (
          <ul className="text-muted-foreground list-disc pl-5 text-sm" data-testid="closure-blockers">
            {view.closureBlockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
        {!closed && view.canClose && !view.closureBlockers.length ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Message m={at("close")} />
            <Button size="sm" disabled={pending} onClick={() => run("close", onClose)}>
              Nyatakan proyek ditutup
            </Button>
          </div>
        ) : (
          <Message m={at("close")} />
        )}
      </section>
    </div>
  );
}
