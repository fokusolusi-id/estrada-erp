"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PPH_DEFAULT_RATE, PPH_LABEL, PPH_TYPES, dueDate, formatIdr, invoiceAmounts, money, parseIdr, type PphType } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "./money-input";

export interface InvoiceValues {
  description: string;
  revenueCoa: string;
  penalty: string;
  fine: string;
  pphType: PphType;
  pphRate: string;
  invoicedOn: string;
  bankAccountId: string;
}

type Result = { ok: boolean; message: string; id?: string };

const SELECT = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

const read = (s: string) => {
  try {
    return parseIdr(s || "0");
  } catch {
    return null;
  }
};

/** The invoice's editable fields with the figures worked out as they are typed. */
export function InvoiceFormFields({
  initial,
  billed,
  wapu,
  termDays,
  banks,
  accounts,
  onSave,
}: {
  initial: InvoiceValues;
  /** The termin's amount, excluding PPN. */
  billed: string;
  wapu: boolean;
  termDays: number | null;
  banks: readonly { id: string; label: string }[];
  accounts: readonly { code: string; label: string }[];
  onSave: (v: InvoiceValues) => Promise<Result>;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<InvoiceValues>) => setV((p) => ({ ...p, ...patch }));
  const [penalty, fine, rate] = [read(v.penalty), read(v.fine), /^\d{1,3}([.,]\d{1,2})?$/.test(v.pphRate) ? money(v.pphRate.replace(",", ".")) : null];
  const a = penalty && fine && rate ? invoiceAmounts({ billed: money(billed), penalty, fine, wapu, pphRate: rate }) : null;
  const figure = (label: string, value: string, strong = false) => (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
  const text = (id: string, label: string, input: React.ReactNode, wide = false) => (
    <div className={`grid gap-2 ${wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {input}
    </div>
  );

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await onSave(v);
          setResult(r);
          if (r.ok && r.id) router.push(`/invoice/${r.id}`);
          else if (r.ok) router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {text("inv-desc", "Uraian", <Input id="inv-desc" value={v.description} onChange={(e) => set({ description: e.target.value })} />, true)}
        {text(
          "inv-account",
          "Akun pendapatan",
          <select id="inv-account" className={SELECT} value={v.revenueCoa} onChange={(e) => set({ revenueCoa: e.target.value })}>
            <option value="">— Pilih akun —</option>
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </select>,
          true,
        )}
        {text("inv-date", "Tanggal invoice", <Input id="inv-date" type="date" value={v.invoicedOn} onChange={(e) => set({ invoicedOn: e.target.value })} />)}
        {text(
          "inv-bank",
          "Rekening bank penerima",
          <select id="inv-bank" className={SELECT} value={v.bankAccountId} onChange={(e) => set({ bankAccountId: e.target.value })}>
            <option value="">— Pilih rekening —</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>,
        )}
        {text("inv-penalty", "Penalti / restitusi", <MoneyInput id="inv-penalty" value={v.penalty} placeholder="0" onChange={(e) => set({ penalty: e.target.value })} />)}
        {text("inv-fine", "Denda", <MoneyInput id="inv-fine" value={v.fine} placeholder="0" onChange={(e) => set({ fine: e.target.value })} />)}
        {text(
          "inv-pph-type",
          "Jenis PPh",
          <select id="inv-pph-type" className={SELECT} value={v.pphType} onChange={(e) => set({ pphType: e.target.value as PphType, pphRate: PPH_DEFAULT_RATE[e.target.value as PphType] })}>
            {PPH_TYPES.map((t) => (
              <option key={t} value={t}>
                {PPH_LABEL[t]}
              </option>
            ))}
          </select>,
        )}
        {text("inv-pph-rate", "Tarif PPh (%)", <Input id="inv-pph-rate" inputMode="decimal" className="tabular text-right" value={v.pphRate} onChange={(e) => set({ pphRate: e.target.value })} />)}
      </div>
      <dl className="bg-muted/40 grid max-w-md gap-1 rounded-lg p-4 text-sm" data-testid="invoice-figures">
        {figure("Tagihan termin", formatIdr(money(billed)))}
        {figure("DPP", a ? formatIdr(a.dpp) : "—")}
        {figure(wapu ? "PPN 11% (dipungut customer)" : "PPN 11%", a ? formatIdr(a.ppn) : "—")}
        {figure("Nilai invoice", a ? formatIdr(a.total) : "—", true)}
        {figure("PPh dipotong customer", a ? formatIdr(a.pph) : "—")}
        {figure("Diperkirakan diterima", a ? formatIdr(a.receivable) : "—", true)}
        {figure("Jatuh tempo", v.invoicedOn ? dueDate(v.invoicedOn, termDays) : "—")}
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan draft"}
        </Button>
        {result ? <p className={result.ok ? "text-success text-sm" : "text-destructive text-sm"}>{result.message}</p> : null}
      </div>
    </form>
  );
}
