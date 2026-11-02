"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatIdr, headcountMonths, money, parseIdr, sum, type Money } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MONTHS } from "./budget-grid";
import { MoneyCell } from "./money-cell";

/** A saved position, serialisable to the client: cost per head as a plain decimal string. */
export interface PlanPosition {
  id?: string;
  position: string;
  entityCode: string;
  coaCode: string;
  count: number;
  startMonth: number;
  costPerHead: string;
}

type Result = { ok: boolean; message: string; id?: string; errors?: Record<string, string> };

interface Row extends Omit<PlanPosition, "costPerHead" | "count"> {
  key: string;
  /** Raw text as typed; parsed on every render. */
  count: string;
  cost: string;
  dirty: boolean;
  errors: Record<string, string>;
}

const SELECT =
  "border-input h-8 w-full min-w-24 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive";

const plain = (m: Money) => formatIdr(m, { unit: "rp" }).replace(/^(-?)Rp /, "$1");
function tryParse(text: string): Money | null {
  try {
    return parseIdr(text);
  } catch {
    return null;
  }
}

let seq = 0;
const toRow = (p: PlanPosition): Row => ({
  key: p.id ?? `new-${++seq}`,
  ...(p.id ? { id: p.id } : {}),
  position: p.position,
  entityCode: p.entityCode,
  coaCode: p.coaCode,
  startMonth: p.startMonth,
  count: String(p.count),
  cost: p.costPerHead ? plain(money(p.costPerHead)) : "",
  dirty: !p.id,
  errors: {},
});

/**
 * The requestor's headcount plan: one row per position. Each saved row writes its own draft line, with months
 * computed from heads × cost per head from the start month, so no one types a head count into a cost cell.
 */
