"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveEntity, saveUnit, type MasterState } from "./actions";

const SELECT =
  "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";
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
    <form action={action} className="flex flex-wrap items-center gap-2">
      {unit ? <input type="hidden" name="code" value={unit.code} /> : <input type="hidden" name="isNew" value="1" />}
      {unit ? (
        <span className="w-20 font-mono text-sm">{unit.code}</span>
      ) : (
        <Input name="code" placeholder="Kode" aria-label="Kode unit" className="w-24" required />
      )}
      <Input name="name" placeholder="Nama unit" aria-label="Nama unit" defaultValue={unit?.name} className="w-56" required />
      <select name="type" aria-label="Tipe" className={SELECT} defaultValue={unit?.type ?? "unit"}>
        {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <select name="parentCode" aria-label="Induk" className={SELECT} defaultValue={unit?.parentCode ?? ""}>
        <option value="">— Tanpa induk —</option>
        {parents.filter((p) => p.value !== unit?.code).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      <Button type="submit" size="sm" variant={unit ? "outline" : "default"} disabled={pending}>{unit ? "Simpan" : "Tambah"}</Button>
      <Msg s={s} />
    </form>
  );
}

export function EntityForm({ entity }: { entity?: { code: string; name: string; costType: string; active: boolean } }) {
  const [s, action, pending] = useActionState<MasterState, FormData>(saveEntity, { ok: false, message: "" });
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {entity ? <input type="hidden" name="code" value={entity.code} /> : <input type="hidden" name="isNew" value="1" />}
      {entity ? (
        <span className="w-20 font-mono text-sm">{entity.code}</span>
      ) : (
        <Input name="code" placeholder="Kode" aria-label="Kode entitas" className="w-24" required />
      )}
      <Input name="name" placeholder="Nama entitas" aria-label="Nama entitas" defaultValue={entity?.name} className="w-56" required />
      <select name="costType" aria-label="Jenis biaya" className={SELECT} defaultValue={entity?.costType ?? "direct"}>
        {COST.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      {entity ? (
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="active" defaultChecked={entity.active} className="accent-primary" /> Aktif
        </label>
      ) : null}
      <Button type="submit" size="sm" variant={entity ? "outline" : "default"} disabled={pending}>{entity ? "Simpan" : "Tambah"}</Button>
      <Msg s={s} />
    </form>
  );
}
