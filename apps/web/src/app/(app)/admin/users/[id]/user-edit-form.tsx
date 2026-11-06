"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateUser, type InviteState } from "../actions";

export function UserEditForm({ user }: { user: { id: string; name: string; email: string; active: boolean } }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(updateUser, { ok: false, message: "" });
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="userId" value={user.id} />
      <div className="grid gap-2">
        <Label htmlFor="u-name">Nama</Label>
        <Input id="u-name" name="name" defaultValue={user.name} required />
        {state.errors?.name ? <p className="text-destructive text-xs">{state.errors.name[0]}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="u-email">Email</Label>
        <Input id="u-email" value={user.email} readOnly disabled />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={user.active} className="accent-primary" />
        Akun aktif
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
        {state.message ? (
          <p className={state.ok ? "text-success text-sm" : "text-destructive text-sm"}>{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
