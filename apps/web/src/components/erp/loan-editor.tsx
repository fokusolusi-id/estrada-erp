"use client";

import { Landmark, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { formatIdr, money, parseIdr } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MONTHS } from "./budget-grid";
import { MoneyCell } from "./money-cell";
import { MoneyInput } from "./money-input";
import { EmptyState } from "./empty-state";

/** A facility in Obligo Pinjaman Bank; amounts as plain decimal strings, the rate as a yearly fraction. */
export interface LoanRow {
  id: string;
  name: string;
  type: "existing" | "new";
  entity: string;
  rate: string;
  openingBalance: string;
  creditLimit: string | null;
  notes: string | null;
  drawdown: string[];
  repayment: string[];
  outstandingEnd: string;
  interestTotal: string;
}
export type LoanSave = Omit<LoanRow, "id" | "outstandingEnd" | "interestTotal"> & { id: string | null };
type Result = { ok: boolean; message: string };

const SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";
const shown = (s: string | null) => (s && s !== "0" ? formatIdr(money(s), { unit: "rp" }).replace(/^(-?)Rp /, "$1") : "");
const plain = (s: string): string | null => {
  if (!s.trim()) return "0";
  try {
    return parseIdr(s).toFixed();
  } catch {
    return null;
  }
};
const percent = (fraction: string) => `${money(fraction).times(100).toFixed().replace(".", ",")}%`;

