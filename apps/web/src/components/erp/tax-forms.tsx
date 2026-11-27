"use client";

import { useState, useTransition } from "react";
import { TAX_STATUSES, TAX_STATUS_LABEL, type TaxKind, type TaxStatus } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "./money-input";

type Result = { ok: boolean; message: string };
const SELECT = "border-input h-8 rounded-md border bg-transparent px-2 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

function useResult() {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<Result>, done?: () => void) =>
    startTransition(async () => {
      const r = await work();
      setResult(r);
      if (r.ok) done?.();
    });
  const message = result ? <p role="status" className={`text-xs ${result.ok ? "text-success" : "text-destructive"}`}>{result.message}</p> : null;
  return { pending, run, message };
}

/** Accounting's number, date and status for one faktur or bukti potong, opened from its row. */
export function TaxDocumentForm({
  kind,
  sourceId,
  current,
  today,
  onSave,
}: {
  kind: TaxKind;
  sourceId: string;
  current: { number: string; date: string; status: TaxStatus } | null;
  today: string;
  onSave: (v: { kind: TaxKind; sourceId: string; number: string; date: string; status: TaxStatus }) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(current ?? { number: "", date: today, status: "recorded" as TaxStatus });
  const { pending, run, message } = useResult();
  if (!open) {
    return (
      <div className="grid justify-items-start gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
          {current ? "Ubah" : "Catat"}
        </Button>
        {message}
      </div>
    );
  }
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => (e.preventDefault(), run(() => onSave({ kind, sourceId, ...v }), () => setOpen(false)))}>
      <Input aria-label="Nomor dokumen pajak" placeholder="Nomor" className="h-8 w-48" value={v.number} onChange={(e) => setV({ ...v, number: e.target.value })} />
      <Input aria-label="Tanggal dokumen pajak" type="date" max={today} className="h-8 w-38" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
      <select aria-label="Status dokumen pajak" className={SELECT} value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as TaxStatus })}>
        {TAX_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TAX_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending}>
        Simpan
      </Button>
      {message}
    </form>
  );
}

export function Pph21Form({
  period,
  entities,
  amounts,
  onSave,
}: {
  period: string;
  entities: readonly string[];
  /** What each company has for the month, formatted. */
  amounts: Readonly<Record<string, string>>;
  onSave: (v: { entityCode: string; period: string; amount: string }) => Promise<Result>;
}) {
  const [entityCode, setEntity] = useState(entities[0] ?? "");
  const [amount, setAmount] = useState(amounts[entities[0] ?? ""] ?? "");
  const { pending, run, message } = useResult();
  return (
    <form aria-label="PPh 21" className="bg-muted/30 flex flex-wrap items-end gap-3 rounded-lg border p-4" onSubmit={(e) => (e.preventDefault(), run(() => onSave({ entityCode, period, amount })))}>
      <label className="grid gap-1 text-sm">
        <span className="text-muted-foreground text-xs">Entitas</span>
        <select aria-label="Entitas PPh 21" className={`${SELECT} h-9`} value={entityCode} onChange={(e) => (setEntity(e.target.value), setAmount(amounts[e.target.value] ?? ""))}>
          {entities.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted-foreground text-xs">PPh 21 bulan ini (Rp)</span>
        <MoneyInput aria-label="PPh 21 bulan ini" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <Button type="submit" disabled={pending}>
        Simpan PPh 21
      </Button>
      {message}
    </form>
  );
}
