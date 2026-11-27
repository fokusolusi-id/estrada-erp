"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "./money-input";

type Result = { ok: boolean; message: string };
export interface BalanceValues {
  entityCode: string;
  period: string;
  currentAssets: string;
  totalAssets: string;
  currentLiabilities: string;
  totalLiabilities: string;
  equity: string;
}
const FIELDS = [
  ["currentAssets", "Aset lancar"],
  ["totalAssets", "Total aset"],
  ["currentLiabilities", "Liabilitas jangka pendek"],
  ["totalLiabilities", "Total liabilitas"],
  ["equity", "Ekuitas"],
] as const;

/** One company's month-end totals. Equity is a plain field because it may be negative. */
export function BalanceForm({ initial, onSave }: { initial: BalanceValues; onSave: (v: BalanceValues) => Promise<Result> }) {
  const [v, setV] = useState(initial);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      aria-label={`Neraca ${initial.entityCode}`}
      className="bg-muted/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => setResult(await onSave(v)));
      }}
    >
      {FIELDS.map(([key, label]) => {
        const props = { "aria-label": `${label} ${initial.entityCode}`, value: v[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [key]: e.target.value }) };
        return (
          <label key={key} className="grid gap-1 text-sm">
            <span className="text-muted-foreground text-xs">{label} (Rp)</span>
            {key === "equity" ? <Input inputMode="decimal" className="tabular text-right" {...props} /> : <MoneyInput {...props} />}
          </label>
        );
      })}
      <div className="flex flex-wrap items-end gap-3">
        <Button type="submit" disabled={pending}>
          Simpan neraca
        </Button>
        {result ? <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-destructive"}`}>{result.message}</p> : null}
      </div>
    </form>
  );
}
