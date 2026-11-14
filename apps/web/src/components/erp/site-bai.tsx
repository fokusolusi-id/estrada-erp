"use client";

import { useState, useTransition } from "react";
import { SITE_STATUS_LABEL, type BaiStep, type SiteBai as Bai, type SiteStatus } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Result = { ok: boolean; message: string };

export interface BaiSite {
  id: string;
  kode: string;
  nama: string;
  status: SiteStatus;
  ujiPetik?: boolean;
  bai: Bai | null;
  baiReturnNote: string | null;
}

export interface BaiInput {
  step: BaiStep;
  nomor?: string;
  tanggal?: string;
  evidence?: string;
  spotCheckPassed?: boolean;
}

const STEP_OF: Partial<Record<SiteStatus, BaiStep>> = { Uji: "collect", BAI_Terbit: "compile", BAI_Terverifikasi: "verify" };
const STEP_LABEL: Record<BaiStep, string> = { collect: "Catat BAI", compile: "Kompilasi BAI", verify: "Verifikasi BAI" };
const WAITING: Record<BaiStep, string> = { collect: "Menunggu Delivery Control", compile: "Menunggu Project Admin", verify: "Menunggu Assurance (BCD)" };

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmt = (d: string) => day.format(new Date(`${d}T00:00:00Z`));

/**
 * BAI per site, three hands on one document: Delivery Control records it once the site is tested, the Project Admin
 * compiles it, Assurance verifies it and the site becomes Selesai. The compiler or verifier may send it back.
 */
