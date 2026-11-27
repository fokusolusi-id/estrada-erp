"use client";

import { useState, useTransition } from "react";
import { ADJUSTMENT_KINDS, ADJUSTMENT_KIND_LABEL, formatIdr, money, type AdjustmentKind } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Result = { ok: boolean; message: string };
export interface AdjustmentInput {
  entity: string;
  unit: string;
  coaCode: string;
  date: string;
  kind: AdjustmentKind;
  amount: string;
  reason: string;
}

const SELECT = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

/** Accounting's accruals and corrections for the year, and the form to add one. */
export function Adjustments({
  rows,
  options,
  onSave,
}: {
  rows: readonly { id: string; date: string; entity: string; unit: string; coaCode: string; kind: AdjustmentKind; amount: string; reason: string; by: string }[];
  /** Null for a reader. */
  options: { entities: readonly string[]; units: readonly string[]; coa: readonly { code: string; name: string }[]; today: string } | null;
  onSave: (input: AdjustmentInput) => Promise<Result>;
}) {
  const blank = (): AdjustmentInput => ({ entity: options?.entities[0] ?? "", unit: options?.units[0] ?? "", coaCode: options?.coa[0]?.code ?? "", date: options?.today ?? "", kind: "accrual", amount: "", reason: "" });
  const [v, setV] = useState(blank);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const field = (label: string, name: keyof AdjustmentInput, choices?: readonly { value: string; label: string }[], type = "text") => (
    <label className={`grid gap-1 text-sm ${name === "reason" ? "sm:col-span-2" : ""}`}>
      <span className="text-muted-foreground text-xs">{label}</span>
      {choices ? (
        <select aria-label={label} className={SELECT} value={v[name]} onChange={(e) => setV({ ...v, [name]: e.target.value })}>
          {choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      ) : (
        <Input aria-label={label} type={type} value={v[name]} onChange={(e) => setV({ ...v, [name]: e.target.value })} />
      )}
    </label>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {options ? (
        <form
          aria-label="Penyesuaian baru"
          className="bg-muted/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await onSave(v);
              setResult(r);
              if (r.ok) setV(blank());
            });
          }}
        >
          {field("Tanggal", "date", undefined, "date")}
          {field("Entitas", "entity", options.entities.map((x) => ({ value: x, label: x })))}
          {field("Cost center", "unit", options.units.map((x) => ({ value: x, label: x })))}
          {field("COA", "coaCode", options.coa.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` })))}
          {field("Jenis", "kind", ADJUSTMENT_KINDS.map((k) => ({ value: k, label: ADJUSTMENT_KIND_LABEL[k] })))}
          {field("Nominal (negatif untuk mengurangi)", "amount")}
          {field("Alasan", "reason")}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
            <Button type="submit" disabled={pending}>
              Simpan penyesuaian
            </Button>
            {result ? <p className={result.ok ? "text-success text-sm" : "text-destructive text-sm"}>{result.message}</p> : null}
          </div>
        </form>
      ) : null}
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Entitas · unit · COA</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead className="text-right">Nominal</TableHead>
              <TableHead>Alasan</TableHead>
              <TableHead>Dicatat oleh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`adjustment-${r.id}`}>
                <TableCell className="tabular whitespace-nowrap">{r.date}</TableCell>
                <TableCell>
                  {r.entity} · {r.unit} · {r.coaCode}
                </TableCell>
                <TableCell>{ADJUSTMENT_KIND_LABEL[r.kind]}</TableCell>
                <TableCell className="tabular text-right whitespace-nowrap">{formatIdr(money(r.amount))}</TableCell>
                <TableCell className="whitespace-normal">{r.reason}</TableCell>
                <TableCell>{r.by}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-sm">Belum ada penyesuaian pada tahun ini.</p>
      )}
    </div>
  );
}
