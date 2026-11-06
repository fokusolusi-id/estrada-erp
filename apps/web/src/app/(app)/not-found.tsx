import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";

/** Shown inside the app shell (sidebar and header stay) when a page is missing or the role has no access. */
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        icon={ShieldAlert}
        title="Halaman tidak ditemukan atau tidak dapat diakses"
        description="Alamat salah, data sudah tidak ada, atau peran Anda tidak memiliki akses ke halaman ini."
        action={
          <Button asChild>
            <Link href="/">Kembali ke Beranda</Link>
          </Button>
        }
      />
    </div>
  );
}