export function HeadcountPlan({
  positions,
  masters,
  defaultCoa,
  defaultEntity,
  onSave,
  onDelete,
}: {
  positions: PlanPosition[];
  masters: { coa: { code: string; name: string }[]; entities: string[] };
  defaultCoa: string;
  defaultEntity: string;
  onSave: (p: PlanPosition) => Promise<Result>;
  onDelete: (id: string) => Promise<Result>;
}) {
  const [all, setRows] = useState<Row[]>(() => positions.map(toRow));
  // A position the page once listed and no longer does was sent from the draft editor; hide it here.
  const ids = positions.flatMap((p) => (p.id ? [p.id] : []));
  const [seen, setSeen] = useState(() => new Set(ids));
  if (ids.some((id) => !seen.has(id))) setSeen(new Set([...seen, ...ids]));
  const rows = all.filter((r) => !r.id || !seen.has(r.id) || ids.includes(r.id));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, dirty: true, errors: {} } : r)));

  const read = (r: Row) => {
    const cost = tryParse(r.cost);
    const count = Number(r.count);
    return cost && Number.isInteger(count) && count > 0 ? { cost, count } : null;
  };

  const save = (r: Row) => {
    const v = read(r);
    if (!v) return;
    startTransition(async () => {
      const res = await onSave({
        ...(r.id ? { id: r.id } : {}),
        position: r.position,
        entityCode: r.entityCode,
        coaCode: r.coaCode,
        count: v.count,
        startMonth: r.startMonth,
        costPerHead: v.cost.toFixed(),
      });
      setMessage({ ok: res.ok, text: res.message });
      setRows((rs) => rs.map((x) => (x.key !== r.key ? x : res.ok ? { ...x, id: res.id ?? x.id, dirty: false, errors: {} } : { ...x, errors: res.errors ?? {} })));
    });
  };

  const remove = (r: Row) => {
    if (!r.id) {
      setRows((rs) => rs.filter((x) => x.key !== r.key));
      return;
    }
    startTransition(async () => {
      const res = await onDelete(r.id!);
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) setRows((rs) => rs.filter((x) => x.key !== r.key));
    });
  };

  const add = () =>
    setRows((rs) => [...rs, toRow({ position: "", entityCode: defaultEntity, coaCode: defaultCoa, count: 1, startMonth: 1, costPerHead: "" })]);

  const error = (r: Row, field: string) => (r.errors[field] ? <span className="text-destructive text-xs">{r.errors[field]}</span> : null);

  return (
    <div className="grid gap-3">
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">Jabatan</TableHead>
              <TableHead className="min-w-28">Entitas</TableHead>
              <TableHead className="min-w-40">COA</TableHead>
              <TableHead className="min-w-20 text-right">Jumlah orang</TableHead>
              <TableHead className="min-w-24">Mulai</TableHead>
              <TableHead className="min-w-36 text-right">Biaya per orang / bulan</TableHead>
              <TableHead className="text-right">Total RKA</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const n = i + 1;
              const v = read(r);
              const total = v ? sum(headcountMonths({ position: r.position, count: v.count, startMonth: r.startMonth, costPerHead: v.cost })) : null;
              return (
                <TableRow key={r.key} className={cn(r.dirty && "bg-warning/5")}>
                  <TableCell>
                    <Input aria-label={`Jabatan posisi ${n}`} placeholder="mis. Account Manager" className="h-8" value={r.position} aria-invalid={!!r.errors.position} onChange={(e) => update(r.key, { position: e.target.value })} />
                    {error(r, "position")}
                  </TableCell>
                  <TableCell>
                    <select aria-label={`Entitas posisi ${n}`} className={SELECT} value={r.entityCode} onChange={(e) => update(r.key, { entityCode: e.target.value })}>
                      {masters.entities.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                    {error(r, "entityCode")}
                  </TableCell>
                  <TableCell>
                    <select aria-label={`COA posisi ${n}`} className={SELECT} value={r.coaCode} onChange={(e) => update(r.key, { coaCode: e.target.value })}>
                      {masters.coa.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} · {c.name}
                        </option>
                      ))}
                    </select>
                    {error(r, "coaCode")}
                  </TableCell>
                  <TableCell>
                    <Input aria-label={`Jumlah orang posisi ${n}`} inputMode="numeric" className="tabular h-8 text-right" value={r.count} aria-invalid={!!r.errors.count || !v} onChange={(e) => update(r.key, { count: e.target.value })} />
                    {error(r, "count")}
                  </TableCell>
                  <TableCell>
                    <select aria-label={`Mulai posisi ${n}`} className={SELECT} value={r.startMonth} onChange={(e) => update(r.key, { startMonth: Number(e.target.value) })}>
                      {MONTHS.map((m, k) => (
                        <option key={m} value={k + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Biaya per orang posisi ${n}`}
                      inputMode="decimal"
                      className="tabular h-8 text-right"
                      value={r.cost}
                      aria-invalid={!!r.errors.costPerHead || !tryParse(r.cost)}
                      onChange={(e) => update(r.key, { cost: e.target.value })}
                      onBlur={() => {
                        const m = tryParse(r.cost);
                        if (m && plain(m) !== r.cost) setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, cost: plain(m) } : x)));
                      }}
                    />
                    {error(r, "costPerHead")}
                  </TableCell>
                  <TableCell className="bg-accent/50 text-right font-medium" data-testid={`headcount-total-${n}`}>
                    {total ? <MoneyCell value={total} unit="rp" /> : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button type="button" size="sm" aria-label={`Simpan posisi ${n}`} disabled={!v || !r.dirty || pending} onClick={() => save(r)}>
                        Simpan
                      </Button>
                      <Button type="button" size="sm" variant="ghost" aria-label={`Hapus posisi ${n}`} disabled={pending} onClick={() => remove(r)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground py-4 text-center text-sm">Belum ada posisi yang direncanakan.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={add}>
          <Plus /> Tambah posisi
        </Button>
        {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.text}</p> : null}
      </div>
    </div>
  );
}
