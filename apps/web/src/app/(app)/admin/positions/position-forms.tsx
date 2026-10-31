"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPosition, setActing, type PositionState } from "./actions";

const SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

type Option = { value: string; label: string };

function Result({ state }: { state: PositionState }) {
  return state.message ? <p className={state.ok ? "text-success text-sm" : "text-destructive text-sm"}>{state.message}</p> : null;
}

export function CreatePositionForm({
  units,
  roles,
  users,
  defaults,
}: {
  units: Option[];
  roles: Option[];
  users: Option[];
  defaults?: { orgUnit?: string; role?: string };
}) {
  const [state, action, pending] = useActionState<PositionState, FormData>(createPosition, { ok: false, message: "" });
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="pos-unit">Unit</Label>
        <select id="pos-unit" name="orgUnit" className={SELECT} defaultValue={defaults?.orgUnit} required>
          {units.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pos-role">Role</Label>
        <select id="pos-role" name="role" className={SELECT} defaultValue={defaults?.role ?? "default_owner"}>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pos-title">Jabatan</Label>
        <Input id="pos-title" name="title" placeholder="mis. Head of FRM" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pos-entities">Entitas (pisahkan koma, * = semua)</Label>
        <Input id="pos-entities" name="entities" defaultValue="ESTRADA" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pos-acting">Pejabat sementara (pjs)</Label>
        <select id="pos-acting" name="actingUserId" className={SELECT} defaultValue="">
          <option value="">— Kosong —</option>
          {users.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Buat posisi"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function ActingForm({ positionId, current, users }: { positionId: string; current: string | null; users: Option[] }) {
  const [state, action, pending] = useActionState<PositionState, FormData>(setActing, { ok: false, message: "" });
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="positionId" value={positionId} />
      <select name="actingUserId" aria-label="Pilih pjs" className={`${SELECT} w-56`} defaultValue={current ?? ""}>
        <option value="">— Kosong —</option>
        {users.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Simpan pjs
      </Button>
      <Result state={state} />
    </form>
  );
}