/** Obligo: Finance lists the bank facilities and each month's drawdown and repayment; interest follows the outstanding. */
export function LoanEditor({
  facilities,
  entities,
  editable,
  onSave,
  onDelete,
}: {
  facilities: LoanRow[];
  entities: readonly string[];
  editable: boolean;
  onSave: (f: LoanSave) => Promise<Result>;
  onDelete: (id: string) => Promise<Result>;
}) {
  const [editing, setEditing] = useState<LoanSave | null>(null);
  const [message, setMessage] = useState<Result | null>(null);
  const zeros = Array.from({ length: 12 }, () => "0");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
        {editable ? (
          <Button
            type="button"
            onClick={() => setEditing({ id: null, name: "", type: "new", entity: entities[0] ?? "", rate: "0", openingBalance: "0", creditLimit: null, notes: null, drawdown: zeros, repayment: zeros })}
          >
            <Plus aria-hidden /> Tambah fasilitas
          </Button>
        ) : null}
      </div>
      {editing ? (
        <LoanForm
          key={editing.id ?? "new"}
          initial={editing}
          entities={entities}
          onCancel={() => setEditing(null)}
          onSave={async (f) => {
            const res = await onSave(f);
            setMessage(res);
            if (res.ok) setEditing(null);
          }}
          onDelete={
            editing.id
              ? async () => {
                  const res = await onDelete(editing.id!);
                  setMessage(res);
                  if (res.ok) setEditing(null);
                }
              : null
          }
        />
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fasilitas</TableHead>
            <TableHead>Entitas</TableHead>
            <TableHead className="text-right">Suku bunga</TableHead>
            <TableHead className="text-right">Saldo awal</TableHead>
            <TableHead className="text-right">Outstanding Des</TableHead>
            <TableHead className="text-right">Bunga setahun</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {facilities.length ? (
            facilities.map((f) => (
              <TableRow key={f.id} data-testid={`loan-${f.id}`}>
                <TableCell className="max-w-72 whitespace-normal">
                  <div className="font-medium">{f.name}</div>
                  <div className="text-muted-foreground text-xs">{f.type === "existing" ? "Existing" : "Baru"}</div>
                </TableCell>
                <TableCell>{f.entity}</TableCell>
                <TableCell className="tabular text-right">{percent(f.rate)}</TableCell>
                <TableCell className="text-right">
                  <MoneyCell value={money(f.openingBalance)} />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyCell value={money(f.outstandingEnd)} />
                </TableCell>
                <TableCell className="text-right" data-testid="interest">
                  <MoneyCell value={money(f.interestTotal)} />
                </TableCell>
                <TableCell>
                  {editable ? (
                    <Button type="button" variant="ghost" size="sm" aria-label={`Ubah ${f.name}`} onClick={() => setEditing({ ...f })}>
                      Ubah
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={7}>
                <EmptyState icon={Landmark} title="Belum ada fasilitas pinjaman." description={editable ? "Tambah fasilitas untuk memasukkan pinjaman bank dan bunganya ke arus kas." : undefined} />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function LoanForm({
  initial,
  entities,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: LoanSave;
  entities: readonly string[];
  onSave: (f: LoanSave) => Promise<void>;
  onDelete: (() => Promise<void>) | null;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    ...initial,
    rate: initial.rate === "0" ? "" : money(initial.rate).times(100).toFixed().replace(".", ","),
    openingBalance: shown(initial.openingBalance),
    creditLimit: shown(initial.creditLimit),
    drawdown: initial.drawdown.map(shown),
    repayment: initial.repayment.map(shown),
  });
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<typeof f>) => setF((cur) => ({ ...cur, ...patch }));

  const rate = plain(f.rate);
  const opening = plain(f.openingBalance);
  const limit = f.creditLimit?.trim() ? plain(f.creditLimit) : "";
  const drawdown = f.drawdown.map(plain);
  const repayment = f.repayment.map(plain);
  const valid =
    !!f.name.trim() && rate !== null && money(rate).gte(0) && money(rate).lte(100) && opening !== null && limit !== null && [...drawdown, ...repayment].every((x) => x !== null && !money(x).isNegative());
  const save = (): LoanSave => ({
    id: f.id,
    name: f.name.trim(),
    type: f.type,
    entity: f.entity,
    rate: money(rate!).div(100).toFixed(),
    openingBalance: opening!,
    creditLimit: limit || null,
    notes: f.notes?.trim() || null,
    drawdown: drawdown as string[],
    repayment: repayment as string[],
  });
  const text = (label: string, value: string, onChange: (v: string) => void, kind: "text" | "number" | "money" = "text") => (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      {kind === "money" ? (
        <MoneyInput aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input aria-label={label} inputMode={kind === "number" ? "decimal" : undefined} className={kind === "number" ? "tabular text-right" : undefined} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
  const grid = (label: string, values: string[], key: "drawdown" | "repayment") => (
    <TableRow>
      <TableCell className="bg-background sticky left-0 font-medium">{label}</TableCell>
      {MONTHS.map((m, i) => (
        <TableCell key={m}>
          <Input
            aria-label={`${label} ${m}`}
            inputMode="decimal"
            className="tabular h-8 min-w-32 text-right"
            value={values[i]}
            onChange={(e) => set({ [key]: values.map((v, j) => (j === i ? e.target.value : v)) } as Partial<typeof f>)}
          />
        </TableCell>
      ))}
    </TableRow>
  );

  return (
    <form
      aria-label="Fasilitas"
      className="bg-muted/30 grid gap-3 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) startTransition(() => onSave(save()));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {text("Nama fasilitas", f.name, (v) => set({ name: v }))}
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Jenis</span>
          <select aria-label="Jenis fasilitas" className={SELECT} value={f.type} onChange={(e) => set({ type: e.target.value as LoanSave["type"] })}>
            <option value="existing">Existing</option>
            <option value="new">Baru</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Entitas</span>
          <select aria-label="Entitas fasilitas" className={SELECT} value={f.entity} onChange={(e) => set({ entity: e.target.value })}>
            {entities.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        {text("Suku bunga (%)", f.rate, (v) => set({ rate: v }), "number")}
        {text("Saldo awal 1 Jan", f.openingBalance, (v) => set({ openingBalance: v }), "money")}
        {text("Plafon", f.creditLimit ?? "", (v) => set({ creditLimit: v }), "money")}
        <div className="sm:col-span-2">{text("Keterangan", f.notes ?? "", (v) => set({ notes: v }))}</div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="bg-background sticky left-0">Pokok</TableHead>
            {MONTHS.map((m) => (
              <TableHead key={m} className="text-right">
                {m}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {grid("Penarikan", f.drawdown, "drawdown")}
          {grid("Pelunasan", f.repayment, "repayment")}
        </TableBody>
      </Table>
      <div className="flex flex-wrap justify-end gap-2">
        {onDelete ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => startTransition(onDelete)}>
            Hapus fasilitas
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" disabled={!valid || pending}>
          Simpan fasilitas
        </Button>
      </div>
    </form>
  );
}
