"use client";

import { useState, useTransition, type ClipboardEvent, type KeyboardEvent } from "react";
import { ArrowRightToLine, Info, Plus, Save, Send, Trash2, TriangleAlert } from "lucide-react";
import { fillRight, formatIdr, money, parseIdr, parsePaste, sum, ZERO, type Money } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DiscussionLink, MONTHS } from "./budget-grid";
import type { Remark } from "./approval-timeline";
import { MoneyCell } from "./money-cell";

/** A line as the editor receives it: months as plain decimal strings, serialisable to the client. */
export interface EditorLine {
  id?: string;
  coaCode: string;
  entityCode: string;
  ownerUnit: string;
  item: string;
  basis: string;
  months: string[];
  /** Why the line came back, while it waits on the requestor. */
  remark?: Remark;
  /** 2026 figures as plain decimal strings, shown for context. */
  rka2026?: string;
  actual2026?: string;
  flags?: string[];
  /** Comments on a saved line; drafts link to their discussion like every other line. */
  commentCount?: number;
  /** Written by the headcount plan: months and fields are edited there, the line is still sent from here. */
  planned?: boolean;
}

export interface EditorMasters {
  coa: { code: string; name: string; category: string; defaultOwnerUnit: string | null }[];
  entities: string[];
  units: { code: string; name: string }[];
}

type Result = { ok: boolean; message: string; id?: string; errors?: Record<string, string> };

interface Row extends Omit<EditorLine, "months"> {
  key: string;
  /** Raw cell text as typed; parsed on every render. */
  cells: string[];
  dirty: boolean;
  focusMonth: number;
  errors: Record<string, string>;
}

const SELECT =
  "border-input h-8 w-full min-w-24 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive";

/** id-ID text without the Rp prefix, as the cell shows it. */
const plain = (m: Money) => formatIdr(m, { unit: "rp" }).replace(/^(-?)Rp /, "$1");

function tryParse(text: string): Money | null {
  try {
    return parseIdr(text);
  } catch {
    return null;
  }
}

let seq = 0;
const toRow = (l: EditorLine): Row => ({
  key: l.id ?? `new-${++seq}`,
  id: l.id,
  coaCode: l.coaCode,
  entityCode: l.entityCode,
  ownerUnit: l.ownerUnit,
  item: l.item,
  basis: l.basis,
  ...(l.remark ? { remark: l.remark } : {}),
  ...(l.rka2026 ? { rka2026: l.rka2026 } : {}),
  ...(l.actual2026 ? { actual2026: l.actual2026 } : {}),
  ...(l.flags ? { flags: l.flags } : {}),
  ...(l.commentCount ? { commentCount: l.commentCount } : {}),
  ...(l.planned ? { planned: true } : {}),
  cells: l.months.map((m) => plain(money(m))),
  dirty: !l.id,
  focusMonth: 1,
  errors: {},
});

/**
 * Editable 12-month grid for draft lines. Behaves like the sheet: paste a block from Excel,
 * fill a monthly amount right to December, arrow keys move between rows. Totals come from the domain.
 */
