"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RISK_CATEGORIES, RISK_CATEGORY_LABEL, RISK_STATUS_LABEL, riskScore, severityOf, type RiskStatus } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = { ok: boolean; message: string; id?: string };
const FIELD = "border-input bg-background rounded-md border px-3 py-2 text-sm";
const SCALE = [1, 2, 3, 4, 5];

function useResult() {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<Result>, done?: (r: Result) => void) =>
    startTransition(async () => {
      const r = await work();
      setResult(r);
      if (r.ok) done?.(r);
    });
  const message = result ? <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-destructive"}`}>{result.message}</p> : null;
  return { pending, run, message };
}

const labelled = (label: string, control: React.ReactNode, wide = false) => (
  <label className={`grid gap-1 text-sm ${wide ? "sm:col-span-3" : ""}`}>
    <span className="text-muted-foreground text-xs">{label}</span>
    {control}
  </label>
);

const scale = (name: string, value: number, set: (n: number) => void) => (
  <select name={name} className={FIELD} value={value} onChange={(e) => set(Number(e.target.value))}>
    {SCALE.map((n) => (
      <option key={n} value={n}>{n}</option>
    ))}
  </select>
);

export interface RiskValues {
  id: string;
  entityCode: string;
  category: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  ownerUserId: string;
  actionPlan: string;
  dueOn: string;
}

export function RiskForm({ initial, companies, owners, onSave }: { initial: RiskValues; companies: { value: string; label: string }[]; owners: { id: string; name: string }[]; onSave: (form: FormData) => Promise<Result> }) {
  const router = useRouter();
  const [likelihood, setLikelihood] = useState(initial.likelihood);
  const [impact, setImpact] = useState(initial.impact);
  const { pending, run, message } = useResult();
  const score = riskScore(likelihood, impact);
  return (
    <form
      aria-label="Isian risiko"
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        run(() => onSave(data), (r) => !initial.id && r.id && router.push(`/risiko/${r.id}`));
      }}
    >
      <input type="hidden" name="id" value={initial.id} />
      {labelled("Judul", <Input name="title" defaultValue={initial.title} maxLength={200} />, true)}
      {labelled("Uraian", <textarea name="description" rows={2} className={FIELD} defaultValue={initial.description} />, true)}
      {labelled("Perusahaan", <select name="entityCode" className={FIELD} defaultValue={initial.entityCode}>{companies.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>)}
      {labelled("Kategori", <select name="category" className={FIELD} defaultValue={initial.category}>{RISK_CATEGORIES.map((c) => <option key={c} value={c}>{RISK_CATEGORY_LABEL[c]}</option>)}</select>)}
      {labelled("Pemilik", <select name="ownerUserId" className={FIELD} defaultValue={initial.ownerUserId}><option value="">Pilih pemilik</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>)}
      {labelled("Likelihood (1–5)", scale("likelihood", likelihood, setLikelihood))}
      {labelled("Impact (1–5)", scale("impact", impact, setImpact))}
      <p className="self-end pb-2 text-sm">Skor {score} · {severityOf(score).replace(/^./, (c) => c.toUpperCase())}</p>
      {labelled("Rencana aksi", <textarea name="actionPlan" rows={3} className={FIELD} defaultValue={initial.actionPlan} />, true)}
      {labelled("Tenggat", <Input type="date" name="dueOn" defaultValue={initial.dueOn} />)}
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>Simpan risiko</Button>
        {message}
      </div>
    </form>
  );
}

export function RiskLogForm({ id, likelihood, impact, statuses, onLog }: { id: string; likelihood: number; impact: number; statuses: RiskStatus[]; onLog: (form: FormData) => Promise<Result> }) {
  const [kind, setKind] = useState("action");
  const [l, setL] = useState(likelihood);
  const [i, setI] = useState(impact);
  const { pending, run, message } = useResult();
  return (
    <form
      aria-label="Catat tindakan risiko"
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        run(() => onLog(data), () => form.reset());
      }}
    >
      <input type="hidden" name="id" value={id} />
      {labelled("Jenis", <select name="kind" className={FIELD} value={kind} onChange={(e) => setKind(e.target.value)}><option value="action">Tindakan</option><option value="review">Review skor</option><option value="status">Ubah status</option></select>)}
      {kind === "review" ? (
        <>
          {labelled("Likelihood (1–5)", scale("likelihood", l, setL))}
          {labelled("Impact (1–5)", scale("impact", i, setI))}
        </>
      ) : null}
      {kind === "status" ? labelled("Status baru", <select name="status" className={FIELD}>{statuses.map((s) => <option key={s} value={s}>{RISK_STATUS_LABEL[s]}</option>)}</select>) : null}
      {labelled("Catatan", <textarea name="note" rows={2} className={FIELD} />, true)}
      {labelled("Bukti (PDF atau gambar, maks 4 MB)", <Input type="file" name="document" accept="application/pdf,image/jpeg,image/png,image/webp" />, true)}
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>Catat</Button>
        {message}
      </div>
    </form>
  );
}
