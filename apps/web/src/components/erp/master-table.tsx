"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface MasterField {
  name: string;
  label: string;
  /** Shown in the list as well as in the form. */
  column?: boolean;
  required?: boolean;
  /** Shown in the list only: not on the form. */
  readOnly?: boolean;
  /** Typed once, when the record is created. */
  createOnly?: boolean;
  type?: "text" | "select" | "checkbox";
  options?: readonly { value: string; label?: string }[];
  /** Typing help for a free text field. */
  suggestions?: readonly string[];
  wide?: boolean;
}

export type MasterValues = Record<string, string | boolean>;

export interface MasterRow {
  id: string;
  /** Includes `active`. */
  values: MasterValues;
  /** What the data steward should check. */
  issues: readonly string[];
}

type Result = { ok: boolean; message: string };

const SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

const shown = (field: MasterField, value: string | boolean | undefined) =>
  typeof value === "boolean" ? (value ? "Ya" : "Tidak") : (field.options?.find((o) => o.value === value)?.label ?? value) || "—";

/** A master data list with its form. Without `onSave` it is read only. Records are retired, never deleted. */
export function MasterTable({
  noun,
  fields,
  rows,
  onSave,
}: {
  noun: string;
  fields: readonly MasterField[];
  rows: readonly MasterRow[];
  onSave?: (id: string | null, values: MasterValues) => Promise<Result>;
}) {
  const [query, setQuery] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; values: MasterValues } | null>(null);
  const [message, setMessage] = useState<Result | null>(null);

  const columns = fields.filter((f) => f.column);
  const q = query.trim().toLowerCase();
  const flagged = rows.filter((r) => r.issues.length).length;
  const list = rows.filter(
    (r) => (!reviewOnly || r.issues.length > 0) && (!q || `${r.id} ${fields.map((f) => shown(f, r.values[f.name])).join(" ")}`.toLowerCase().includes(q)),
  );
  const blank = (): MasterValues => ({
    ...Object.fromEntries(fields.map((f) => [f.name, f.type === "checkbox" ? false : f.type === "select" ? (f.options?.[0]?.value ?? "") : ""])),
    active: true,
  });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input aria-label={`Cari ${noun}`} placeholder={`Cari ${noun}`} className="h-9 w-64" value={query} onChange={(e) => setQuery(e.target.value)} />
          {flagged ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-primary" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
              Hanya yang perlu ditinjau ({flagged})
            </label>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
          {onSave ? (
            <Button
              type="button"
              onClick={() => {
                setMessage(null);
                setEditing({ id: null, values: blank() });
              }}
            >
              <Plus aria-hidden /> Tambah {noun}
            </Button>
          ) : null}
        </div>
      </div>

      {editing && onSave ? (
        <MasterForm
          key={editing.id ?? "new"}
          title={editing.id ?? `Tambah ${noun}`}
          fields={fields}
          initial={editing.values}
          creating={editing.id === null}
          onCancel={() => setEditing(null)}
          onSave={async (values) => {
            const res = await onSave(editing.id, values);
            setMessage(res);
            if (res.ok) setEditing(null);
          }}
        />
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            {columns.map((c) => (
              <TableHead key={c.name}>{c.label}</TableHead>
            ))}
            <TableHead>Status</TableHead>
            {onSave ? <TableHead /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => (
            <TableRow key={r.id} data-testid={`master-${r.id}`}>
              <TableCell className="tabular whitespace-nowrap">{r.id}</TableCell>
              {columns.map((c, i) => (
                <TableCell key={c.name} className="max-w-72 whitespace-normal">
                  <span className={i === 0 ? "font-medium" : undefined}>{shown(c, r.values[c.name])}</span>
                  {i === 0 && r.issues.length ? (
                    <ul className="text-warning-foreground text-xs">
                      {r.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                </TableCell>
              ))}
              <TableCell>{r.values.active ? <Badge variant="secondary">Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}</TableCell>
              {onSave ? (
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Ubah ${r.id}`}
                    onClick={() => {
                      setMessage(null);
                      setEditing({ id: r.id, values: r.values });
                    }}
                  >
                    Ubah
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-muted-foreground text-xs">
        {list.length} dari {rows.length} {noun}
      </p>
    </div>
  );
}

function MasterForm({
  title,
  fields,
  initial,
  creating,
  onSave,
  onCancel,
}: {
  creating: boolean;
  title: string;
  fields: readonly MasterField[];
  initial: MasterValues;
  onSave: (values: MasterValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = (name: string, value: string | boolean) => setV((p) => ({ ...p, [name]: value }));
  const check = (name: string, label: string) => (
    <label key={name} className="flex items-center gap-2 self-end pb-2 text-sm">
      <input type="checkbox" className="accent-primary" checked={!!v[name]} onChange={(e) => set(name, e.target.checked)} />
      {label}
    </label>
  );

  return (
    <form
      aria-label={title}
      className="bg-muted/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(() => onSave(v));
      }}
    >
      <p className="text-sm font-medium sm:col-span-2 lg:col-span-4">{title}</p>
      {fields.filter((f) => !f.readOnly).map((f) => {
        if (f.type === "checkbox") return check(f.name, f.label);
        const value = String(v[f.name] ?? "");
        return (
          <label key={f.name} className={`grid content-start gap-1 text-sm ${f.wide ? "sm:col-span-2" : ""}`}>
            <span className="text-muted-foreground text-xs">{f.label}</span>
            {f.type === "select" ? (
              <select aria-label={f.label} className={SELECT} value={value} onChange={(e) => set(f.name, e.target.value)}>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label ?? o.value}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <Input aria-label={f.label} required={f.required} readOnly={f.createOnly && !creating} className={f.createOnly && !creating ? "bg-muted" : undefined} list={f.suggestions ? `list-${f.name}` : undefined} value={value} onChange={(e) => set(f.name, e.target.value)} />
                {f.suggestions ? (
                  <datalist id={`list-${f.name}`}>
                    {f.suggestions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                ) : null}
              </>
            )}
          </label>
        );
      })}
      {check("active", "Aktif")}
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
