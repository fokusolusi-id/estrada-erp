"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PERIOD_TYPES, PERIOD_TYPE_LABEL, REPORT_ACTION_LABEL, REPORT_KINDS, REPORT_KIND_LABEL, periodLabel, reportMonths, type PeriodType, type ReportAction } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = { ok: boolean; message: string; id?: string };
const SELECT = "border-input bg-background h-9 rounded-md border px-3 text-sm";

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

export function GenerateReportForm({ year, month, companies, onGenerate }: { year: number; month: number; companies: { value: string; label: string }[]; onGenerate: (form: FormData) => Promise<Result> }) {
  const router = useRouter();
  const [type, setType] = useState<PeriodType>("month");
  const { pending, run, message } = useResult();
  const numbers = Array.from({ length: 12 }, (_, i) => i + 1).filter((n) => reportMonths(type, n).length);
  const labelled = (label: string, control: React.ReactNode) => (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      {control}
    </label>
  );
  return (
    <form
      aria-label="Buat laporan"
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        run(() => onGenerate(data), (r) => r.id && router.push(`/laporan/${r.id}`));
      }}
    >
      {labelled("Jenis", <select name="kind" className={SELECT}>{REPORT_KINDS.map((k) => <option key={k} value={k}>{REPORT_KIND_LABEL[k]}</option>)}</select>)}
      {labelled("Perusahaan", <select name="company" className={SELECT}>{companies.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>)}
      {labelled("Periode", <select name="periodType" className={SELECT} value={type} onChange={(e) => setType(e.target.value as PeriodType)}>{PERIOD_TYPES.map((t) => <option key={t} value={t}>{PERIOD_TYPE_LABEL[t]}</option>)}</select>)}
      {labelled("Tahun", <Input name="year" type="number" defaultValue={year} className="w-24" />)}
      {labelled(
        "Ke",
        <select key={type} name="periodNo" className={SELECT} defaultValue={numbers.find((n) => reportMonths(type, n).includes(month)) ?? 1}>
          {numbers.map((n) => <option key={n} value={n}>{type === "year" ? "Setahun" : periodLabel(type, n, year).replace(` ${year}`, "")}</option>)}
        </select>,
      )}
      <Button type="submit" disabled={pending}>Buat draft</Button>
      {message}
    </form>
  );
}

export function ReportActions({ id, actions, onAction }: { id: string; actions: ReportAction[]; onAction: (id: string, action: ReportAction, note: string) => Promise<Result> }) {
  const [note, setNote] = useState("");
  const { pending, run, message } = useResult();
  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      {actions.includes("return") ? <Input aria-label="Alasan pengembalian" placeholder="Alasan bila dikembalikan" value={note} onChange={(e) => setNote(e.target.value)} className="w-72" /> : null}
      {actions.map((a) => (
        <Button key={a} variant={a === "return" ? "outline" : "default"} disabled={pending} onClick={() => run(() => onAction(id, a, note))}>
          {REPORT_ACTION_LABEL[a]}
        </Button>
      ))}
      {message}
    </div>
  );
}
