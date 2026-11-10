"use client";

import type { HiddenColumns } from "@estrada/domain";
import { BadgeCheck, CheckCheck, CircleCheck, Lock, MessageCircleQuestion, Send, Undo2, type LucideIcon } from "lucide-react";
import { Fragment, useState, useTransition } from "react";
import { coaSubtree, coaTree, money, sum, type ApprovalAction, type ApprovalState, type Unit } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApprovalTimeline, type Remark, type TimelineEvent } from "./approval-timeline";
import { DiscussionLink } from "./budget-grid";
import { MoneyCell } from "./money-cell";
import { StatusBadge } from "./status-badge";
import { VarianceCell } from "./variance-cell";
import { EmptyState } from "./empty-state";

/** A line in an approval queue: months as plain decimal strings, plus what this position may do to it. */
export interface QueueLine {
  id: string;
  coaCode: string;
  coaName: string;
  entity: string;
  requestorUnit: string;
  ownerUnit: string;
  state: ApprovalState;
  months: string[];
  item?: string;
  basis?: string;
  actions: ApprovalAction[];
  priorRka?: string;
  priorActual?: string;
  /** Notes for reviewers, e.g. the workbook's cleaning flags. */
  flags?: string[];
  history?: TimelineEvent[];
  commentCount?: number;
  /** Open return or clarification this line is waiting on. */
  remark?: Remark;
}

type Result = { ok: boolean; message: string };
export interface CoaBranch {
  code: string;
  name: string;
  parentCode: string | null;
}

const SELECT =
  "border-input h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]";

/** The codes in this queue plus their parents, as a tree: what this position's own lines can be filtered by. */
function filterOptions(lines: readonly QueueLine[], coa: readonly CoaBranch[]) {
  const master = new Map(coa.map((c) => [c.code, c]));
  const picked = new Map<string, CoaBranch>();
  for (const l of lines) {
    for (let c: CoaBranch | undefined = master.get(l.coaCode) ?? { code: l.coaCode, name: l.coaName, parentCode: null }; c && !picked.has(c.code); ) {
      picked.set(c.code, c);
      c = c.parentCode ? master.get(c.parentCode) : undefined;
    }
  }
  return coaTree([...picked.values()]);
}

export const ACTION_LABEL: Record<ApprovalAction, string> = {
  submit: "Kirim ke Default Owner",
  return: "Kembalikan",
  consolidate: "Kirim ke Division Owner",
  approve: "Setujui & kirim ke Finance",
  clarify: "Minta klarifikasi",
  finalize: "Finalisasi",
  lock: "Kunci versi",
};
const ACTION_ICON: Record<ApprovalAction, LucideIcon> = {
  submit: Send,
  return: Undo2,
  consolidate: Send,
  approve: CheckCheck,
  clarify: MessageCircleQuestion,
  finalize: BadgeCheck,
  lock: Lock,
};
const NEEDS_COMMENT: readonly ApprovalAction[] = ["return", "clarify"];
const ORDER: readonly ApprovalAction[] = ["submit", "consolidate", "approve", "finalize", "lock", "return", "clarify"];

/**
 * Lines waiting on this position, grouped by budget owner unit. Selected lines move together
 * as one handoff; returns and clarifications need a comment.
 */
