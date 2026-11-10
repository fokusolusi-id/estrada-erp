"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityMultiSelect, type EntityOption } from "@/components/erp/entity-multi-select";
import { inviteUser, type InviteState } from "./actions";

const SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

export function InviteForm({
  units,
  roles,
  entities,
}: {
  units: { code: string; name: string }[];
  roles: { value: string; label: string }[];
  entities: EntityOption[];
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteUser, { ok: false, message: "" });
  const err = (f: string) => state.errors?.[f]?.[0];

  return (
    <form action={action} className="grid gap-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">Identitas</legend>
        <div className="grid gap-2">
          <Label htmlFor="name">Nama</Label>
          <Input id="name" name="name" required aria-invalid={!!err("name")} />
          {err("name") ? <p className="text-destructive text-xs">{err("name")}</p> : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required aria-invalid={!!err("email")} />
          {err("email") ? <p className="text-destructive text-xs">{err("email")}</p> : null}
        </div>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">Penempatan</legend>
        <div className="grid gap-2">
          <Label htmlFor="title">Jabatan</Label>
          <Input id="title" name="title" placeholder="mis. Head of SCM" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="orgUnit">Unit</Label>
          <select id="orgUnit" name="orgUnit" className={SELECT} required>
            {units.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code} · {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="role">Role</Label>
          <select id="role" name="role" className={SELECT} defaultValue="requestor">
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">Akses entitas</legend>
        <EntityMultiSelect options={entities} defaultValue={["ESTRADA"]} />
      </fieldset>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
        {state.message ? (
          <p className={state.ok ? "text-success mr-auto text-sm" : "text-destructive mr-auto text-sm"}>{state.message}</p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Mengirim…" : "Kirim undangan"}
        </Button>
      </div>
    </form>
  );
}
