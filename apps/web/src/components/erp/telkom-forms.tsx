"use client";

import { useState, useTransition } from "react";
import { ASSURANCE_LABEL, type AssuranceArea } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = { ok: boolean; message: string };
const SELECT = "border-input h-8 rounded-md border bg-transparent px-2 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:opacity-70";

function useResult() {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<Result>, done?: () => void) =>
    startTransition(async () => {
      const r = await work();
      setResult(r);
      if (r.ok) done?.();
    });
  const message = result ? <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-destructive"}`}>{result.message}</p> : null;
  return { pending, run, message };
}

export function StartTracking({ projectId, today, onStart }: { projectId: string; today: string; onStart: (projectId: string, startedOn: string) => Promise<Result> }) {
  const [on, setOn] = useState(today);
  const { pending, run, message } = useResult();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="Tanggal mulai pelacakan" type="date" max={today} className="h-8 w-40" value={on} onChange={(e) => setOn(e.target.value)} />
      <Button type="button" size="sm" disabled={pending} onClick={() => run(() => onStart(projectId, on))}>
        Mulai pelacakan
      </Button>
      {message}
    </div>
  );
}

/** Records the stage in hand: its date and evidence, or "not applicable" where allowed. */
export function StageForm({ projectId, stage, optional, today, onSave }: { projectId: string; stage: number; optional: boolean; today: string; onSave: (form: FormData) => Promise<Result> }) {
  const [skip, setSkip] = useState(false);
  const { pending, run, message } = useResult();
  return (
    <form
      aria-label={`Tahap ${stage}`}
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        run(() => onSave(data));
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="stage" value={stage} />
      <Input name="doneOn" aria-label="Tanggal selesai" type="date" max={today} defaultValue={today} className="h-8 w-40" />
      {optional ? (
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="notApplicable" value="1" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Tidak berlaku
        </label>
      ) : null}
      {skip ? null : <Input name="document" aria-label="Dokumen bukti" type="file" accept=".pdf,image/*" className="h-8 w-56" />}
      <Input name="note" aria-label="Catatan tahap" placeholder={skip ? "Alasan (wajib)" : "Catatan"} className="h-8 w-48" />
      <Button type="submit" size="sm" disabled={pending}>
        Simpan tahap
      </Button>
      {message}
    </form>
  );
}

export function ReopenStage({ projectId, onReopen }: { projectId: string; onReopen: (projectId: string, reason: string) => Promise<Result> }) {
  const [reason, setReason] = useState("");
  const { pending, run, message } = useResult();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="Alasan membatalkan tahap" placeholder="Alasan membatalkan tahap terakhir" className="h-8 w-64" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button type="button" size="sm" variant="ghost" disabled={pending || reason.trim().length < 5} onClick={() => run(() => onReopen(projectId, reason), () => setReason(""))}>
        Batalkan tahap terakhir
      </Button>
      {message}
    </div>
  );
}

export function ObstacleForm({ projectId, stages, onAdd }: { projectId: string; stages: readonly { no: number; name: string }[]; onAdd: (v: { projectId: string; stage: number; issue: string; cause: string }) => Promise<Result> }) {
  const [v, setV] = useState({ stage: stages[0]?.no ?? 1, issue: "", cause: "" });
  const { pending, run, message } = useResult();
  return (
    <form aria-label="Kendala baru" className="flex flex-wrap items-center gap-2" onSubmit={(e) => (e.preventDefault(), run(() => onAdd({ projectId, ...v }), () => setV({ ...v, issue: "", cause: "" })))}>
      <select aria-label="Tahap kendala" className={SELECT} value={v.stage} onChange={(e) => setV({ ...v, stage: Number(e.target.value) })}>
        {stages.map((s) => (
          <option key={s.no} value={s.no}>
            {s.no}. {s.name}
          </option>
        ))}
      </select>
      <Input aria-label="Kendala" placeholder="Kendala" className="h-8 w-64" value={v.issue} onChange={(e) => setV({ ...v, issue: e.target.value })} />
      <Input aria-label="Penyebab" placeholder="Penyebab NOK" className="h-8 w-56" value={v.cause} onChange={(e) => setV({ ...v, cause: e.target.value })} />
      <Button type="submit" size="sm" disabled={pending}>
        Tambah kendala
      </Button>
      {message}
    </form>
  );
}

export function ObstacleUpdate({ id, onUpdate }: { id: string; onUpdate: (id: string, update: string, resolved: boolean) => Promise<Result> }) {
  const [text, setText] = useState("");
  const { pending, run, message } = useResult();
  const send = (resolved: boolean) => run(() => onUpdate(id, text, resolved), () => setText(""));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="Perkembangan kendala" placeholder="Perkembangan terakhir" className="h-8 w-56" value={text} onChange={(e) => setText(e.target.value)} />
      <Button type="button" size="sm" variant="outline" disabled={pending || text.trim().length < 3} onClick={() => send(false)}>
        Simpan
      </Button>
      <Button type="button" size="sm" disabled={pending || text.trim().length < 3} onClick={() => send(true)}>
        Selesai
      </Button>
      {message}
    </div>
  );
}

export function AssuranceSelect({ projectId, area, standing, disabled, onSave }: { projectId: string; area: AssuranceArea; standing: "none" | "progress" | "done"; disabled: boolean; onSave: (projectId: string, area: AssuranceArea, standing: "none" | "progress" | "done") => Promise<Result> }) {
  const [value, setValue] = useState(standing);
  const { pending, run, message } = useResult();
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{ASSURANCE_LABEL[area]}</span>
      <select
        aria-label={`JPMB ${ASSURANCE_LABEL[area]}`}
        className={SELECT}
        disabled={disabled || pending}
        value={value}
        onChange={(e) => {
          const next = e.target.value as typeof standing;
          setValue(next);
          run(() => onSave(projectId, area, next));
        }}
      >
        <option value="none">—</option>
        <option value="progress">In progress</option>
        <option value="done">Done</option>
      </select>
      {message}
    </label>
  );
}
