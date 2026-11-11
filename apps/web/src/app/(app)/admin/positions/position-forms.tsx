"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityMultiSelect, type EntityOption } from "@/components/erp/entity-multi-select";
import { createPosition, setActing, updatePosition, type PositionState } from "./actions";

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
  entities,
  defaults,
}: {
  units: Option[];
  roles: Option[];
  users: Option[];
  entities: EntityOption[];
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
      <div className="grid gap-2 sm:col-span-2">
        <Label>Entitas</Label>
        <EntityMultiSelect options={entities} defaultValue={["ESTRADA"]} />
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

/** Edits unit, jabatan, role and entitas of one position; `holders` adds a pemegang field. */
export function EditPositionForm({
  position,
  units,
  roles,
  entities,
  holders,
}: {
  position: { id: string; orgUnit: string; title: string; role: string; entities: string[]; holderUserId: string | null; holderName?: string | null };
  units: Option[];
  roles: Option[];
  entities: EntityOption[];
  holders?: Option[];
}) {
  const [state, action, pending] = useActionState<PositionState, FormData>(updatePosition, { ok: false, message: "" });
  const id = `edit-${position.id}`;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="positionId" value={position.id} />
      <div className="grid gap-2">
        <Label htmlFor={`${id}-title`}>Jabatan</Label>
        <Input id={`${id}-title`} name="title" defaultValue={position.title} required />
        {state.errors?.title ? <p className="text-destructive text-xs">{state.errors.title[0]}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-unit`}>Unit</Label>
        <select id={`${id}-unit`} name="orgUnit" className={SELECT} defaultValue={position.orgUnit} required>
          {units.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-role`}>Role</Label>
        <select id={`${id}-role`} name="role" className={SELECT} defaultValue={position.role}>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {holders ? (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-holder`}>Pemegang</Label>
          <select id={`${id}-holder`} name="holderUserId" className={SELECT} defaultValue={position.holderUserId ?? ""}>
            <option value="">— Kosong —</option>
            {holders.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {holders ? (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-holder-name`}>Nama di struktur</Label>
          <Input id={`${id}-holder-name`} name="holderName" defaultValue={position.holderName ?? ""} placeholder="mis. Arya" />
          <p className="text-muted-foreground text-xs">Nama dari dokumen struktur organisasi, tampil di bagan sampai orangnya punya akun dan dipilih sebagai Pemegang.</p>
        </div>
      ) : null}
      <div className="grid gap-2 sm:col-span-2">
        <Label>Entitas</Label>
        <EntityMultiSelect options={entities} defaultValue={position.entities} />
        {state.errors?.entities ? <p className="text-destructive text-xs">{state.errors.entities[0]}</p> : null}
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}
