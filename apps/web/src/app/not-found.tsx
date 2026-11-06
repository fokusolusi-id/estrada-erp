import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Root 404 for URLs outside both route groups (no session or shell available here). */
export default function NotFound() {
  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="mx-auto mb-2 size-14" />
        <div className="text-primary text-xl font-semibold">ERP Estrada</div>
        <p className="mt-6 text-sm font-medium">Halaman tidak ditemukan</p>
        <p className="text-muted-foreground mt-1 text-sm">Alamat yang Anda buka tidak ada atau Anda tidak memiliki akses.</p>
        <Button asChild className="mt-4">
          <Link href="/">Kembali ke Beranda</Link>
        </Button>
      </div>
    </main>
  );
}
