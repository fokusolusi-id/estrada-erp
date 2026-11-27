"use client";

import { useState, useTransition } from "react";
import { CASH_ENTRY_KINDS, CASH_ENTRY_LABEL, type CashEntryKind } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "./money-input";

type Result = { ok: boolean; message: string };
export interface CashEntryFields {
  entityCode: string;
  onDate: string;
  kind: CashEntryKind;
  amount: string;
  coaCode: string;
  description: string;
}
export interface CashEntryRow {
  id: string;
  date: string;
  entity: string;
  kind: string;
  amount: string;
  description: string;
  by: string;
  /** Why it was taken back; null while it counts. */
  reversal: string | null;
}

const SELECT = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

/** The month's typed cash movements and, for Cash Management, the form to add or reverse one. Figures arrive formatted. */
export function CashEntries({
  rows,
  form,
  onRecord,
  onReverse,
}: {
  rows: readonly CashEntryRow[];
  /** Null for a reader. */
  form: { entities: readonly string[]; accounts: readonly { code: string; label: string }[]; today: string } | null;
  onRecord: (v: CashEntryFields) => Promise<Result>;
  onReverse: (id: string, reason: string) => Promise<Result>;
}) {
  const blank = (): CashEntryFields => ({ entityCode: form?.entities[0] ?? "", onDate: form?.today ?? "", kind: "cost", amount: "", coaCode: "", description: "" });
  const [v, setV] = useState(blank);
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const field = (label: string, input: React.ReactNode) => (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      {input}
    </label>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Entitas</TableHead>
              <TableHead>Jenis · keterangan</TableHead>
              <TableHead className="text-right">Nominal</TableHead>
              <TableHead>Dicatat oleh</TableHead>
              {form ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`entry-${r.id}`}>
                <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                <TableCell>{r.entity}</TableCell>
                <TableCell className="min-w-56 whitespace-normal">
                  {r.kind} · {r.description}
                  {r.reversal ? <div className="text-destructive text-xs">Dibatalkan: {r.reversal}</div> : null}
                </TableCell>
                <TableCell className={`tabular text-right whitespace-nowrap ${r.reversal ? "text-muted-foreground line-through" : ""}`}>{r.amount}</TableCell>
                <TableCell>{r.by}</TableCell>
                {form ? (
                  <TableCell>
                    {r.reversal ? null : reversing === r.id ? (
                      <div className="flex flex-wrap gap-2">
                        <Input aria-label="Alasan pembatalan" className="h-8 w-48" value={reason} onChange={(e) => setReason(e.target.value)} />
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending || reason.trim().length < 5}
                          onClick={() =>
                            startTransition(async () => {
                              const res = await onReverse(r.id, reason);
                              setResult(res);
                              if (res.ok) setReversing(null);
                            })
                          }
                        >
                          Konfirmasi
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setReason("");
                          setReversing(r.id);
                        }}
                      >
                        Batalkan
                      </Button>
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-sm">Belum ada transaksi yang diketik pada bulan ini.</p>
      )}
      {form ? (
        <form
          aria-label="Transaksi kas baru"
          className="bg-muted/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await onRecord(v);
              setResult(res);
              if (res.ok) setV({ ...v, amount: "", description: "" });
            });
          }}
        >
          {field(
            "Entitas",
            <select aria-label="Entitas" className={SELECT} value={v.entityCode} onChange={(e) => setV({ ...v, entityCode: e.target.value })}>
              {form.entities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>,
          )}
          {field("Tanggal", <Input aria-label="Tanggal" type="date" max={form.today} value={v.onDate} onChange={(e) => setV({ ...v, onDate: e.target.value })} />)}
          {field(
            "Jenis",
            <select aria-label="Jenis" className={SELECT} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as CashEntryKind })}>
              {CASH_ENTRY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CASH_ENTRY_LABEL[k]}
                </option>
              ))}
            </select>,
          )}
          {field("Nominal", <MoneyInput aria-label="Nominal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />)}
          {v.kind === "cost"
            ? field(
                "Akun COA",
                <select aria-label="Akun COA" className={SELECT} value={v.coaCode} onChange={(e) => setV({ ...v, coaCode: e.target.value })}>
                  <option value="">— Pilih akun —</option>
                  {form.accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.label}
                    </option>
                  ))}
                </select>,
              )
            : null}
          {field("Keterangan", <Input aria-label="Keterangan" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />)}
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>
              Catat transaksi
            </Button>
          </div>
        </form>
      ) : null}
      {result ? <p className={result.ok ? "text-success text-sm" : "text-destructive text-sm"}>{result.message}</p> : null}
    </div>
  );
}
