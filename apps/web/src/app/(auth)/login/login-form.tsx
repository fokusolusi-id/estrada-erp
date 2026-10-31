"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERRORS: Record<string, string> = {
  no_position: "Akun Anda belum memiliki posisi. Hubungi Admin.",
};

export function LoginForm({ next, error }: { next: string; error?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(error ? (ERRORS[error] ?? null) : null);
  const [pending, start] = useTransition();

  // A plain submit handler, not a form action: React resets action forms, which would wipe the email after a failed attempt.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setMessage(null);
    start(async () => {
      const { error } = await signIn.email({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (error) {
        setMessage(
          error.status === 429
            ? "Terlalu banyak percobaan. Coba lagi dalam beberapa menit."
            : "Email atau kata sandi salah.",
        );
        return;
      }
      router.replace(next);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Masuk</CardTitle>
        <CardDescription>Gunakan email kantor Anda.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          {message ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Kata sandi</Label>
              <Link href="/forgot-password" className="text-primary text-sm hover:underline">
                Lupa kata sandi?
              </Link>
            </div>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Memproses…" : "Masuk"}
          </Button>
          <p className="text-muted-foreground text-center text-xs">Belum punya akun? Akun dibuat oleh Admin melalui undangan.</p>
        </form>
      </CardContent>
    </Card>
  );
}
