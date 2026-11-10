"use client";

import { useActionState, useState } from "react";
import { defaultDeadline } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { openCycle, reviseVersion, setDeadline, type CycleState } from "./actions";

const INITIAL: CycleState = { ok: false, message: "" };
const SELECT =
  "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

function Result({ state }: { state: CycleState }) {
  return state.message ? <p className={state.ok ? "text-success text-sm" : "text-destructive text-sm"}>{state.message}</p> : null;
}

/** `previous` names last year's locked RKA, when there is one to start from. */
export function OpenCycleForm({ fiscalYear, previous }: { fiscalYear: number; previous: string | null }) {
  const [state, action, pending] = useActionState(openCycle, INITIAL);
  const [year, setYear] = useState(String(fiscalYear));
  // Follows the year until Finance picks another date.
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <div className="grid gap-2">
        <Label htmlFor="cycle-year">Tahun anggaran</Label>
        <Input id="cycle-year" name="fiscalYear" type="number" value={year} onChange={(e) => setYear(e.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cycle-name">Nama versi</Label>
        <Input id="cycle-name" name="name" defaultValue={`RKA ${fiscalYear}`} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cycle-deadline">Batas pengajuan (17.00 WIB)</Label>
        <Input
          id="cycle-deadline"
          name="deadline"
          type="date"
          value={picked ?? (Number(year) ? defaultDeadline(Number(year)) : "")}
          onChange={(e) => setPicked(e.target.value)}
          required
        />
        <p className="text-muted-foreground text-xs">Batas pengajuan usulan oleh requestor; standarnya 31 Desember tahun berjalan.</p>
        {state.errors?.deadline ? <p className="text-destructive text-xs">{state.errors.deadline[0]}</p> : null}
      </div>
      <div className="grid gap-2 sm:col-span-3">
        <Label htmlFor="cycle-start">Mulai dari</Label>
        <select id="cycle-start" name="start" className={`${SELECT} max-w-xl`} defaultValue={previous ? "previous" : "empty"}>
          {previous ? <option value="previous">{previous} (terkunci): salin baris sebagai Draft</option> : null}
          <option value="empty">Kosong</option>
        </select>
        <p className="text-muted-foreground text-xs">
          {previous
            ? `Baris ${previous} disalin sebagai Draft, termasuk nominal bulanannya, untuk disesuaikan tiap unit. Totalnya menjadi pembanding RKA tahun lalu; realisasinya diisi Finance di menu Realisasi.`
            : "Belum ada RKA tahun lalu yang terkunci untuk dijadikan titik awal."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Membuka…" : "Buka siklus dan kirim email ke requestor"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function DeadlineForm({ versionId, current }: { versionId: string; current: string | null }) {
  const [state, action, pending] = useActionState(setDeadline, INITIAL);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <div className="grid gap-1">
        <Label htmlFor={`deadline-${versionId}`} className="text-xs">
          Ubah batas waktu
        </Label>
        <Input id={`deadline-${versionId}`} name="deadline" type="date" defaultValue={current ?? ""} className="h-8 w-40" required />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Simpan
      </Button>
      <Result state={state} />
    </form>
  );
}

export function ReviseForm({ versionId }: { versionId: string }) {
  const [state, action, pending] = useActionState(reviseVersion, INITIAL);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <div className="grid gap-1">
        <Label htmlFor={`start-${versionId}`} className="text-xs">
          Mulai revisi di
        </Label>
        <select id={`start-${versionId}`} name="start" className={`${SELECT} h-8`} defaultValue="finance_review">
          <option value="finance_review">Review Finance (Finance menyesuaikan)</option>
          <option value="draft">Draft (semua divisi mengisi ulang)</option>
        </select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`revdeadline-${versionId}`} className="text-xs">
          Batas waktu (opsional)
        </Label>
        <Input id={`revdeadline-${versionId}`} name="deadline" type="date" className="h-8 w-40" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        Buat revisi
      </Button>
      <Result state={state} />
    </form>
  );
}
