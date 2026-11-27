"use client";

import { useState, useTransition } from "react";
import { SPH_ACTION_LABEL, type SphAction } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "./money-input";

type Result = { ok: boolean; message: string };
export interface SphValues {
  id: string | null;
  dealId: string;
  issuedOn: string;
  price: string;
  cogs: string;
  description: string;
}

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

/** Write a new SPH, or correct a returned one picked from the list. */
export function SphForm({
  deals,
  returned,
  today,
  onSave,
}: {
  deals: readonly { id: string; label: string; value: string }[];
  returned: readonly (SphValues & { label: string })[];
  today: string;
  onSave: (v: SphValues) => Promise<Result>;
}) {
  const blank: SphValues = { id: null, dealId: "", issuedOn: today, price: "", cogs: "", description: "" };
  const [v, setV] = useState(blank);
  const { pending, run, message } = useResult();
  const field = (label: string, input: React.ReactNode) => (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      {input}
    </label>
  );
  const select = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";
  return (
    <form aria-label="SPH" className="bg-muted/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-3" onSubmit={(e) => (e.preventDefault(), run(() => onSave(v), () => setV(blank)))}>
      {returned.length
        ? field(
            "Perbaiki SPH yang dikembalikan",
            <select aria-label="Perbaiki SPH yang dikembalikan" className={select} value={v.id ?? ""} onChange={(e) => setV(returned.find((r) => r.id === e.target.value) ?? blank)}>
              <option value="">— SPH baru —</option>
              {returned.map((r) => (
                <option key={r.id} value={r.id!}>
                  {r.label}
                </option>
              ))}
            </select>,
          )
        : null}
      {field(
        "Deal",
        <select
          aria-label="Deal"
          className={select}
          value={v.dealId}
          disabled={!!v.id}
          onChange={(e) => setV({ ...v, dealId: e.target.value, price: deals.find((d) => d.id === e.target.value)?.value ?? "" })}
        >
          <option value="">— Pilih deal —</option>
          {deals.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>,
      )}
      {field("Tanggal SPH", <Input aria-label="Tanggal SPH" type="date" max={today} value={v.issuedOn} onChange={(e) => setV({ ...v, issuedOn: e.target.value })} />)}
      {field("Harga penawaran (exclude PPN)", <MoneyInput aria-label="Harga penawaran" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />)}
      {field("COGS", <MoneyInput aria-label="COGS" value={v.cogs} onChange={(e) => setV({ ...v, cogs: e.target.value })} />)}
      {field("Uraian / spesifikasi", <Input aria-label="Uraian SPH" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />)}
      <div className="flex flex-wrap items-end gap-3">
        <Button type="submit" disabled={pending}>
          {v.id ? "Simpan perbaikan" : "Buat SPH"}
        </Button>
        {message}
      </div>
    </form>
  );
}

export function SphActions({ id, actions, onRun }: { id: string; actions: readonly SphAction[]; onRun: (id: string, action: SphAction, note: string) => Promise<Result> }) {
  const [note, setNote] = useState("");
  const { pending, run, message } = useResult();
  return (
    <div className="grid gap-2">
      {actions.includes("return") ? <Input aria-label="Catatan SPH" placeholder="Catatan (wajib untuk kembalikan)" className="h-8 w-56" value={note} onChange={(e) => setNote(e.target.value)} /> : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a} type="button" size="sm" variant={a === "return" ? "ghost" : "default"} disabled={pending || (a === "return" && !note.trim())} onClick={() => run(() => onRun(id, a, note))}>
            {SPH_ACTION_LABEL[a]}
          </Button>
        ))}
      </div>
      {message}
    </div>
  );
}
