"use client";

import type { HiddenColumns } from "@estrada/domain";
import { Save } from "lucide-react";
import { useState, useTransition } from "react";
import { formatIdr, money, parseIdr, parsePaste, type Money } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MoneyCell } from "./money-cell";
import { VarianceCell } from "./variance-cell";

/** A line whose prior-year actual Finance types in; amounts as plain decimal strings. */
export interface ActualLine {
  id: string;
  coaCode: string;
  coaName: string;
  item?: string;
  entity: string;
  ownerUnit: string;
  /** Total RKA 2027. */
  plan: string;
  priorRka?: string;
  priorActual?: string;
}

type Result = { ok: boolean; message: string };

const plain = (m: Money) => formatIdr(m, { unit: "rp" }).replace(/^(-?)Rp /, "$1");
/** Blank clears the actual; anything else must read as rupiah. */
function read(text: string): { ok: true; value: Money | null } | { ok: false } {
  if (!text.trim()) return { ok: true, value: null };
  try {
    return { ok: true, value: parseIdr(text) };
  } catch {
    return { ok: false };
  }
}

/**
 * Last year's actual for each line of the year being planned, typed or pasted by Finance once a year.
 * A column copied from Excel pastes down the rows; only changed rows are saved, in one go.
 */
export function ActualEntry({
  lines,
  priorYear,
  onSave,
  hide = {},
}: {
  lines: ActualLine[];
  /** The year the actuals belong to: the year before the one being planned. */
  priorYear: number;
  onSave: (changes: { id: string; actual: string | null }[]) => Promise<Result>;
  /** Columns the header has narrowed to one value. */
  hide?: Partial<HiddenColumns>;
}) {
  const initial = (l: ActualLine) => (l.priorActual ? plain(money(l.priorActual)) : "");
  const [text, setText] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, initial(l)])));
  const [saved, setSaved] = useState<Record<string, string>>(text);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const shown = lines
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(({ l }) => !q || `${l.coaCode} ${l.coaName} ${l.item ?? ""}`.toLowerCase().includes(q));
  const changed = lines.filter((l) => (text[l.id] ?? "") !== (saved[l.id] ?? ""));
  const invalid = changed.some((l) => !read(text[l.id] ?? "").ok);

  const paste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const column = parsePaste(e.clipboardData.getData("text/plain") ?? e.clipboardData.getData("text")).map((r) => r[0] ?? "");
    if (column.length < 2) return; // a single value pastes natively
    e.preventDefault();
    setText((t) => {
      const next = { ...t };
      column.forEach((v, k) => {
        const target = shown[index + k];
        if (target) next[target.l.id] = v.trim();
      });
      return next;
    });
  };

  const save = () =>
    startTransition(async () => {
      const changes = changed.map((l) => {
        const r = read(text[l.id] ?? "");
        return { id: l.id, actual: r.ok && r.value ? r.value.toFixed() : null };
      });
      const res = await onSave(changes);
      setMessage(res);
      if (res.ok) setSaved(text);
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input aria-label="Cari COA atau uraian" placeholder="Cari COA atau uraian" className="h-8 max-w-xs" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3">
          {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
          <Button type="button" disabled={!changed.length || invalid || pending} onClick={save}>
            <Save aria-hidden /> Simpan ({changed.length})
          </Button>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>COA</TableHead>
            {hide.entity ? null : <TableHead>Entitas</TableHead>}
            {hide.owner ? null : <TableHead>Pemilik</TableHead>}
            <TableHead className="text-right">RKA {priorYear}</TableHead>
            <TableHead className="min-w-44 text-right">Actual {priorYear}</TableHead>
            <TableHead className="text-right">RKA {priorYear + 1}</TableHead>
            <TableHead className="text-right">Perubahan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map(({ l, n }, index) => {
            const value = text[l.id] ?? "";
            const r = read(value);
            const dirty = value !== (saved[l.id] ?? "");
            return (
              <TableRow key={l.id} className={cn(dirty && "bg-warning/5")}>
                <TableCell>
                  <div className="font-medium">{l.coaCode}</div>
                  <div className="text-muted-foreground text-xs">{l.item || l.coaName}</div>
                </TableCell>
                {hide.entity ? null : <TableCell>{l.entity}</TableCell>}
                {hide.owner ? null : <TableCell>{l.ownerUnit}</TableCell>}
                <TableCell className="text-right">{l.priorRka ? <MoneyCell value={money(l.priorRka)} unit="rp" /> : "—"}</TableCell>
                <TableCell>
                  <Input
                    aria-label={`Actual ${priorYear} baris ${n}`}
                    inputMode="decimal"
                    className="tabular h-8 text-right"
                    value={value}
                    aria-invalid={!r.ok}
                    onChange={(e) => setText((t) => ({ ...t, [l.id]: e.target.value }))}
                    onPaste={(e) => paste(index, e)}
                    onBlur={() => {
                      if (r.ok && r.value && plain(r.value) !== value) setText((t) => ({ ...t, [l.id]: plain(r.value!) }));
                    }}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyCell value={money(l.plan)} unit="rp" />
                </TableCell>
                <TableCell className="text-right" data-testid={`actual-change-${n}`}>
                  <VarianceCell plan={money(l.plan)} base={r.ok ? r.value : null} unit="rp" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
