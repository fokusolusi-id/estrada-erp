"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";
import { ALLOCATION_BASES, ALLOCATION_PROBLEM_LABEL, BASIS_LABEL, fixedProblem, money, type AllocationBasis } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MoneyCell } from "./money-cell";

/** A cost line Finance may mark as shared; amounts as plain decimal strings. */
export interface SharedCostLine {
  id: string;
  coaCode: string;
  coaName: string;
  item?: string;
  entity: string;
  ownerUnit: string;
  total: string;
  basis?: AllocationBasis;
  fixed?: Record<string, string>;
  /** False once the line is locked: the final RKA keeps the split it was locked with. */
  editable?: boolean;
}

export interface SharedCostChange {
  id: string;
  basis: AllocationBasis | null;
  fixed: Record<string, string> | null;
}

type Result = { ok: boolean; message: string };
type Rule = { basis: AllocationBasis | ""; fixed: Record<string, string> };

const SELECT =
  "border-input h-8 w-full rounded-md border bg-transparent px-2 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:opacity-60";

const key = (r: Rule) => (r.basis === "fixed" ? `fixed:${JSON.stringify(r.fixed)}` : r.basis);
const typed = (fixed: Record<string, string>) => Object.fromEntries(Object.entries(fixed).filter(([, v]) => v.trim()));

/** Finance marks which cost lines are shared and how each splits across the entities; reports do the split. */
export function SharedCostEditor({ lines, entities, onSave }: { lines: SharedCostLine[]; entities: readonly string[]; onSave: (changes: SharedCostChange[]) => Promise<Result> }) {
  const initial = () => Object.fromEntries(lines.map((l) => [l.id, { basis: l.basis ?? "", fixed: l.fixed ?? {} } as Rule]));
  const [rules, setRules] = useState<Record<string, Rule>>(initial);
  const [saved, setSaved] = useState<Record<string, Rule>>(rules);
  const [query, setQuery] = useState("");
  const [onlyShared, setOnlyShared] = useState(false);
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const shown = lines
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(({ l }) => (!onlyShared || rules[l.id]!.basis) && (!q || `${l.coaCode} ${l.coaName} ${l.item ?? ""}`.toLowerCase().includes(q)));
  const changed = lines.filter((l) => key(rules[l.id]!) !== key(saved[l.id]!));
  const problemOf = (id: string) => {
    const r = rules[id]!;
    return r.basis === "fixed" ? fixedProblem(typed(r.fixed), entities) : null;
  };
  const invalid = changed.some((l) => problemOf(l.id));
  const set = (id: string, patch: Partial<Rule>) => setRules((all) => ({ ...all, [id]: { ...all[id]!, ...patch } }));

  const save = () =>
    startTransition(async () => {
      const changes = changed.map((l) => {
        const r = rules[l.id]!;
        return { id: l.id, basis: r.basis || null, fixed: r.basis === "fixed" ? typed(r.fixed) : null };
      });
      const res = await onSave(changes);
      setMessage(res);
      if (res.ok) setSaved(rules);
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <Input aria-label="Cari COA atau uraian" placeholder="Cari COA atau uraian" className="h-8 max-w-xs" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="flex items-center gap-2">
            <input id="only-shared" type="checkbox" className="size-4" checked={onlyShared} onChange={(e) => setOnlyShared(e.target.checked)} />
            <Label htmlFor="only-shared">Hanya biaya bersama</Label>
          </div>
        </div>
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
            <TableHead>Entitas</TableHead>
            <TableHead>Pemilik</TableHead>
            <TableHead className="text-right">Total RKA</TableHead>
            <TableHead className="min-w-56">Dasar alokasi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map(({ l, n }) => {
            const r = rules[l.id]!;
            const problem = problemOf(l.id);
            const dirty = key(r) !== key(saved[l.id]!);
            return (
              <TableRow key={l.id} className={cn(dirty && "bg-warning/5")}>
                <TableCell>
                  <div className="font-medium">{l.coaCode}</div>
                  <div className="text-muted-foreground text-xs">{l.item || l.coaName}</div>
                </TableCell>
                <TableCell>{l.entity}</TableCell>
                <TableCell>{l.ownerUnit}</TableCell>
                <TableCell className="text-right">
                  <MoneyCell value={money(l.total)} unit="rp" />
                </TableCell>
                <TableCell>
                  <div className="grid gap-2">
                    <select
                      aria-label={`Dasar alokasi baris ${n}`}
                      className={SELECT}
                      value={r.basis}
                      disabled={l.editable === false}
                      onChange={(e) => set(l.id, { basis: e.target.value as Rule["basis"] })}
                    >
                      <option value="">Bukan biaya bersama</option>
                      {ALLOCATION_BASES.map((b) => (
                        <option key={b} value={b}>
                          {BASIS_LABEL[b]}
                        </option>
                      ))}
                    </select>
                    {r.basis === "fixed" ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {entities.map((e) => (
                          <label key={e} className="grid gap-1 text-xs">
                            <span className="text-muted-foreground">{e}</span>
                            <Input
                              aria-label={`${e} % baris ${n}`}
                              inputMode="decimal"
                              className="tabular h-8 text-right"
                              disabled={l.editable === false}
                              value={r.fixed[e] ?? ""}
                              onChange={(ev) => set(l.id, { fixed: { ...r.fixed, [e]: ev.target.value } })}
                            />
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {problem ? <p className="text-destructive text-xs">{ALLOCATION_PROBLEM_LABEL[problem]}</p> : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