export function ApprovalQueue({
  lines: all,
  coa = [],
  unit = "juta",
  priorYear,
  onAction,
  hide = {},
}: {
  lines: QueueLine[];
  /** The comparison year: the year before the one being planned. */
  priorYear: number;
  /** COA Master as a tree, for the filter. */
  coa?: readonly CoaBranch[];
  unit?: Unit;
  onAction: (ids: string[], action: ApprovalAction, comment: string | undefined) => Promise<Result>;
  /** Columns the header has narrowed to one value. */
  hide?: Partial<HiddenColumns>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [coaFilter, setCoaFilter] = useState("");

  const options = filterOptions(all, coa);
  const shown = coaFilter ? coaSubtree(coaFilter, options.map((o) => o.account)) : null;
  const lines = shown ? all.filter((l) => shown.has(l.coaCode)) : all;
  const totals = new Map(lines.map((l) => [l.id, sum(l.months.map((m) => money(m)))]));
  const groups = new Map<string, QueueLine[]>();
  for (const l of lines) groups.set(l.ownerUnit, [...(groups.get(l.ownerUnit) ?? []), l]);

  const chosen = lines.filter((l) => selected.has(l.id));
  const available = chosen.length
    ? ORDER.filter((a) => chosen.every((l) => l.actions.includes(a)))
    : [];

  const toggle = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const run = (action: ApprovalAction) => {
    if (NEEDS_COMMENT.includes(action) && !comment.trim()) {
      setMessage({ ok: false, text: "Catatan wajib diisi untuk aksi ini." });
      return;
    }
    const ids = chosen.map((l) => l.id);
    startTransition(async () => {
      const res = await onAction(ids, action, comment.trim() || undefined);
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) {
        setSelected(new Set());
        setComment("");
      }
    });
  };

  const filter = (
    <div className="flex items-center gap-2">
      <Label htmlFor="coa-filter">Filter COA</Label>
      <select
        id="coa-filter"
        className={SELECT}
        value={coaFilter}
        onChange={(e) => {
          setCoaFilter(e.target.value);
          setSelected(new Set());
        }}
      >
        <option value="">Semua COA</option>
        {options.map(({ account: c, depth }) => (
          <option key={c.code} value={c.code}>
            {"\u00a0\u00a0".repeat(depth)}
            {c.code} · {c.name}
          </option>
        ))}
      </select>
    </div>
  );

  if (!all.length) {
    return (
      <div className="grid gap-2 py-8 text-center">
        {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.text}</p> : null}
        <EmptyState icon={CircleCheck} title="Tidak ada baris yang menunggu Anda." description="Semua baris di tahap ini sudah diproses. Baris baru muncul di sini saat dikirim kepada Anda, dan Anda menerima email." />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {filter}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>COA</TableHead>
            {hide.entity ? null : <TableHead>Entitas</TableHead>}
            <TableHead>Pengusul</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Dasar perhitungan</TableHead>
            <TableHead className="text-right">Total RKA</TableHead>
            <TableHead className="text-right">Actual {priorYear}</TableHead>
            <TableHead className="text-right">Perubahan</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...groups].map(([owner, group]) => {
            const actionable = group.filter((l) => l.actions.length).map((l) => l.id);
            const allOn = actionable.length > 0 && actionable.every((id) => selected.has(id));
            return (
              <Fragment key={owner}>
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Pilih semua ${owner}`}
                      disabled={!actionable.length}
                      checked={allOn}
                      onChange={(e) => toggle(actionable, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell colSpan={hide.entity ? 4 : 5}>
                    {owner} · {group.length} baris
                  </TableCell>
                  <TableCell className="text-right" data-testid={`subtotal-${owner}`}>
                    <MoneyCell value={sum(group.map((l) => totals.get(l.id)!))} unit={unit} />
                  </TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
                {group.map((l) => (
                  <Fragment key={l.id}>
                  <TableRow>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${l.coaCode} ${l.ownerUnit}`}
                        disabled={!l.actions.length}
                        checked={selected.has(l.id)}
                        onChange={(e) => toggle([l.id], e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{l.coaCode}</div>
                      <div className="text-muted-foreground text-xs">{l.item || l.coaName}</div>
                      <DiscussionLink id={l.id} count={l.commentCount} />
                    </TableCell>
                    {hide.entity ? null : <TableCell>{l.entity}</TableCell>}
                    <TableCell>
                      {l.requestorUnit}
                      {l.requestorUnit !== l.ownerUnit ? <span className="text-muted-foreground text-xs"> (lintas unit)</span> : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge state={l.state} />
                    </TableCell>
                    <TableCell className="max-w-72 text-xs">
                      <div className="text-muted-foreground truncate" title={l.basis}>
                        {l.basis ?? "—"}
                      </div>
                      {l.flags?.map((f) => (
                        <div key={f} className="bg-warning/15 mt-1 rounded px-1.5 py-0.5 whitespace-normal">
                          {f}
                        </div>
                      ))}
                      {l.remark ? (
                        <div className="bg-warning/15 mt-1 rounded px-1.5 py-1 whitespace-normal">
                          {l.remark.by}: “{l.remark.comment}”
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell value={totals.get(l.id)!} unit={unit} />
                    </TableCell>
                    <TableCell className="text-right">{l.priorActual ? <MoneyCell value={money(l.priorActual)} unit={unit} /> : "—"}</TableCell>
                    <TableCell className="text-right">
                      <VarianceCell plan={totals.get(l.id)!} base={l.priorActual ? money(l.priorActual) : null} unit={unit} />
                    </TableCell>
                    <TableCell>
                      <Button type="button" size="sm" variant="ghost" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)}>
                        Riwayat
                      </Button>
                    </TableCell>
                  </TableRow>
                  {open === l.id ? (
                    <TableRow>
                      <TableCell />
                      <TableCell colSpan={hide.entity ? 8 : 9} className="whitespace-normal">
                        <ApprovalTimeline events={l.history ?? []} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                  </Fragment>
                ))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      <div className="grid gap-2 sm:max-w-xl">
        <Label htmlFor="queue-comment">Catatan</Label>
        <textarea
          id="queue-comment"
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Wajib untuk mengembalikan atau meminta klarifikasi"
          className="border-input focus-visible:ring-ring/50 rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">{chosen.length} baris dipilih</span>
        {available.map((a) => {
          const Icon = ACTION_ICON[a];
          return (
            <Button key={a} type="button" variant={NEEDS_COMMENT.includes(a) ? "outline" : "default"} disabled={pending} onClick={() => run(a)}>
              <Icon aria-hidden />
              {ACTION_LABEL[a]}
            </Button>
          );
        })}
        {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.text}</p> : null}
      </div>
    </div>
  );
}