export function SiteBai({
  sites,
  names,
  can,
  onStep,
  onReturn,
}: {
  sites: BaiSite[];
  /** Display names by user id. */
  names: Record<string, string>;
  /** Which steps this user may take on this project. */
  can: Record<BaiStep, boolean>;
  onStep: (siteId: string, input: BaiInput) => Promise<Result>;
  onReturn: (siteId: string, note: string) => Promise<Result>;
}) {
  const [open, setOpen] = useState<{ id: string; mode: "step" | "return" } | null>(null);
  const [form, setForm] = useState({ nomor: "", tanggal: "", evidence: "", note: "" });
  /** Uji petik confirmed as passed, per sample site. */
  const [passed, setPassed] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const rows = sites.filter((s) => STEP_OF[s.status] || s.status === "Selesai" || s.baiReturnNote);
  const who = (id: string | null | undefined) => (id ? (names[id] ?? "–") : "–");

  const start = (id: string, mode: "step" | "return") => {
    setMessage(null);
    setForm({ nomor: "", tanggal: "", evidence: "", note: "" });
    setOpen({ id, mode });
  };
  const run = (action: () => Promise<Result>) =>
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (result.ok) setOpen(null);
    });

  if (!rows.length) return <p className="text-muted-foreground text-sm">Belum ada lokasi yang lulus uji. BAI dicatat setelah status lokasi menjadi Uji.</p>;

  return (
    <div className="grid gap-3">
      {message && !open ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lokasi</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>BAI</TableHead>
            <TableHead>Dikumpulkan</TableHead>
            <TableHead>Dikompilasi</TableHead>
            <TableHead>Diverifikasi</TableHead>
            <TableHead className="sr-only">Tindakan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => {
            const step = STEP_OF[s.status];
            const mine = step ? can[step] : false;
            const active = open?.id === s.id ? open.mode : null;
            return (
              <TableRow key={s.id} data-testid={`bai-${s.id}`}>
                <TableCell className="whitespace-normal">
                  <span className="font-medium">{s.kode}</span>
                  {s.ujiPetik ? <span className="text-muted-foreground ml-2 text-xs">uji petik</span> : null}
                  <span className="text-muted-foreground block text-xs">{s.nama}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={s.status === "Selesai" ? "default" : "secondary"} data-testid="status">
                    {SITE_STATUS_LABEL[s.status]}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-normal">
                  {s.bai ? (
                    <>
                      <span className="tabular">
                        {s.bai.nomor} · {fmt(s.bai.tanggal)}
                      </span>
                      <span className="text-muted-foreground block text-xs">Evidence: {s.bai.evidence}</span>
                    </>
                  ) : s.baiReturnNote ? (
                    <span className="text-destructive text-sm" data-testid="return-note">
                      Dikembalikan: {s.baiReturnNote}
                    </span>
                  ) : (
                    "–"
                  )}
                </TableCell>
                <TableCell>{who(s.bai?.collectedBy)}</TableCell>
                <TableCell>{who(s.bai?.compiledBy)}</TableCell>
                <TableCell>{who(s.bai?.verifiedBy)}</TableCell>
                <TableCell className="min-w-64 whitespace-normal">
                  {!step ? null : !mine ? (
                    <span className="text-muted-foreground text-sm">{WAITING[step]}</span>
                  ) : active === "step" && step === "collect" ? (
                    <form
                      className="grid gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(() => onStep(s.id, { step, nomor: form.nomor, tanggal: form.tanggal, evidence: form.evidence }));
                      }}
                    >
                      <Label htmlFor={`bai-nomor-${s.id}`}>Nomor BAI</Label>
                      <Input id={`bai-nomor-${s.id}`} maxLength={100} value={form.nomor} onChange={(e) => setForm({ ...form, nomor: e.target.value })} />
                      <Label htmlFor={`bai-tanggal-${s.id}`}>Tanggal BAI</Label>
                      <Input id={`bai-tanggal-${s.id}`} type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} />
                      <Label htmlFor={`bai-evidence-${s.id}`}>Rujukan evidence</Label>
                      <Input id={`bai-evidence-${s.id}`} placeholder="Lokasi berkas foto dan hasil uji" maxLength={500} value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
                      {message && !message.ok ? <p className="text-destructive text-sm">{message.message}</p> : null}
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(null)}>
                          Batal
                        </Button>
                        <Button type="submit" size="sm" disabled={pending || !form.nomor.trim() || !form.tanggal || !form.evidence.trim()}>
                          Simpan BAI
                        </Button>
                      </div>
                    </form>
                  ) : active === "return" ? (
                    <form
                      className="grid gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(() => onReturn(s.id, form.note));
                      }}
                    >
                      <Label htmlFor={`bai-note-${s.id}`}>Alasan pengembalian</Label>
                      <Input id={`bai-note-${s.id}`} maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                      {message && !message.ok ? <p className="text-destructive text-sm">{message.message}</p> : null}
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(null)}>
                          Batal
                        </Button>
                        <Button type="submit" variant="destructive" size="sm" disabled={pending || !form.note.trim()}>
                          Kembalikan BAI
                        </Button>
                      </div>
                    </form>
                  ) : step === "collect" ? (
                    <Button size="sm" disabled={!!open} aria-label={`Catat BAI ${s.kode}`} onClick={() => start(s.id, "step")}>
                      Catat BAI
                    </Button>
                  ) : (
                    <div className="grid gap-2">
                      {step === "compile" && s.ujiPetik ? (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={passed[s.id] ?? false}
                            onChange={(e) => setPassed({ ...passed, [s.id]: e.target.checked })}
                          />
                          Uji petik lulus
                        </label>
                      ) : null}
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" size="sm" disabled={pending || !!open} aria-label={`Kembalikan BAI ${s.kode}`} onClick={() => start(s.id, "return")}>
                          Kembalikan
                        </Button>
                        <Button
                          size="sm"
                          disabled={pending || !!open || (step === "compile" && !!s.ujiPetik && !passed[s.id])}
                          aria-label={`${STEP_LABEL[step]} ${s.kode}`}
                          onClick={() => run(() => onStep(s.id, { step, spotCheckPassed: step === "compile" && s.ujiPetik ? passed[s.id] : undefined }))}
                        >
                          {STEP_LABEL[step]}
                        </Button>
                      </div>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
