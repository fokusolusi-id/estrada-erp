"use client";

import { useState, useTransition } from "react";
import { money, sum, ZERO, type Money } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyCell } from "./money-cell";

export interface EntityBasisRow {
  entity: string;
  /** Revenue for the year as a plain decimal string. */
  revenue: string;
  heads: number | null;
}

type Result = { ok: boolean; message: string };

const percent = (part: Money, total: Money) =>
  total.isZero() ? "—" : `${part.div(total).times(100).toFixed(2).replace(".", ",")}%`;

/** The two computed bases side by side: revenue share from the RKA, headcount share from what Finance types. */
export function EntityBases({ rows, editable, onSave }: { rows: EntityBasisRow[]; editable: boolean; onSave: (heads: Record<string, number>) => Promise<Result> }) {
  const [text, setText] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.entity, r.heads === null ? "" : String(r.heads)])));
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = Object.values(text).every((v) => /^\d*$/.test(v.trim()));
  const heads = (e: string) => (/^\d+$/.test(text[e]!.trim()) ? money(text[e]!.trim()) : ZERO);
  const revenueTotal = sum(rows.map((r) => money(r.revenue)));
  const headTotal = sum(rows.map((r) => heads(r.entity)));

  const save = () =>
    startTransition(async () => {
      const filled = Object.fromEntries(Object.entries(text).filter(([, v]) => v.trim()).map(([e, v]) => [e, Number(v.trim())]));
      setMessage(await onSave(filled));
    });

  return (
    <div className="grid gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Entitas</TableHead>
            <TableHead className="text-right">Pendapatan</TableHead>
            <TableHead className="text-right">Porsi pendapatan</TableHead>
            <TableHead className="text-right">Headcount</TableHead>
            <TableHead className="text-right">Porsi headcount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.entity}>
              <TableCell className="font-medium">{r.entity}</TableCell>
              <TableCell className="text-right">
                <MoneyCell value={money(r.revenue)} unit="rp" />
              </TableCell>
              <TableCell className="tabular text-right" data-testid={`revenue-share-${r.entity}`}>
                {percent(money(r.revenue), revenueTotal)}
              </TableCell>
              <TableCell className="text-right">
                <Input
                  aria-label={`Headcount ${r.entity}`}
                  inputMode="numeric"
                  className="tabular ml-auto h-8 w-24 text-right"
                  disabled={!editable}
                  value={text[r.entity]}
                  aria-invalid={!/^\d*$/.test(text[r.entity]!.trim())}
                  onChange={(e) => setText((t) => ({ ...t, [r.entity]: e.target.value }))}
                />
              </TableCell>
              <TableCell className="tabular text-right" data-testid={`headcount-share-${r.entity}`}>
                {percent(heads(r.entity), headTotal)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editable ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
          <Button type="button" variant="outline" disabled={!valid || pending} onClick={save}>
            Simpan headcount
          </Button>
        </div>
      ) : null}
    </div>
  );
}
