"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestPasswordReset } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => {
      await requestPasswordReset({ email: String(form.get("email")), redirectTo: "/set-password" });
      // Same message whether or not the email exists, so accounts can't be probed.
      setSent(true);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lupa kata sandi</CardTitle>
        <CardDescription>Kami kirim tautan atur ulang ke email Anda.</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="text-sm">Jika email terdaftar, tautan atur ulang sudah dikirim. Tautan berlaku 24 jam.</p>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Mengirim…" : "Kirim tautan"}
            </Button>
          </form>
        )}
        <Link href="/login" className="text-primary mt-4 block text-center text-sm hover:underline">
          Kembali ke halaman masuk
        </Link>
      </CardContent>
    </Card>
  );
}
