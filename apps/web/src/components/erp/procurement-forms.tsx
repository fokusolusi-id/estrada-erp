"use client";

import { useState, useTransition } from "react";
import { PO_ACTION_LABEL, type PoAction } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "./money-input";

type Result = { ok: boolean; message: string };
const SELECT = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";
const PANEL = "bg-muted/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-3";
type Option = { id: string; label: string };

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
const field = (label: string, input: React.ReactNode) => (
  <label className="grid gap-1 text-sm">
    <span className="text-muted-foreground text-xs">{label}</span>
    {input}
  </label>
);
const select = (label: string, value: string, onChange: (v: string) => void, options: readonly Option[], blank: string, disabled = false) =>
  field(
    label,
    <select aria-label={label} className={SELECT} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{blank}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>,
  );
const text = (label: string, value: string, onChange: (v: string) => void, type = "text") => field(label, <Input aria-label={label} type={type} value={value} onChange={(e) => onChange(e.target.value)} />);
const rupiah = (label: string, value: string, onChange: (v: string) => void) => field(label, <MoneyInput aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />);
const submit = (label: string, pending: boolean, message: React.ReactNode) => (
  <div className="flex flex-wrap items-end gap-3">
    <Button type="submit" disabled={pending}>
      {label}
    </Button>
    {message}
  </div>
);

export interface RequestValues {
  projectId: string;
  budgetLineId: string;
  description: string;
  estimate: string;
}

export function PurchaseRequestForm({
  projects,
  lines,
  onSave,
}: {
  projects: readonly (Option & { entity: string; year: number })[];
  lines: readonly (Option & { entity: string; year: number })[];
  onSave: (v: RequestValues) => Promise<Result>;
}) {
  const blank: RequestValues = { projectId: "", budgetLineId: "", description: "", estimate: "" };
  const [v, setV] = useState(blank);
  const { pending, run, message } = useResult();
  const project = projects.find((p) => p.id === v.projectId);
  return (
    <form aria-label="Permintaan pengadaan" className={PANEL} onSubmit={(e) => (e.preventDefault(), run(() => onSave(v), () => setV(blank)))}>
      {select("Proyek", v.projectId, (projectId) => setV({ ...v, projectId, budgetLineId: "" }), projects, "— Pilih proyek —")}
      {select("Baris RKA", v.budgetLineId, (budgetLineId) => setV({ ...v, budgetLineId }), lines.filter((l) => l.entity === project?.entity && l.year === project?.year), "— Pilih baris —", !project)}
      {text("Spesifikasi kebutuhan", v.description, (description) => setV({ ...v, description }))}
      {rupiah("Perkiraan nilai", v.estimate, (estimate) => setV({ ...v, estimate }))}
      {submit("Ajukan pengadaan", pending, message)}
    </form>
  );
}

export interface OrderValues {
  id: string | null;
  requestId: string;
  partnerId: string;
  productId: string;
  description: string;
  qty: string;
  unitPrice: string;
  orderedOn: string;
}

