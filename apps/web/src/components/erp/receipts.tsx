"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "./money-input";

type Result = { ok: boolean; message: string };
export interface ReceiptFields {
  receivedOn: string;
  amount: string;
  bankAccountId: string;
  reference: string;
  note: string;
}
export interface ReceiptRow {
  id: string;
  receivedOn: string;
  amount: string;
  bank: string;
  reference: string;
  by: string;
  /** Why it was taken back; null while it counts. */
  reversal: string | null;
}

const SELECT = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

/** An invoice's receipts and, for Cash Management, the form to record or reverse one. Figures arrive formatted. */
export function Receipts({
  rows,
  form,
  onRecord,
  onReverse,
}: {
  rows: readonly ReceiptRow[];
  /** Null for a reader, or when nothing more is expected. */
  form: { banks: readonly { id: string; label: string }[]; today: string; suggested: string } | null;
  onRecord: (v: ReceiptFields) => Promise<Result>;
  onReverse: ((id: string, reason: string) => Promise<Result>) | null;
}) {
  const blank = (): ReceiptFields => ({ receivedOn: form?.today ?? "", amount: form?.suggested ?? "", bankAccountId: form?.banks[0]?.id ?? "", reference: "", note: "" });
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
              <TableHead className="text-right">Nominal</TableHead>
              <TableHead>Rekening · referensi</TableHead>
              <TableHead>Dicatat oleh</TableHead>
              {onReverse ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`receipt-${r.id}`}>
                <TableCell className="whitespace-nowrap">{r.receivedOn}</TableCell>
                <TableCell className={`tabular text-right whitespace-nowrap ${r.reversal ? "text-muted-foreground line-through" : ""}`}>{r.amount}</TableCell>
                <TableCell className="whitespace-normal">
                  {r.bank} · {r.reference}
                  {r.reversal ? <div className="text-destructive text-xs">Dibatalkan: {r.reversal}</div> : null}
                </TableCell>
                <TableCell>{r.by}</TableCell>
                {onReverse ? (
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
        <p className="text-muted-foreground text-sm">Belum ada penerimaan.</p>
      )}
      {form ? (
        <form
          aria-label="Penerimaan baru"
          className="bg-muted/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await onRecord(v);
              setResult(res);
              if (res.ok) setV({ ...blank(), amount: "" });
            });
          }}
        >
          {field("Tanggal terima", <Input aria-label="Tanggal terima" type="date" value={v.receivedOn} onChange={(e) => setV({ ...v, receivedOn: e.target.value })} />)}
          {field("Nilai bayar", <MoneyInput aria-label="Nilai bayar" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />)}
          {field(
            "Rekening penerima",
            <select aria-label="Rekening penerima" className={SELECT} value={v.bankAccountId} onChange={(e) => setV({ ...v, bankAccountId: e.target.value })}>
              <option value="">— Pilih rekening —</option>
              {form.banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>,
          )}
          {field("Referensi mutasi bank", <Input aria-label="Referensi mutasi bank" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />)}
          {field("Catatan", <Input aria-label="Catatan" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />)}
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>
              Catat penerimaan
            </Button>
          </div>
        </form>
      ) : null}
      {result ? <p className={result.ok ? "text-success text-sm" : "text-destructive text-sm"}>{result.message}</p> : null}
    </div>
  );
}
