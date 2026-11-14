"use client";

import { useState, useTransition } from "react";
import { ARTEFACTS, EOS_CHECKLIST, HANDOVER_STATUS_LABEL, MSO_CRITERIA, missingArtefacts, type HandoverStatus } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Result = { ok: boolean; message: string };

export interface HandoverView {
  status: HandoverStatus;
  hasApplication: boolean;
  /** Where each artefact is kept, by its number. */
  artefacts: Record<number, string>;
  criteria: Record<string, boolean>;
  checklist: Record<string, boolean>;
  returnNote: string | null;
  /** The approved BAST date; the package cannot be submitted before it. */
  bastOn: string | null;
  /** Names for the record: who submitted, accepted and checked. */
  submittedBy: string | null;
  msoAcceptedBy: string | null;
  msoAcceptedOn: string | null;
  checklistBy: string | null;
  isoAcceptedBy: string | null;
}

export interface HandoverCan {
  artefact: boolean;
  submit: boolean;
  decide: boolean;
  checklist: boolean;
  acceptIso: boolean;
}

const NEED = { wajib: "Wajib", aplikasi: "Wajib bila ada aplikasi", dianjurkan: "Dianjurkan" } as const;
const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmt = (d: string) => day.format(new Date(`${d}T00:00:00Z`));

function Message({ m }: { m: Result | null }) {
  return m ? <p className={m.ok ? "text-success text-sm" : "text-destructive text-sm"}>{m.message}</p> : null;
}

