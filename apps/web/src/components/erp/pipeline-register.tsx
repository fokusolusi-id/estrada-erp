"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import {
  DEAL_STATUSES,
  DEAL_STATUS_LABEL,
  DEAL_TYPE_LABEL,
  DEAL_TYPES,
  SEGMENTS,
  dealProblems,
  formatIdr,
  money,
  parseIdr,
  pipelineTotals,
  statusBand,
  terminTotal,
  weighted,
  type DealInput,
} from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyCell } from "./money-cell";
import { MoneyInput } from "./money-input";

export interface RegisterDeal extends DealInput {
  id: string;
  editable: boolean;
}
export type DealSave = DealInput & { id: string | null };
type Result = { ok: boolean; message: string };
interface Options {
  entities: readonly string[];
  coa: readonly { code: string; name: string }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";
const FIELD_LABEL: Record<string, string> = {
  customer: "Customer wajib diisi",
  project: "Project wajib diisi",
  segment: "Segmen tidak dikenal",
  value: "Nilai harus lebih dari 0",
  months: "Bulan selesai tidak boleh sebelum bulan mulai",
  leadTime: "Lead time harus 0–24 bulan",
};
const TERMIN_LABEL: Record<string, string> = {
  out_of_range: "Setiap termin perlu nilai lebih dari 0 dan tanggal rencana",
  termin_over: "Jumlah termin melebihi nilai kontrak",
  termin_total: "Closed Won: jumlah termin harus 100% nilai kontrak",
};
const band = (s: DealInput["status"]) => {
  const [lo, hi] = statusBand(s);
  return lo === hi ? `${lo}%` : `${lo}–${hi}%`;
};
const plain = (s: string) => {
  try {
    return s.trim() ? parseIdr(s).toFixed() : "";
  } catch {
    return "";
  }
};
const shown = (s: string) => (s ? formatIdr(money(s), { unit: "rp" }).replace(/^(-?)Rp /, "$1") : "");

/** BCD's Pipeline register: deals with value and probability, beside (never inside) the RKA's revenue. */
export function PipelineRegister({
  deals,
  options,
  canAdd,
  onSave,
  onDelete,
  entity = null,
}: {
  deals: RegisterDeal[];
  options: Options;
  canAdd: boolean;
  onSave: (deal: DealSave) => Promise<Result>;
  onDelete: (id: string) => Promise<Result>;
  /** The header's Entitas: deals arrive already narrowed to it, and a new deal starts in it. */
  entity?: string | null;
}) {
  const [segment, setSegment] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<DealSave | null>(null);
  const [message, setMessage] = useState<Result | null>(null);

  const q = query.trim().toLowerCase();
  const list = deals.filter(
    (d) =>
      (!segment || d.segment === segment) &&
      (!status || d.status === status) &&
      (!q || `${d.customer} ${d.endCustomer ?? ""} ${d.project}`.toLowerCase().includes(q)),
  );
  const totals = pipelineTotals(list);
  const blank = (): DealSave => ({
    id: null,
    entity: entity && options.entities.includes(entity) ? entity : (options.entities[0] ?? ""),
    customer: "",
    endCustomer: "",
    segment: SEGMENTS[0],
    project: "",
    coaCode: null,
    value: "",
    status: "PP",
    probability: "",
    type: "new",
    startMonth: 1,
    endMonth: 12,
    notes: "",
    leadTimeMonths: null,
    termins: [],
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Input aria-label="Cari customer atau project" placeholder="Cari customer atau project" className="h-9 w-56" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Filter label="Segmen" value={segment} onChange={setSegment} options={SEGMENTS} all="Semua segmen" />
          <Filter label="Status" value={status} onChange={setStatus} options={DEAL_STATUSES} all="Semua status" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
          {canAdd ? (
            <Button type="button" onClick={() => setEditing(blank())}>
              <Plus aria-hidden /> Tambah deal
            </Button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <DealForm
          key={editing.id ?? "new"}
          initial={editing}
          options={options}
          onCancel={() => setEditing(null)}
          onSave={async (d) => {
            const res = await onSave(d);
            setMessage(res);
            if (res.ok) setEditing(null);
            return res;
          }}
          onDelete={
            editing.id
              ? async () => {
                  const res = await onDelete(editing.id!);
                  setMessage(res);
                  if (res.ok) setEditing(null);
                  return res;
                }
              : null
          }
        />
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            {entity ? null : <TableHead>Entitas</TableHead>}
            <TableHead>Segmen</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Prob.</TableHead>
            <TableHead className="text-right">Nilai</TableHead>
            <TableHead className="text-right">Tertimbang</TableHead>
            <TableHead>Periode</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((d) => (
            <TableRow key={d.id} data-testid={`deal-${d.id}`}>
              <TableCell className="max-w-80">
                <div className="font-medium whitespace-normal">{d.project}</div>
                <div className="text-muted-foreground text-xs">
                  {d.customer}
                  {d.endCustomer ? ` · ${d.endCustomer}` : ""} · {DEAL_TYPE_LABEL[d.type]}
                </div>
              </TableCell>
              {entity ? null : <TableCell>{d.entity}</TableCell>}
              <TableCell>{d.segment}</TableCell>
              <TableCell title={DEAL_STATUS_LABEL[d.status]}>
                {d.status}
                {d.termins?.length ? <span className="text-muted-foreground text-xs"> · {d.termins.length} termin</span> : null}
              </TableCell>
              <TableCell className="tabular text-right">{d.probability.replace(".", ",")}%</TableCell>
              <TableCell className="text-right">
                <MoneyCell value={money(d.value)} />
              </TableCell>
              <TableCell className="text-right" data-testid="weighted">
                <MoneyCell value={weighted(d)} />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {MONTHS[d.startMonth - 1]}–{MONTHS[d.endMonth - 1]}
              </TableCell>
              <TableCell>
                {d.editable ? (
                  <Button type="button" variant="ghost" size="sm" aria-label={`Ubah ${d.project}`} onClick={() => setEditing({ ...d, id: d.id })}>
                    Ubah
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow data-testid="register-total">
            <TableCell colSpan={entity ? 4 : 5}>{list.length} deal</TableCell>
            <TableCell className="text-right">
              <MoneyCell value={totals.value} />
            </TableCell>
            <TableCell className="text-right">
              <MoneyCell value={totals.weighted} />
            </TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function Filter({ label, value, onChange, options, all }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[]; all: string }) {
  const id = `filter-${label.toLowerCase()}`;
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <select id={id} className={`${SELECT} w-44`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function DealForm({
  initial,
  options,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: DealSave;
  options: Options;
  onSave: (d: DealSave) => Promise<Result>;
  onDelete: (() => Promise<Result>) | null;
  onCancel: () => void;
}) {
  const [d, setD] = useState({
    ...initial,
    value: shown(initial.value),
    probability: initial.probability.replace(".", ","),
    leadTime: initial.leadTimeMonths == null ? "" : String(initial.leadTimeMonths),
    termins: (initial.termins ?? []).map((t) => ({ amount: shown(t.amount), plannedDate: t.plannedDate, description: t.description ?? "" })),
  });
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<typeof d>) => setD((cur) => ({ ...cur, ...patch }));
  const { leadTime, ...rest } = d;
  const normal: DealSave = {
    ...rest,
    value: plain(d.value) || "0",
    probability: plain(d.probability) || "-1",
    endCustomer: d.endCustomer?.trim() || null,
    notes: d.notes?.trim() || null,
    leadTimeMonths: leadTime.trim() === "" ? null : Number(leadTime.replace(",", ".")),
    termins: d.termins.map((t) => ({ amount: plain(t.amount) || "0", plannedDate: t.plannedDate, description: t.description.trim() || null })),
  };
  const setTermin = (i: number, patch: Partial<(typeof d.termins)[number]>) => set({ termins: d.termins.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const planned = terminTotal(normal.termins ?? []);
  const contract = money(normal.value);
  const problems = dealProblems(normal);
  const blocking = problems.filter((p) => p.blocking);
  const field = (label: string, input: React.ReactNode, wide = false) => (
    <label className={`grid gap-1 text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-muted-foreground text-xs">{label}</span>
      {input}
    </label>
  );

  return (
    <form
      aria-label="Deal"
      className="bg-muted/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => void (await onSave(normal)));
      }}
    >
      {field(
        "Entitas",
        <select aria-label="Entitas deal" className={SELECT} value={d.entity} onChange={(e) => set({ entity: e.target.value })}>
          {options.entities.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>,
      )}
      {field("Customer", <Input aria-label="Customer" value={d.customer} onChange={(e) => set({ customer: e.target.value })} />)}
      {field("End customer", <Input aria-label="End customer" value={d.endCustomer ?? ""} onChange={(e) => set({ endCustomer: e.target.value })} />)}
      {field(
        "Segmen",
        <select aria-label="Segmen deal" className={SELECT} value={d.segment} onChange={(e) => set({ segment: e.target.value })}>
          {SEGMENTS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>,
      )}
      {field("Project", <Input aria-label="Project" value={d.project} onChange={(e) => set({ project: e.target.value })} />, true)}
      {field(
        "COA pendapatan (wajib)",
        <select aria-label="COA deal" className={SELECT} value={d.coaCode ?? ""} onChange={(e) => set({ coaCode: e.target.value || null })}>
          <option value="">—</option>
          {options.coa.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>,
        true,
      )}
      {field("Nilai (exclude PPN)", <MoneyInput aria-label="Nilai (exclude PPN)" value={d.value} onChange={(e) => set({ value: e.target.value })} />)}
      {field(
        "Status",
        <select aria-label="Status deal" className={SELECT} value={d.status} onChange={(e) => {
            const status = e.target.value as DealSave["status"];
            // A signed contract counts in full.
            set(status === "CW" ? { status, probability: "100" } : { status });
          }}
        >
          {DEAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s} · {DEAL_STATUS_LABEL[s]} ({band(s)})
            </option>
          ))}
        </select>,
      )}
      {field("Probabilitas (%)", <Input aria-label="Probabilitas (%)" inputMode="decimal" className="tabular text-right" value={d.probability} onChange={(e) => set({ probability: e.target.value })} />)}
      {field(
        "Type",
        <select aria-label="Type deal" className={SELECT} value={d.type} onChange={(e) => set({ type: e.target.value as DealSave["type"] })}>
          {DEAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {DEAL_TYPE_LABEL[t]}
            </option>
          ))}
        </select>,
      )}
      {field(
        "Mulai",
        <select aria-label="Bulan mulai" className={SELECT} value={d.startMonth} onChange={(e) => set({ startMonth: Number(e.target.value) })}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>,
      )}
      {field(
        "Selesai",
        <select aria-label="Bulan selesai" className={SELECT} value={d.endMonth} onChange={(e) => set({ endMonth: Number(e.target.value) })}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>,
      )}
      {field("Lead time (bulan)", <Input aria-label="Lead time (bulan)" inputMode="numeric" className="tabular text-right" value={d.leadTime} onChange={(e) => set({ leadTime: e.target.value })} />)}
      {field("Catatan", <Input aria-label="Catatan" value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />)}
      <fieldset className="grid gap-2 sm:col-span-4" aria-label="Billing Termin">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-medium">
            Billing Termin{" "}
            <span className="text-muted-foreground text-xs font-normal" data-testid="termin-total">
              Rp {shown(planned.toFixed())} dari Rp {shown(contract.toFixed())}
              {contract.gt(0) ? ` (${planned.div(contract).times(100).toFixed(1).replace(".", ",")}%)` : ""}
            </span>
          </legend>
          <Button type="button" variant="outline" size="sm" onClick={() => set({ termins: [...d.termins, { amount: "", plannedDate: "", description: "" }] })}>
            <Plus aria-hidden /> Tambah termin
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">Rencana invoice hanya berasal dari termin ini. Deal Closed Won wajib memiliki termin senilai 100% nilai kontrak.</p>
        {d.termins.map((t, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]" data-testid={`termin-${i + 1}`}>
            <MoneyInput aria-label={`Nilai termin ${i + 1}`} placeholder="Nilai (exclude PPN)" value={t.amount} onChange={(e) => setTermin(i, { amount: e.target.value })} />
            <Input type="date" aria-label={`Tanggal rencana termin ${i + 1}`} value={t.plannedDate} onChange={(e) => setTermin(i, { plannedDate: e.target.value })} />
            <Input aria-label={`Keterangan termin ${i + 1}`} placeholder="Keterangan, mis. DP 30%" value={t.description} onChange={(e) => setTermin(i, { description: e.target.value })} />
            <Button type="button" variant="ghost" size="sm" aria-label={`Hapus termin ${i + 1}`} onClick={() => set({ termins: d.termins.filter((_, j) => j !== i) })}>
              Hapus
            </Button>
          </div>
        ))}
      </fieldset>
      <div className="grid gap-1 text-xs sm:col-span-4">
        {problems
          // A field left blank only disables saving; it says nothing until something is typed.
          .filter((p) => (p.field === "coa" ? false : p.field === "months" || p.field === "segment" || p.field === "leadTime" || p.field === "termin" || String(d[p.field]).trim() !== ""))
          .map((p) =>
            p.code === "outside_band" ? (
              <p key={p.field + p.code} className="text-warning-foreground">
                Probabilitas di luar rentang status {d.status} ({band(d.status)})
              </p>
            ) : (
              <p key={p.field + p.code} className="text-destructive">
                {p.field === "probability" ? "Probabilitas harus 0–100" : p.field === "termin" ? TERMIN_LABEL[p.code] : FIELD_LABEL[p.field]}
              </p>
            ),
          )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-4">
        {onDelete ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => startTransition(async () => void (await onDelete()))}>
            Hapus deal
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" disabled={!!blocking.length || pending}>
          Simpan deal
        </Button>
      </div>
    </form>
  );
}
