"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface BankAccountRow {
  id: string;
  entity: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  active: boolean;
}

export type BankAccountInput = Omit<BankAccountRow, "id"> & { id: string | null };
type Result = { ok: boolean; message: string };

const SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";
const GRID = "grid grid-cols-1 items-center gap-2 md:grid-cols-[7rem_10rem_minmax(0,1fr)_minmax(0,1fr)_4.5rem_5.5rem] md:gap-3";

function AccountForm({ row, entities, onSave }: { row: BankAccountInput; entities: string[]; onSave: (a: BankAccountInput) => Promise<Result> }) {
  const [v, setV] = useState(row);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const isNew = row.id === null;
  const set = (k: keyof BankAccountInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((p) => ({ ...p, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const save = () =>
    startTransition(async () => {
      const r = await onSave(v);
      setResult(r);
      if (r.ok && isNew) setV(row);
    });

  return (
    <form
      className={GRID}
      data-testid={isNew ? "bank-new" : `bank-${row.id}`}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {isNew ? (
        <select aria-label="Entitas" className={SELECT} value={v.entity} onChange={set("entity")}>
          {entities.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-muted-foreground text-sm md:invisible">{v.entity}</span>
      )}
      <Input aria-label="Nama bank" placeholder="mis. BCA" value={v.bankName} onChange={set("bankName")} required />
      <Input aria-label="Nomor rekening" placeholder="Nomor rekening" className="font-mono" value={v.accountNumber} onChange={set("accountNumber")} required />
      <Input aria-label="Atas nama" placeholder="Atas nama" value={v.accountName} onChange={set("accountName")} required />
      {isNew ? (
        <span />
      ) : (
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" aria-label="Aktif" className="accent-primary" checked={v.active} onChange={set("active")} /> Aktif
        </label>
      )}
      <Button type="submit" size="sm" variant={isNew ? "default" : "outline"} disabled={pending}>
        {isNew ? "Tambah" : "Simpan"}
      </Button>
      {result ? <p className={`md:col-span-full text-sm ${result.ok ? "text-success" : "text-destructive"}`}>{result.message}</p> : null}
    </form>
  );
}

/** Bank asal per entitas: the accounts Cash Management chooses from when it schedules a payment. */
export function BankAccounts({ accounts, entities, onSave }: { accounts: BankAccountRow[]; entities: string[]; onSave: (a: BankAccountInput) => Promise<Result> }) {
  const groups = entities.map((e) => ({ entity: e, rows: accounts.filter((a) => a.entity === e) })).filter((g) => g.rows.length);
  return (
    <div className="grid gap-4">
      <div className={`text-muted-foreground hidden border-b pb-2 text-xs font-medium uppercase tracking-wide md:grid ${GRID}`}>
        <span>Entitas</span>
        <span>Bank</span>
        <span>Nomor rekening</span>
        <span>Atas nama</span>
        <span>Status</span>
        <span />
      </div>
      {groups.length ? (
        groups.map((g) => (
          <section key={g.entity} data-testid={`bank-entity-${g.entity}`} className="grid gap-2">
            <h3 className="text-sm font-semibold">{g.entity}</h3>
            <div className="divide-border divide-y border-b *:py-2">
              {g.rows.map((r) => (
                <AccountForm key={r.id} row={r} entities={entities} onSave={onSave} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <p className="text-muted-foreground text-sm">Belum ada rekening.</p>
      )}
      <div className="bg-muted/40 -mx-2 rounded-lg border border-dashed p-3">
        <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">Tambah rekening</p>
        <AccountForm row={{ id: null, entity: entities[0] ?? "", bankName: "", accountNumber: "", accountName: "", active: true }} entities={entities} onSave={onSave} />
      </div>
    </div>
  );
}