function Checks({
  items,
  values,
  editable,
  onChange,
}: {
  items: readonly { key: string; label: string; checks: string }[];
  values: Record<string, boolean>;
  editable: boolean;
  onChange: (key: string, value: boolean) => void;
}) {
  return (
    <ul className="grid gap-3">
      {items.map((c) => (
        <li key={c.key}>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" checked={values[c.key] ?? false} disabled={!editable} onChange={(e) => onChange(c.key, e.target.checked)} />
            <span>
              <span className="font-medium">{c.label}</span>
              <span className="text-muted-foreground block text-xs">{c.checks}</span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/**
 * The handover from PMO to MSO and on to ISO, gate by gate: the package of artefacts, Head MSO's five criteria,
 * Staff Operational EOS's four checks, and Head ISO's acceptance.
 */
export function ProjectHandover({
  view,
  can,
  onSavePackage,
  onSubmit,
  onDecide,
  onSaveChecklist,
  onAcceptIso,
}: {
  view: HandoverView;
  can: HandoverCan;
  onSavePackage: (input: { hasApplication: boolean; references: Record<string, string> }) => Promise<Result>;
  onSubmit: () => Promise<Result>;
  onDecide: (input: { accept: boolean; criteria: Record<string, boolean>; note?: string }) => Promise<Result>;
  onSaveChecklist: (checklist: Record<string, boolean>) => Promise<Result>;
  onAcceptIso: () => Promise<Result>;
}) {
  const [refs, setRefs] = useState<Record<number, string>>(view.artefacts);
  const [hasApplication, setHasApplication] = useState(view.hasApplication);
  const [criteria, setCriteria] = useState(view.criteria);
  const [checklist, setChecklist] = useState(view.checklist);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ at: "package" | "mso" | "eos" | "iso"; result: Result } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (at: "package" | "mso" | "eos" | "iso", action: () => Promise<Result>) => startTransition(async () => setMessage({ at, result: await action() }));
  const at = (where: "package" | "mso" | "eos" | "iso") => (message?.at === where ? message.result : null);

  const drafting = view.status === "Disusun" || view.status === "Dikembalikan";
  const editing = drafting && can.artefact;
  const filled = ARTEFACTS.filter((a) => refs[a.no]?.trim()).map((a) => a.no);
  const missing = missingArtefacts(filled, hasApplication);
  const dirty = hasApplication !== view.hasApplication || ARTEFACTS.some((a) => (refs[a.no] ?? "").trim() !== (view.artefacts[a.no] ?? ""));
  const allCriteria = MSO_CRITERIA.every((c) => criteria[c.key]);
  const allChecklist = EOS_CHECKLIST.every((c) => view.checklist[c.key]);
  const checklistOpen = view.status === "Diajukan" || view.status === "Diterima_MSO";

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-lg border p-4" data-testid="handover-package">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">1. Paket serah terima</p>
            <p className="text-muted-foreground text-xs">Diisi tim proyek, diajukan Project Manager setelah BAST disahkan.</p>
          </div>
          <Badge variant={drafting ? "outline" : "secondary"} data-testid="handover-status">
            {HANDOVER_STATUS_LABEL[view.status]}
          </Badge>
        </div>
        {view.status === "Dikembalikan" && view.returnNote ? (
          <p className="border-destructive/40 bg-destructive/5 rounded-md border px-3 py-2 text-sm" data-testid="return-note">
            <span className="font-medium">Dikembalikan Head MSO:</span> {view.returnNote}
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={hasApplication} disabled={!editing} onChange={(e) => setHasApplication(e.target.checked)} />
          Proyek ini menyerahkan aplikasi (artefak 8 menjadi wajib)
        </label>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">No</TableHead>
              <TableHead>Artefak</TableHead>
              <TableHead>Penerima</TableHead>
              <TableHead>Wajib?</TableHead>
              <TableHead className="w-80">Rujukan (tempat berkas disimpan)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ARTEFACTS.map((a) => (
              <TableRow key={a.no} data-testid={`artefact-${a.no}`}>
                <TableCell className="tabular">{a.no}</TableCell>
                <TableCell className="whitespace-normal">
                  {a.name}
                  <span className="text-muted-foreground block text-xs">Dibuat: {a.from}</span>
                </TableCell>
                <TableCell className="text-sm whitespace-normal">{a.to}</TableCell>
                <TableCell>
                  <span className={missing.includes(a.no) ? "text-destructive text-sm font-medium" : "text-muted-foreground text-sm"}>{NEED[a.need]}</span>
                </TableCell>
                <TableCell className="whitespace-normal">
                  {editing ? (
                    <Input aria-label={`Rujukan artefak ${a.no}`} maxLength={500} value={refs[a.no] ?? ""} onChange={(e) => setRefs({ ...refs, [a.no]: e.target.value })} />
                  ) : (
                    <span className={refs[a.no] ? "text-sm" : "text-muted-foreground text-sm"}>{refs[a.no] || "Belum diisi"}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {drafting ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="text-muted-foreground mr-auto text-sm" data-testid="missing">
              {!view.bastOn ? "BAST belum disahkan; paket belum dapat diajukan." : missing.length ? `${missing.length} artefak wajib belum diisi: nomor ${missing.join(", ")}.` : "Semua artefak wajib sudah diisi."}
            </p>
            <Message m={at("package")} />
            {can.artefact ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending || !dirty}
                onClick={() => run("package", () => onSavePackage({ hasApplication, references: Object.fromEntries(ARTEFACTS.map((a) => [String(a.no), refs[a.no] ?? ""])) }))}
              >
                Simpan paket
              </Button>
            ) : null}
            {can.submit ? (
              <Button size="sm" disabled={pending || dirty || !view.bastOn || missing.length > 0} title={dirty ? "Simpan paket lebih dahulu" : undefined} onClick={() => run("package", onSubmit)}>
                Ajukan ke MSO
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Diajukan oleh {view.submittedBy ?? "Project Manager"}.</p>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border p-4" data-testid="handover-mso">
        <div>
          <p className="text-sm font-medium">2. Lima kriteria penerimaan Head MSO</p>
          <p className="text-muted-foreground text-xs">
            {view.msoAcceptedOn
              ? `Diterima ${view.msoAcceptedBy ?? "Head MSO"} pada ${fmt(view.msoAcceptedOn)}. Sejak tanggal ini tanggung jawab layanan berpindah dari PMO.`
              : "Semua terpenuhi: terima. Ada yang kurang: kembalikan ke PMO dengan catatan. Penyerah paket tidak boleh menerima."}
          </p>
        </div>
        <Checks items={MSO_CRITERIA} values={criteria} editable={can.decide && view.status === "Diajukan"} onChange={(key, value) => setCriteria({ ...criteria, [key]: value })} />
        {can.decide && view.status === "Diajukan" ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="handover-note">Catatan kekurangan (wajib bila dikembalikan)</Label>
              <Input id="handover-note" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Message m={at("mso")} />
              <Button variant="outline" size="sm" disabled={pending || !note.trim()} onClick={() => run("mso", () => onDecide({ accept: false, criteria, note }))}>
                Kembalikan ke PMO
              </Button>
              <Button size="sm" disabled={pending || !allCriteria} onClick={() => run("mso", () => onDecide({ accept: true, criteria }))}>
                Terima serah terima
              </Button>
            </div>
          </div>
        ) : view.status === "Diajukan" ? (
          <p className="text-muted-foreground text-sm">Menunggu Head MSO.</p>
        ) : drafting ? (
          <p className="text-muted-foreground text-sm">Dinilai setelah paket diajukan.</p>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-lg border p-4" data-testid="handover-eos">
        <div>
          <p className="text-sm font-medium">3. Empat checklist Staff Operational EOS</p>
          <p className="text-muted-foreground text-xs">{view.checklistBy ? `Terakhir diisi ${view.checklistBy}.` : "Kelayakan operasional; harus lengkap sebelum ISO menerima."}</p>
        </div>
        <Checks items={EOS_CHECKLIST} values={checklist} editable={can.checklist && checklistOpen} onChange={(key, value) => setChecklist({ ...checklist, [key]: value })} />
        {can.checklist && checklistOpen ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Message m={at("eos")} />
            <Button size="sm" disabled={pending || EOS_CHECKLIST.every((c) => (checklist[c.key] ?? false) === (view.checklist[c.key] ?? false))} onClick={() => run("eos", () => onSaveChecklist(checklist))}>
              Simpan checklist
            </Button>
          </div>
        ) : drafting ? (
          <p className="text-muted-foreground text-sm">Diisi setelah paket diajukan.</p>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-lg border p-4" data-testid="handover-iso">
        <div>
          <p className="text-sm font-medium">4. Turunan teknis diterima Head ISO</p>
          <p className="text-muted-foreground text-xs">Dokumentasi teknis, kredensial, baseline pemantauan, run book dan daftar masalah terbuka. Setelah ini layanan masuk pemantauan ISO.</p>
        </div>
        {view.isoAcceptedBy || view.status === "Diterima_ISO" || view.status === "Selesai" ? (
          <p className="text-sm">Diterima {view.isoAcceptedBy ?? "Head ISO"}.</p>
        ) : view.status !== "Diterima_MSO" ? (
          <p className="text-muted-foreground text-sm">Menunggu penerimaan MSO.</p>
        ) : !allChecklist ? (
          <p className="text-muted-foreground text-sm">Menunggu checklist operasional EOS lengkap.</p>
        ) : can.acceptIso ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Message m={at("iso")} />
            <Button size="sm" disabled={pending} onClick={() => run("iso", onAcceptIso)}>
              Terima turunan teknis
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Menunggu Head ISO.</p>
        )}
      </section>
    </div>
  );
}
