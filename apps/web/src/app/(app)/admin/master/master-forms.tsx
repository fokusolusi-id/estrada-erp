"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ENTITY_GRID, UNIT_GRID } from "./grid";
import { ChangeFields } from "@/components/erp/change-fields";
import { saveEntity, saveUnit, type MasterState } from "./actions";

const SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";
const ROW = "grid grid-cols-1 items-center gap-2 @3xl:gap-3";

export function ColumnHead({ cols, labels }: { cols: string; labels: string[] }) {
  return (
    <div className={`text-muted-foreground hidden border-b pb-2 text-xs font-medium uppercase tracking-wide @3xl:grid @3xl:gap-3 ${cols}`}>
      {labels.map((l, i) => <span key={i}>{l}</span>)}
    </div>
  );
}

const TYPES = [
  { value: "company", label: "Perusahaan" },
  { value: "division", label: "Divisi" },
  { value: "department", label: "Departemen" },
  { value: "unit", label: "Unit" },
];
const COST = [
  { value: "direct", label: "Direct" },
  { value: "indirect", label: "Indirect" },
];

function Msg({ s }: { s: MasterState }) {
  return s.message ? <span className={s.ok ? "text-success text-sm" : "text-destructive text-sm"}>{s.message}</span> : null;
}

export function UnitForm({
  unit,
  parents,
}: {
  unit?: { code: string; name: string; type: string; parentCode: string | null };
  parents: { value: string; label: string }[];
}) {
  const [s, action, pending] = useActionState<MasterState, FormData>(saveUnit, { ok: false, message: "" });
  return (
    <form action={action} className={`${ROW} ${UNIT_GRID}`}>
      {unit ? <input type="hidden" name="code" value={unit.code} /> : <input type="hidden" name="isNew" value="1" />}
      {unit ? (
        <span className="font-mono text-sm font-medium">{unit.code}</span>
      ) : (
        <Input name="code" placeholder="Kode" aria-label="Kode unit" className="font-mono uppercase" required />
      )}
      <Input name="name" placeholder="Nama unit" aria-label="Nama unit" defaultValue={unit?.name} required />
      <select name="type" aria-label="Tipe" className={SELECT} defaultValue={unit?.type ?? "unit"}>
        {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <select name="parentCode" aria-label="Induk" className={SELECT} defaultValue={unit?.parentCode ?? ""}>
        <option value="">— Tanpa induk —</option>
        {parents.filter((p) => p.value !== unit?.code).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      <Button type="submit" size="sm" variant={unit ? "outline" : "default"} disabled={pending}>{unit ? "Simpan" : "Tambah"}</Button>
      {s.message ? <div className="@3xl:col-span-full"><Msg s={s} /></div> : null}
    </form>
  );
}

const COMPANY_FIELDS = [
  { name: "npwp", label: "NPWP" },
  { name: "nib", label: "NIB" },
  { name: "authorisedCapital", label: "Modal dasar (Rp)" },
  { name: "domicile", label: "Kedudukan" },
  { name: "address", label: "Alamat" },
  { name: "phone", label: "Telepon" },
  { name: "email", label: "Email" },
  { name: "director", label: "Direktur" },
  { name: "commissioner", label: "Komisaris" },
] as const;

export type EntityRecord = { code: string; name: string; costType: string; active: boolean } & Partial<Record<(typeof COMPANY_FIELDS)[number]["name"], string | null>>;

export function EntityForm({ entity }: { entity?: EntityRecord }) {
  const [s, action, pending] = useActionState<MasterState, FormData>(saveEntity, { ok: false, message: "" });
  return (
    <form action={action} className={`${ROW} ${ENTITY_GRID}`}>
      {entity ? <input type="hidden" name="code" value={entity.code} /> : <input type="hidden" name="isNew" value="1" />}
      {entity ? (
        <span className="font-mono text-sm font-medium">{entity.code}</span>
      ) : (
        <Input name="code" placeholder="Kode" aria-label="Kode entitas" className="font-mono uppercase" required />
      )}
      <Input name="name" placeholder="Nama entitas" aria-label="Nama entitas" defaultValue={entity?.name} required />
      <select name="costType" aria-label="Jenis biaya" className={SELECT} defaultValue={entity?.costType ?? "direct"}>
        {COST.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      {entity ? (
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="active" defaultChecked={entity.active} className="accent-primary" /> Aktif
        </label>
      ) : (
        <span />
      )}
      <Button type="submit" size="sm" variant={entity ? "outline" : "default"} disabled={pending}>{entity ? "Ajukan" : "Ajukan baru"}</Button>
      <details className="col-span-full">
        <summary className="cursor-pointer text-sm font-medium">
          Data perusahaan<span className="text-muted-foreground font-normal">{entity?.npwp ? ` · NPWP ${entity.npwp}` : ""}</span>
        </summary>
        <div className="mt-2 grid gap-3 @xl:grid-cols-3">
          {COMPANY_FIELDS.map((f) => (
            <label key={f.name} className="grid gap-1 text-sm">
              <span className="text-muted-foreground text-xs">{f.label}</span>
              <Input name={f.name} aria-label={f.label} defaultValue={entity?.[f.name] ?? ""} />
            </label>
          ))}
        </div>
      </details>
      <div className="col-span-full flex flex-wrap items-end gap-3">
        <ChangeFields />
      </div>
      {s.message ? <div className="@3xl:col-span-full"><Msg s={s} /></div> : null}
    </form>
  );
}