export function PurchaseOrderForm({
  requests,
  partners,
  products,
  returned,
  today,
  onSave,
}: {
  requests: readonly (Option & { description: string })[];
  partners: readonly Option[];
  products: readonly (Option & { partnerId: string })[];
  returned: readonly (OrderValues & { label: string })[];
  today: string;
  onSave: (v: OrderValues) => Promise<Result>;
}) {
  const blank: OrderValues = { id: null, requestId: "", partnerId: "", productId: "", description: "", qty: "1", unitPrice: "", orderedOn: today };
  const [v, setV] = useState(blank);
  const { pending, run, message } = useResult();
  const set = (k: keyof OrderValues) => (value: string) => setV({ ...v, [k]: value });
  return (
    <form aria-label="Purchase order" className={PANEL} onSubmit={(e) => (e.preventDefault(), run(() => onSave(v), () => setV(blank)))}>
      {returned.length
        ? select("Perbaiki PO yang dikembalikan", v.id ?? "", (id) => setV(returned.find((r) => r.id === id) ?? blank), returned.map((r) => ({ id: r.id!, label: r.label })), "— PO baru —")
        : null}
      {select("Permintaan pengadaan", v.requestId, (requestId) => setV({ ...v, requestId, description: requests.find((r) => r.id === requestId)?.description ?? "" }), requests, "— Pilih permintaan —", !!v.id)}
      {select("Mitra", v.partnerId, (partnerId) => setV({ ...v, partnerId, productId: "" }), partners, "— Pilih mitra —")}
      {select("Produk mitra (opsional)", v.productId, set("productId"), products.filter((p) => p.partnerId === v.partnerId), "—")}
      {text("Uraian", v.description, set("description"))}
      {text("Kuantitas", v.qty, set("qty"))}
      {rupiah("Harga satuan (exclude PPN)", v.unitPrice, set("unitPrice"))}
      {text("Tanggal PO", v.orderedOn, set("orderedOn"), "date")}
      {submit(v.id ? "Simpan perbaikan" : "Buat PO", pending, message)}
    </form>
  );
}

export function RequestDecision({ id, onDecide }: { id: string; onDecide: (id: string, approve: boolean, note: string) => Promise<Result> }) {
  const [note, setNote] = useState("");
  const { pending, run, message } = useResult();
  return (
    <div className="grid gap-2">
      <Input aria-label="Catatan cek budget" placeholder="Catatan (wajib untuk tolak)" className="h-8 w-56" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => run(() => onDecide(id, true, note))}>
          Setujui budget
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending || !note.trim()} onClick={() => run(() => onDecide(id, false, note))}>
          Tolak
        </Button>
      </div>
      {message}
    </div>
  );
}

export function PoActionsRow({ id, actions, onRun }: { id: string; actions: readonly PoAction[]; onRun: (id: string, action: PoAction, note: string) => Promise<Result> }) {
  const [note, setNote] = useState("");
  const { pending, run, message } = useResult();
  const needsNote = (a: PoAction) => a === "return" || a === "cancel";
  return (
    <div className="grid gap-2">
      {actions.some(needsNote) ? <Input aria-label="Catatan PO" placeholder="Catatan (kembalikan / batalkan)" className="h-8 w-56" value={note} onChange={(e) => setNote(e.target.value)} /> : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a} type="button" size="sm" variant={needsNote(a) ? "ghost" : "default"} disabled={pending || (needsNote(a) && !note.trim())} onClick={() => run(() => onRun(id, a, note))}>
            {PO_ACTION_LABEL[a]}
          </Button>
        ))}
      </div>
      {message}
    </div>
  );
}

export function GoodsReceiptForm({ orderId, today, onSave }: { orderId: string; today: string; onSave: (v: { orderId: string; receivedOn: string; amount: string; bastNumber: string; note: string }) => Promise<Result> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ receivedOn: today, amount: "", bastNumber: "", note: "" });
  const { pending, run, message } = useResult();
  if (!open) {
    return (
      <div className="grid justify-items-start gap-1">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          Catat penerimaan
        </Button>
        {message}
      </div>
    );
  }
  return (
    <form className="grid w-56 gap-2" onSubmit={(e) => (e.preventDefault(), run(() => onSave({ orderId, ...v }), () => setOpen(false)))}>
      <Input aria-label="Tanggal terima" type="date" max={today} className="h-8" value={v.receivedOn} onChange={(e) => setV({ ...v, receivedOn: e.target.value })} />
      <MoneyInput aria-label="Nilai diterima" placeholder="Nilai diterima" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
      <Input aria-label="Nomor BAST" placeholder="Nomor BAST" className="h-8" value={v.bastNumber} onChange={(e) => setV({ ...v, bastNumber: e.target.value })} />
      <Button type="submit" size="sm" disabled={pending}>
        Simpan BAST
      </Button>
      {message}
    </form>
  );
}
