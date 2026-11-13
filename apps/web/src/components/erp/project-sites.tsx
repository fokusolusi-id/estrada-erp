"use client";

import { useState, useTransition } from "react";
import { FIELD_SITE_STATUSES, SITE_STATUS_LABEL, delayDays, type SiteInput, type SiteStatus } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Result = { ok: boolean; message: string };

export interface SiteView extends SiteInput {
  id: string;
}
type Draft = SiteInput & { id: string | null };

const SELECT =
  "border-input focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-60";

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmt = (d: string | null | undefined) => (d ? day.format(new Date(`${d}T00:00:00Z`)) : "–");
const isField = (s: SiteStatus) => (FIELD_SITE_STATUSES as readonly string[]).includes(s);
const blank = (): Draft => ({ id: null, kode: "", nama: "", alamat: "", wilayah: "", picNama: "", picKontak: "", status: "Belum_Mulai", tglPlanSelesai: "", tglAktualSelesai: null, ujiPetik: false });

const tone = (s: SiteStatus) => (s === "Terkendala" ? "destructive" : s === "Selesai" ? "default" : s === "Belum_Mulai" ? "outline" : "secondary");

/**
 * The project's sites: status, plan against actual, and the delay the system computes. The Project Manager adds
 * sites up to the contract's count; the Project Manager and Project Admin update them.
 */
export function ProjectSites({
  sites,
  contractSites,
  today,
  canAdd,
  canEdit,
  onSave,
}: {
  sites: SiteView[];
  contractSites: number;
  /** Today in Jakarta, YYYY-MM-DD: the end of the delay count for unfinished sites. */
  today: string;
  canAdd: boolean;
  canEdit: boolean;
  onSave: (site: Draft) => Promise<Result>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const full = sites.length >= contractSites;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const locked = !!draft?.id && !isField(draft.status);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    startTransition(async () => {
      const result = await onSave(draft);
      setMessage(result);
      if (result.ok) setDraft(null);
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm" data-testid="site-count">
          {sites.length} dari {contractSites} lokasi kontrak terdaftar
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {message && !draft ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
          {canAdd ? (
            <Button
              size="sm"
              disabled={full || !!draft}
              title={full ? "Semua lokasi kontrak sudah terdaftar" : undefined}
              onClick={() => {
                setMessage(null);
                setDraft(blank());
              }}
            >
              Tambah lokasi
            </Button>
          ) : null}
        </div>
      </div>

      {draft ? (
        <form className="grid gap-4 rounded-lg border p-4" onSubmit={submit} data-testid="site-form">
          <p className="text-sm font-medium">{draft.id ? `Ubah lokasi ${draft.kode}` : "Lokasi baru"}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="site-kode">Kode lokasi</Label>
              <Input id="site-kode" placeholder="POLDA-JATIM-01" maxLength={60} value={draft.kode} onChange={(e) => set({ kode: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="site-nama">Nama lokasi</Label>
              <Input id="site-nama" maxLength={200} value={draft.nama} onChange={(e) => set({ nama: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="site-wilayah">Wilayah</Label>
              <Input id="site-wilayah" placeholder="Provinsi atau kabupaten/kota" maxLength={100} value={draft.wilayah ?? ""} onChange={(e) => set({ wilayah: e.target.value })} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="site-alamat">Alamat</Label>
              <Input id="site-alamat" maxLength={1000} value={draft.alamat} onChange={(e) => set({ alamat: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="site-pic">PIC pelanggan</Label>
              <Input id="site-pic" placeholder="Penandatangan BAI di lokasi" maxLength={200} value={draft.picNama ?? ""} onChange={(e) => set({ picNama: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="site-kontak">Kontak PIC</Label>
              <Input id="site-kontak" maxLength={200} value={draft.picKontak ?? ""} onChange={(e) => set({ picKontak: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="site-status">Status</Label>
              <select id="site-status" className={SELECT} disabled={locked} value={draft.status} onChange={(e) => set({ status: e.target.value as SiteStatus })}>
                {(locked ? [draft.status] : FIELD_SITE_STATUSES).map((s) => (
                  <option key={s} value={s}>
                    {SITE_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              {locked ? <p className="text-muted-foreground text-xs">Mengikuti BAI lokasi.</p> : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="site-plan">Rencana selesai</Label>
              <Input id="site-plan" type="date" value={draft.tglPlanSelesai} onChange={(e) => set({ tglPlanSelesai: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="site-aktual">Aktual selesai</Label>
              <Input id="site-aktual" type="date" value={draft.tglAktualSelesai ?? ""} onChange={(e) => set({ tglAktualSelesai: e.target.value || null })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={draft.ujiPetik ?? false} onChange={(e) => set({ ujiPetik: e.target.checked })} />
              Sampel uji petik
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {message && !message.ok ? <p className="text-destructive text-sm">{message.message}</p> : null}
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft(null)}>
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={pending || !draft.kode.trim() || !draft.nama.trim() || !draft.alamat.trim() || !draft.tglPlanSelesai}>
              Simpan lokasi
            </Button>
          </div>
        </form>
      ) : null}

      {sites.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Lokasi</TableHead>
              <TableHead>Wilayah</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Rencana selesai</TableHead>
              <TableHead>Aktual selesai</TableHead>
              <TableHead className="text-right">Terlambat</TableHead>
              {canEdit ? <TableHead className="sr-only">Tindakan</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.map((s) => {
              const late = delayDays(s, today);
              return (
                <TableRow key={s.id} data-testid={`site-${s.id}`}>
                  <TableCell className="font-medium">{s.kode}</TableCell>
                  <TableCell className="whitespace-normal">
                    {s.nama}
                    {s.ujiPetik ? <span className="text-muted-foreground ml-2 text-xs">uji petik</span> : null}
                    <span className="text-muted-foreground block text-xs">{s.alamat}</span>
                  </TableCell>
                  <TableCell>{s.wilayah || "–"}</TableCell>
                  <TableCell>
                    <Badge variant={tone(s.status)} data-testid="status">
                      {SITE_STATUS_LABEL[s.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular">{fmt(s.tglPlanSelesai)}</TableCell>
                  <TableCell className="tabular">{fmt(s.tglAktualSelesai)}</TableCell>
                  <TableCell className={late ? "text-destructive tabular text-right font-medium" : "tabular text-right"} data-testid="delay">
                    {late ? `${late} hari` : "–"}
                  </TableCell>
                  {canEdit ? (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Ubah ${s.kode}`}
                        disabled={!!draft}
                        onClick={() => {
                          setMessage(null);
                          setDraft({ ...s });
                        }}
                      >
                        Ubah
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-sm">Belum ada lokasi. Project Manager mendaftarkan lokasi sesuai kontrak.</p>
      )}
    </div>
  );
}
