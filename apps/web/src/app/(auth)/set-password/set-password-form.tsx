"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetPassword } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tautan tidak valid</CardTitle>
          <CardDescription>Tautan sudah kedaluwarsa atau tidak lengkap.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/forgot-password" className="text-primary text-sm hover:underline">
            Minta tautan baru
          </Link>
        </CardContent>
      </Card>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) {
      setError("Konfirmasi kata sandi tidak sama.");
      return;
    }
    setError(null);
    start(async () => {
      const { error } = await resetPassword({ newPassword: password, token: token! });
      if (error) {
        setError("Tautan sudah kedaluwarsa. Minta tautan baru.");
        return;
      }
      router.replace("/login");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buat kata sandi</CardTitle>
        <CardDescription>Minimal 10 karakter.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <div className="grid gap-2">
            <Label htmlFor="password">Kata sandi baru</Label>
            <Input id="password" name="password" type="password" minLength={10} autoComplete="new-password" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm">Ulangi kata sandi</Label>
            <Input id="confirm" name="confirm" type="password" minLength={10} autoComplete="new-password" required />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan kata sandi"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