export function BudgetEditor({
  lines,
  masters,
  defaultEntity,
  onSave,
  onDelete,
  onSubmit,
}: {
  lines: EditorLine[];
  masters: EditorMasters;
  defaultEntity: string;
  onSave: (line: EditorLine & { id?: string }) => Promise<Result>;
  onDelete: (id: string) => Promise<Result>;
  onSubmit: (ids: string[]) => Promise<Result>;
}) {
  const [editable, setRows] = useState<Row[]>(() => lines.filter((l) => !l.planned).map(toRow));
  // Planned lines follow the page's props, so saving the plan shows here; they come last so row indexes match `editable`.
  const rows = [...editable, ...lines.filter((l) => l.planned).map(toRow)];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, dirty: true, errors: {} } : r)));

  const parsed = rows.map((r) => r.cells.map(tryParse));
  const totals = parsed.map((ms) => sum(ms.map((m) => m ?? ZERO)));

  const setCells = (key: string, cells: string[]) => update(key, { cells });

  const onPaste = (rowIdx: number, month: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const block = parsePaste(e.clipboardData.getData("text/plain") ?? e.clipboardData.getData("text"));
    if (block.length === 1 && block[0]!.length === 1) return; // a single value pastes natively
    e.preventDefault();
    setRows((rs) =>
      rs.map((r, i) => {
        const cells = block[i - rowIdx];
        if (!cells) return r;
        const next = [...r.cells];
        cells.forEach((c, j) => {
          if (month - 1 + j < 12) next[month - 1 + j] = c.trim();
        });
        return { ...r, cells: next, dirty: true, errors: {} };
      }),
    );
  };

  const onFillRight = (rowIdx: number) => {
    const r = rows[rowIdx]!;
    const months = parsed[rowIdx]!;
    const from = months[r.focusMonth - 1];
    if (!from) return;
    const filled = fillRight(months.map((m) => m ?? ZERO), r.focusMonth);
    setCells(r.key, r.cells.map((c, i) => (i >= r.focusMonth - 1 ? plain(filled[i]!) : c)));
  };

  const onKeyDown = (rowIdx: number, month: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    const delta = e.key === "ArrowDown" || e.key === "Enter" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    const target = document.querySelector<HTMLInputElement>(`[data-cell="${rowIdx + delta}-${month}"]`);
    if (target) {
      e.preventDefault();
      target.focus();
    }
  };

  // Every changed row is saved from one bar, like a sheet; a row that is not valid yet holds the save back.
  const changed = editable.filter((r) => r.dirty);
  const changedValid = changed.every((r) => parsed[rows.findIndex((x) => x.key === r.key)]!.every(Boolean));
  const saveAll = () =>
    startTransition(async () => {
      let saved = 0;
      let failure: string | null = null;
      for (const r of changed) {
        const months = parsed[rows.findIndex((x) => x.key === r.key)]!;
        const res = await onSave({
          ...(r.id ? { id: r.id } : {}),
          coaCode: r.coaCode,
          entityCode: r.entityCode,
          ownerUnit: r.ownerUnit,
          item: r.item,
          basis: r.basis,
          months: months.map((m) => m!.toFixed()),
        });
        if (res.ok) saved += 1;
        else failure ??= res.message;
        setRows((rs) =>
          rs.map((x) => (x.key !== r.key ? x : res.ok ? { ...x, id: res.id ?? x.id, dirty: false, errors: {} } : { ...x, errors: res.errors ?? {} })),
        );
      }
      setMessage(failure ? { ok: false, text: saved ? `${saved} baris tersimpan. ${failure}` : failure } : { ok: true, text: `${saved} baris tersimpan.` });
    });

  const remove = (rowIdx: number) => {
    const r = rows[rowIdx]!;
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

  const submittable = rows.filter((r) => r.id && !r.dirty);
  const chosen = submittable.filter((r) => selected.has(r.id!)).map((r) => r.id!);
  const submit = () =>
    startTransition(async () => {
      const res = await onSubmit(chosen);
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) {
        setRows((rs) => rs.filter((r) => !r.id || !chosen.includes(r.id)));
        setSelected(new Set());
      }
    });

  const addRow = () => {
    const first = masters.coa[0];
    setRows((rs) => [
      ...rs,
      toRow({
        coaCode: first?.code ?? "",
        entityCode: defaultEntity,
        ownerUnit: first?.defaultOwnerUnit ?? masters.units[0]?.code ?? "",
        item: "",
        basis: "",
        months: Array.from({ length: 12 }, () => "0"),
      }),
    ]);
  };

  const grand = sum(totals);

  return (
    <div className="grid gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead className="bg-background sticky left-0 min-w-56">COA / Uraian</TableHead>
            <TableHead className="min-w-28">Entitas</TableHead>
            <TableHead className="min-w-28">Pemilik</TableHead>
            {MONTHS.map((m) => (
              <TableHead key={m} className="min-w-28 text-right">
                {m}
              </TableHead>
            ))}
            <TableHead className="text-right">Total RKA</TableHead>
            <TableHead className="min-w-56">Dasar perhitungan</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const n = i + 1;
            const canSubmit = !!r.id && !r.dirty;
            const locked = !!r.planned;
            const hasNotes = !!(r.flags?.length || r.rka2026 || r.actual2026);
            return (
              <TableRow key={r.key} className={cn(r.dirty && "bg-warning/5")}>
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Pilih baris ${n}`}
                    disabled={!canSubmit}
                    checked={!!r.id && selected.has(r.id)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(r.id!);
                        else next.delete(r.id!);
                        return next;
                      })
                    }
                  />
                </TableCell>
                <TableCell className="bg-background sticky left-0 grid gap-1">
                  <select
                    aria-label={`COA baris ${n}`}
                    className={SELECT}
                    disabled={locked}
                    value={r.coaCode}
                    aria-invalid={!!r.errors.coaCode}
                    onChange={(e) => {
                      const coa = masters.coa.find((c) => c.code === e.target.value);
                      update(r.key, { coaCode: e.target.value, ...(coa?.defaultOwnerUnit ? { ownerUnit: coa.defaultOwnerUnit } : {}) });
                    }}
                  >
                    {masters.coa.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label={`Uraian baris ${n}`}
                    disabled={locked}
                    placeholder="Uraian"
                    className="h-8"
                    value={r.item}
                    onChange={(e) => update(r.key, { item: e.target.value })}
                  />
                  {r.errors.coaCode ? <span className="text-destructive text-xs">{r.errors.coaCode}</span> : null}
                  {hasNotes ? (
                    notesOpen.has(r.key) ? (
                      <div className="bg-muted/60 grid max-w-64 gap-1 rounded-md p-2 text-xs whitespace-normal">
                        {r.rka2026 || r.actual2026 ? (
                          <span className="text-muted-foreground">
                            2026: RKA {r.rka2026 ? formatIdr(money(r.rka2026)) : "—"} · Actual {r.actual2026 ? formatIdr(money(r.actual2026)) : "—"}
                          </span>
                        ) : null}
                        {r.flags?.map((f) => (
                          <span key={f} className="flex gap-1.5">
                            <TriangleAlert aria-hidden className="text-state-finance mt-px size-3.5 shrink-0" />
                            {f}
                          </span>
                        ))}
                      </div>
                    ) : null
                  ) : null}
                  {r.remark ? (
                    <span className="bg-warning/15 max-w-56 rounded px-1.5 py-1 text-xs whitespace-normal">
                      Dikembalikan oleh {r.remark.by}: “{r.remark.comment}”
                    </span>
                  ) : null}
                  {locked ? <span className="text-muted-foreground text-xs">Dihitung dari Rencana headcount</span> : null}
                  <div className="flex items-center gap-3">
                    {r.id ? <DiscussionLink id={r.id} count={r.commentCount} /> : null}
                    {hasNotes ? (
                      <button
                        type="button"
                        aria-label={`Catatan baris ${n}`}
                        aria-expanded={notesOpen.has(r.key)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-1 text-xs font-medium hover:underline",
                          r.flags?.length ? "text-state-finance" : "text-muted-foreground",
                        )}
                        onClick={() =>
                          setNotesOpen((s) => {
                            const next = new Set(s);
                            if (next.has(r.key)) next.delete(r.key);
                            else next.add(r.key);
                            return next;
                          })
                        }
                      >
                        {r.flags?.length ? <TriangleAlert aria-hidden className="size-3.5" /> : <Info aria-hidden className="size-3.5" />}
                        {r.flags?.length ? `${r.flags.length} catatan` : "2026"}
                      </button>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <select
                    aria-label={`Entitas baris ${n}`}
                    className={cn(SELECT, "min-w-32")}
                    disabled={locked}
                    value={r.entityCode}
                    aria-invalid={!!r.errors.entityCode}
                    onChange={(e) => update(r.key, { entityCode: e.target.value })}
                  >
                    {masters.entities.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <select
                    aria-label={`Unit pemilik baris ${n}`}
                    className={SELECT}
                    disabled={locked}
                    value={r.ownerUnit}
                    onChange={(e) => update(r.key, { ownerUnit: e.target.value })}
                  >
                    {masters.units.map((u) => (
                      <option key={u.code} value={u.code} title={u.name}>
                        {u.code}
                      </option>
                    ))}
                  </select>
                </TableCell>
                {r.cells.map((c, j) => (
                  <TableCell key={j}>
                    <Input
                      aria-label={`Baris ${n} bulan ${j + 1}`}
                      data-cell={`${i}-${j + 1}`}
                      disabled={locked}
                      inputMode="decimal"
                      className="tabular hover:border-input focus-visible:border-ring h-8 min-w-28 border-transparent bg-transparent text-right shadow-none"
                      value={c}
                      aria-invalid={!parsed[i]![j]}
                      onChange={(e) => setCells(r.key, r.cells.map((x, k) => (k === j ? e.target.value : x)))}
                      onFocus={() => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, focusMonth: j + 1 } : x)))}
                      onBlur={() => {
                        const m = parsed[i]![j];
                        if (m && plain(m) !== c) setCells(r.key, r.cells.map((x, k) => (k === j ? plain(m) : x)));
                      }}
                      onPaste={onPaste(i, j + 1)}
                      onKeyDown={onKeyDown(i, j + 1)}
                    />
                  </TableCell>
                ))}
                <TableCell className="bg-accent/50 text-right font-medium" data-testid={`editor-total-${n}`}>
                  <MoneyCell value={totals[i]!} unit="rp" />
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={`Dasar perhitungan baris ${n}`}
                    disabled={locked}
                    className="h-8"
                    value={r.basis}
                    aria-invalid={!!r.errors.basis}
                    onChange={(e) => update(r.key, { basis: e.target.value })}
                  />
                  {r.errors.basis ? <span className="text-destructive text-xs">{r.errors.basis}</span> : null}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" aria-label="Isi ke kanan" title="Isi bulan terpilih sampai Des" disabled={locked} onClick={() => onFillRight(i)}>
                      <ArrowRightToLine />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" aria-label="Hapus baris" disabled={locked || pending} onClick={() => remove(i)}>
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {rows.length ? (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={16}>Total draft</TableCell>
              <TableCell className="text-right" data-testid="editor-grand-total">
                <MoneyCell value={grand} unit="rp" />
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
      {changed.length ? (
        <div className="bg-card sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 shadow-md">
          <span className="text-sm">
            <span className="bg-state-finance mr-2 inline-block size-2 rounded-full align-middle" aria-hidden />
            {changed.length} baris belum disimpan
            {!changedValid ? <span className="text-destructive"> · ada nominal yang belum benar</span> : null}
          </span>
          <Button type="button" disabled={!changedValid || pending} onClick={saveAll}>
            <Save aria-hidden /> Simpan ({changed.length})
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={addRow}>
          <Plus /> Tambah baris
        </Button>
        <Button type="button" disabled={!chosen.length || pending} onClick={submit}>
          <Send aria-hidden /> Kirim ke Default Owner ({chosen.length})
        </Button>
        {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.text}</p> : null}
      </div>
    </div>
  );
}
