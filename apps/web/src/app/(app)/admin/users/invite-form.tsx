"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteUser, type InviteState } from "./actions";

const SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

export function InviteForm({
  units,
  roles,
}: {
  units: { code: string; name: string }[];
  roles: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteUser, { ok: false, message: "" });
  const err = (f: string) => state.errors?.[f]?.[0];

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
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
      <div className="grid gap-2">
        <Label htmlFor="entities">Entitas (pisahkan koma, * = semua)</Label>
        <Input id="entities" name="entities" defaultValue="ESTRADA" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Mengirim…" : "Kirim undangan"}
        </Button>
        {state.message ? (
          <p className={state.ok ? "text-success text-sm" : "text-destructive text-sm"}>{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
