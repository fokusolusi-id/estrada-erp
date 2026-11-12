"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatIdr, parseIdr, PAYMENT_KIND_LABEL, type PaymentKind } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "./money-input";

export interface PaymentFormValues {
  kind: PaymentKind;
  entity: string;
  project: string;
  budgetLineId: string;
  description: string;
  payeeName: string;
  payeeBank: string;
  payeeAccount: string;
  dueOn: string;
  gross: string;
  ppn: string;
  pph: string;
}

export interface LineOption {
  id: string;
  entity: string;
  label: string;
}

type Result = { ok: boolean; message: string; id?: string };

const AREA =
  "border-input w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";
const SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

export const EMPTY_PAYMENT: PaymentFormValues = {
  kind: "payment",
  entity: "",
  project: "",
  budgetLineId: "",
  description: "",
  payeeName: "",
  payeeBank: "",
  payeeAccount: "",
  dueOn: "",
  gross: "",
  ppn: "",
  pph: "",
};

const amount = (s: string) => {
  try {
    return parseIdr(s);
  } catch {
    return null;
  }
};

/**
 * The request itself: what is paid, to whom, charged to which RKA line, and the amounts. Documents are attached on the
 * request page once it is saved as a Draft.
 */
export function PaymentForm({
  initial,
  entities,
  lines,
  versionNote,
  onSave,
}: {
  initial: PaymentFormValues;
  entities: string[];
  lines: LineOption[];
  /** Said beside the RKA line choice, e.g. that the RKA is not locked yet. */
  versionNote?: string;
  onSave: (v: PaymentFormValues) => Promise<Result>;
}) {
  const router = useRouter();
  const [v, setV] = useState<PaymentFormValues>({ ...initial, entity: initial.entity || entities[0] || "" });
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof PaymentFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value, ...(k === "entity" ? { budgetLineId: "" } : {}) }));

  const entityLines = lines.filter((l) => l.entity === v.entity);
  const nett = useMemo(() => {
    const [g, n, h] = [amount(v.gross), amount(v.ppn), amount(v.pph)];
    return g && n && h ? g.plus(n).minus(h) : null;
  }, [v.gross, v.ppn, v.pph]);

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await onSave(v);
          setResult(r);
          if (r.ok && r.id) router.push(`/pembayaran/${r.id}`);
          else if (r.ok) router.refresh();
        });
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Jenis</legend>
        <div className="flex flex-wrap gap-4">
          {(Object.keys(PAYMENT_KIND_LABEL) as PaymentKind[]).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="radio" name="kind" value={k} checked={v.kind === k} onChange={set("kind")} className="accent-primary" />
              {PAYMENT_KIND_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="pay-entity">Entitas</Label>
          <select id="pay-entity" className={SELECT} value={v.entity} onChange={set("entity")}>
            {entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pay-project">Proyek / perusahaan</Label>
          <Input id="pay-project" value={v.project} onChange={set("project")} placeholder="mis. Managed Service Bank X" />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="pay-line">Baris RKA</Label>
          <select id="pay-line" className={SELECT} value={v.budgetLineId} onChange={set("budgetLineId")}>
            <option value="">— Pilih baris RKA —</option>
            {entityLines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            {entityLines.length ? "Pembayaran tercatat sebagai Realisasi baris ini setelah dibayar." : "Belum ada baris RKA untuk entitas ini di unit Anda."}
            {versionNote ? ` ${versionNote}` : ""}
          </p>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="pay-desc">Deskripsi pembayaran</Label>
          <textarea id="pay-desc" className={AREA} value={v.description} onChange={set("description")} rows={2} placeholder="mis. Tagihan sewa server Oktober 2026, invoice INV-1029" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="pay-payee">Dibayar kepada</Label>
          <Input id="pay-payee" value={v.payeeName} onChange={set("payeeName")} placeholder="Nama vendor / penerima" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pay-payee-bank">Bank tujuan</Label>
          <Input id="pay-payee-bank" value={v.payeeBank} onChange={set("payeeBank")} placeholder="mis. BCA" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pay-payee-acc">Nomor rekening tujuan</Label>
          <Input id="pay-payee-acc" value={v.payeeAccount} onChange={set("payeeAccount")} className="font-mono" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="grid gap-2">
          <Label htmlFor="pay-gross">Nominal (DPP)</Label>
          <MoneyInput id="pay-gross" value={v.gross} onChange={set("gross")} placeholder="0" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pay-ppn">PPN</Label>
          <MoneyInput id="pay-ppn" value={v.ppn} onChange={set("ppn")} placeholder="0" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pay-pph">PPh dipotong</Label>
          <MoneyInput id="pay-pph" value={v.pph} onChange={set("pph")} placeholder="0" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pay-due">Jatuh tempo</Label>
          <Input id="pay-due" type="date" value={v.dueOn} onChange={set("dueOn")} />
        </div>
      </div>
      <p className="text-sm" data-testid="payment-nett">
        Nominal Pembayaran (nett):{" "}
        <span className="tabular font-semibold">{nett ? formatIdr(nett) : <span className="text-destructive">angka tidak terbaca</span>}</span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan draft"}
        </Button>
        {result ? <p className={result.ok ? "text-success text-sm" : "text-destructive text-sm"}>{result.message}</p> : null}
      </div>
    </form>
  );
}
