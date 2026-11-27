"use client";

import { useState, useTransition } from "react";
import { KPI_ACTION_LABEL, type KpiAction } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "./money-input";

type Result = { ok: boolean; message: string };
export interface KpiValues {
  revenue: string;
  revenueDirect: string;
  ebitdaPct: string;
  cashIn: string;
  netMarginPct: string;
}

function useResult() {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<Result>) => startTransition(async () => setResult(await work()));
  const message = result ? <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-destructive"}`}>{result.message}</p> : null;
  return { pending, run, message };
}

const MONEY: [keyof KpiValues, string][] = [
  ["revenue", "Target revenue won bidding (Rp)"],
  ["revenueDirect", "Di antaranya Direct (Rp)"],
  ["cashIn", "Target cash-in (Rp)"],
];
const PERCENT: [keyof KpiValues, string][] = [
  ["ebitdaPct", "Target EBITDA %"],
  ["netMarginPct", "Target Net Margin %"],
];

/** A company Direktur's targets for the year, with the board decision to attach. */
export function KpiForm({ year, entity, initial, onSave }: { year: number; entity: string; initial: KpiValues; onSave: (form: FormData) => Promise<Result> }) {
  const [v, setV] = useState(initial);
  const { pending, run, message } = useResult();
  const field = (key: keyof KpiValues, label: string, money: boolean) => (
    <label key={key} className="grid gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      {money ? (
        <MoneyInput name={key} aria-label={`${label} ${entity}`} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
      ) : (
        <Input name={key} aria-label={`${label} ${entity}`} inputMode="decimal" className="tabular text-right" value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
      )}
    </label>
  );
  return (
    <form
      aria-label={`Target KPI ${entity}`}
      className="bg-muted/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        run(() => onSave(data));
      }}
    >
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="entityCode" value={entity} />
      {MONEY.map(([k, l]) => field(k, l, true))}
      {PERCENT.map(([k, l]) => field(k, l, false))}
      <label className="grid gap-1 text-sm">
        <span className="text-muted-foreground text-xs">Keputusan direksi (PDF / foto)</span>
        <Input name="document" type="file" accept=".pdf,image/*" aria-label={`Keputusan direksi ${entity}`} />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <Button type="submit" disabled={pending}>
          Simpan target
        </Button>
        {message}
      </div>
    </form>
  );
}

export function KpiActions({ id, actions, onRun }: { id: string; actions: readonly KpiAction[]; onRun: (id: string, action: KpiAction, note: string) => Promise<Result> }) {
  const [note, setNote] = useState("");
  const { pending, run, message } = useResult();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.includes("return") ? <Input aria-label="Catatan KPI" placeholder="Catatan (wajib untuk kembalikan)" className="h-8 w-64" value={note} onChange={(e) => setNote(e.target.value)} /> : null}
      {actions.map((a) => (
        <Button key={a} type="button" size="sm" variant={a === "return" ? "ghost" : "default"} disabled={pending || (a === "return" && !note.trim())} onClick={() => run(() => onRun(id, a, note))}>
          {KPI_ACTION_LABEL[a]}
        </Button>
      ))}
      {message}
    </div>
  );
}
