"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCoa, type CoaState } from "./actions";

const SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

export interface CoaRecord {
  code: string;
  name: string;
  category: string;
  defaultOwnerUnit: string | null;
  active: boolean;
  guidance: string | null;
}

const EMPTY: CoaRecord = { code: "", name: "", category: "OPEX", defaultOwnerUnit: null, active: true, guidance: null };

/** Add a code, or pick one to edit. The code itself never changes once lines use it. */
export function CoaForm({ accounts, units }: { accounts: CoaRecord[]; units: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState<CoaState, FormData>(saveCoa, { ok: false, message: "" });
  const [picked, setPicked] = useState<CoaRecord | null>(null);
  const r = picked ?? EMPTY;
  const err = (f: string) => state.errors?.[f]?.[0];

  return (
    <form action={action} key={r.code || "new"} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="coa-pick">Ubah kode yang ada</Label>
        <select
          id="coa-pick"
          className={SELECT}
          value={picked?.code ?? ""}
          onChange={(e) => setPicked(accounts.find((a) => a.code === e.target.value) ?? null)}
        >
          <option value="">— Tambah kode baru —</option>
          {accounts.map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} · {a.name}
            </option>
          ))}
        </select>
      </div>
      <input type="hidden" name="mode" value={picked ? "update" : "create"} />
      {picked ? <input type="hidden" name="code" value={picked.code} /> : null}
      <div className="grid gap-2">
        <Label htmlFor="coa-code">Kode</Label>
        <Input id="coa-code" name={picked ? undefined : "code"} defaultValue={r.code} disabled={!!picked} required aria-invalid={!!err("code")} />
        {err("code") ? <p className="text-destructive text-xs">{err("code")}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="coa-name">Nama</Label>
        <Input id="coa-name" name="name" defaultValue={r.name} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="coa-category">Kategori</Label>
        <select id="coa-category" name="category" className={SELECT} defaultValue={r.category}>
          {["Revenue", "COGS", "OPEX", "OTHERS", "CAPEX"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="coa-owner">Default owner</Label>
        <select id="coa-owner" name="defaultOwnerUnit" className={SELECT} defaultValue={r.defaultOwnerUnit ?? ""}>
          <option value="">—</option>
          {units.map((u) => (
            <option key={u.code} value={u.code}>
              {u.code} · {u.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="coa-guidance">Panduan pengisian</Label>
        <Input id="coa-guidance" name="guidance" defaultValue={r.guidance ?? ""} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={r.active} /> Aktif (kode nonaktif tidak bisa dipakai untuk baris baru)
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : picked ? "Simpan perubahan" : "Tambah COA"}
        </Button>
        {state.message ? <p className={state.ok ? "text-success text-sm" : "text-destructive text-sm"}>{state.message}</p> : null}
      </div>
    </form>
  );
}
