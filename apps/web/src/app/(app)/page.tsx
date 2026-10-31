import Link from "next/link";
import { ROLE_LABEL, type Role } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** One home page per role: what is waiting for this person, and where to act. */
const HOME: Record<Role, { title: string; body: string; cta?: { href: string; label: string } }> = {
  requestor: {
    title: "Usulan RKA Anda",
    body: "Isi baris anggaran unit Anda untuk Jan–Des, lengkapi dasar perhitungan, lalu kirim ke Default Owner.",
    cta: { href: "/rka", label: "Buka RKA Saya" },
  },
  default_owner: {
    title: "Antrean konsolidasi",
    body: "Periksa usulan dari unit Anda, kembalikan dengan catatan bila perlu, lalu kirim ke Division Owner.",
    cta: { href: "/rka/queue", label: "Buka antrean konsolidasi" },
  },
  division_owner: {
    title: "RKA divisi menunggu persetujuan",
    body: "Setujui RKA departemen di divisi Anda dan kirim ke Finance.",
    cta: { href: "/rka/division", label: "Buka RKA Divisi" },
  },
  finance: {
    title: "Status board semua divisi",
    body: "Review konsistensi, minta klarifikasi, dan finalisasi RKA konsolidasi.",
    cta: { href: "/rka/review", label: "Buka status board" },
  },
  director: {
    title: "Ringkasan RKA",
    body: "Tinjau Management Summary dan kunci versi final setelah Finance memfinalisasi.",
    cta: { href: "/rka/lock", label: "Buka Kunci RKA" },
  },
  auditor: {
    title: "Audit",
    body: "Akses baca seluruh RKA dan jejak audit lengkap.",
    cta: { href: "/summary", label: "Buka ringkasan" },
  },
  admin: {
    title: "Data master",
    body: "Kelola pengguna, posisi, unit organisasi, entitas, dan COA.",
    cta: { href: "/admin/users", label: "Kelola pengguna" },
  },
};

export default async function HomePage() {
  const user = await requireUser();
  const home = HOME[user.actor.role];
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Halo, {user.name}</h1>
        <p className="text-muted-foreground text-sm">
          {ROLE_LABEL[user.actor.role]} · {user.actor.orgUnit} · Entitas: {user.actor.entities.join(", ")}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{home.title}</CardTitle>
          <CardDescription>{home.body}</CardDescription>
        </CardHeader>
        {home.cta ? (
          <CardContent>
            <Button asChild>
              <Link href={home.cta.href}>{home.cta.label}</Link>
            </Button>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
