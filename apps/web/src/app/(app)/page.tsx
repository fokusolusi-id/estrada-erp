import Link from "next/link";
import { ArrowRight, CalendarClock, CircleCheck, Inbox } from "lucide-react";
import { ROLE_LABEL, cycleProgress, daysLeft, entityScopeLabel, groupActivity, pendingByStage, type Role } from "@estrada/domain";
import { HomeCards } from "@/components/erp/home-cards";
import { ActivityList, PendingStages } from "@/components/erp/home-overview";
import { displayUnit } from "@/lib/display-unit";
import { loadHome } from "@/lib/home";
import { loadScopedLines, openVersion } from "@/lib/rka";
import { viewLines } from "@/lib/view-filter";
import { ViewNote } from "@/components/erp/view-note";
import { loadOrg } from "@/lib/workflow";
import { navFor } from "@/lib/nav";
import { PageHeader } from "@/components/erp/page-header";
import { ProgressBoard } from "@/components/erp/progress-board";
import { requireUser } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { rkaLabel } from "@estrada/domain";

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
    body: "Review konsistensi, minta klarifikasi, finalisasi RKA konsolidasi, lalu kunci versi final.",
    cta: { href: "/rka/review", label: "Buka status board" },
  },
  bfp: {
    title: "Pemeriksaan pembayaran",
    body: "Periksa kelengkapan dokumen dan sisa anggaran Permintaan Pembayaran sebelum diteruskan ke Head Divisi.",
    cta: { href: "/pembayaran?tab=antrian", label: "Buka yang perlu diperiksa" },
  },
  cash_manager: {
    title: "Jadwal pembayaran",
    body: "Jadwalkan Permintaan Pembayaran yang sudah disetujui, pilih bank asal, lalu unggah bukti bayar.",
    cta: { href: "/pembayaran?tab=antrian", label: "Buka jadwal pembayaran" },
  },
  director: {
    title: "Ringkasan RKA",
    body: "Tinjau Management Summary dan status RKA; versi final dikunci oleh Head Finance.",
    cta: { href: "/summary", label: "Buka Management Summary" },
  },
  auditor: {
    title: "Audit",
    body: "Akses baca seluruh RKA dan jejak audit lengkap.",
    cta: { href: "/summary", label: "Buka ringkasan" },
  },
  admin: {
    title: "Data master",
    body: "Kelola pengguna, posisi, unit organisasi, dan entitas.",
    cta: { href: "/admin/users", label: "Kelola pengguna" },
  },
};

export default async function HomePage() {
  const user = await requireUser();
  const home = HOME[user.actor.role];
  const header = (
    <PageHeader title={`Halo, ${user.name}`} description={`${ROLE_LABEL[user.actor.role]} · ${user.actor.orgUnit} · ${entityScopeLabel(user.actor.entities)}`} note={<ViewNote />} />
  );
  const action = (
    <Card>
      <CardHeader>
        <CardTitle>{home.title}</CardTitle>
        <CardDescription>{home.body}</CardDescription>
      </CardHeader>
      {home.cta ? (
        <CardContent>
          <Button asChild>
            <Link href={home.cta.href}>
              {home.cta.label} <ArrowRight aria-hidden />
            </Link>
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
  // Admin keeps people data and sees no budget lines.
  if (user.actor.role === "admin") {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {header}
        {action}
      </div>
    );
  }

  const [version, scoped, org] = await Promise.all([openVersion(), loadScopedLines(user), loadOrg()]);
  const lines = await viewLines(scoped);
  const [cards, unit] = await Promise.all([loadHome(user, org), displayUnit()]);
  const menu = new Set(navFor(user.actor.role, (u) => org.isWithin(user.actor.orgUnit, u)).map((n) => n.href));
  const waiting = lines.filter((l) => l.actions.length).length;
  const final = lines.filter((l) => l.state === "awaiting_lock" || l.state === "locked").length;
  const left = version?.submissionDeadline ? daysLeft(version.submissionDeadline, new Date()) : null;
  const activity = groupActivity(
    lines.flatMap((l) => l.history.map((e) => ({ ...e, lineId: l.id, coaCode: l.coaCode, name: l.item || l.coaName }))),
  ).slice(0, 8);
  // Only roles with the line list in their menu get links into it.
  const hasList = navFor(user.actor.role).some((n) => n.href === "/rka");

  // With nothing waiting on this person, who is holding the rest matters more than their empty queue.
  const chase = (
        <Card>
          <CardHeader>
            <CardTitle>Belum final</CardTitle>
            <CardDescription>Baris dalam cakupan Anda yang belum difinalisasi, menurut siapa yang memegangnya.</CardDescription>
          </CardHeader>
          <CardContent>
            <PendingStages pending={pendingByStage(lines, (u) => org.divisionOf(u))} {...(hasList ? { hrefFor: (state, divisi) => `/rka?${new URLSearchParams({ status: state, ...(divisi ? { divisi } : {}) })}` } : {})} />
          </CardContent>
        </Card>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {header}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Menunggu tindakan Anda"
          value={String(waiting)}
          note={waiting ? "baris di antrean Anda" : "Tidak ada yang menunggu"}
          tone={waiting ? "attention" : "calm"}
          icon={<Inbox aria-hidden className="size-4" />}
        />
        <StatCard
          label="Batas pengajuan"
          value={left === null ? "–" : left > 0 ? `${left} hari lagi` : left === 0 ? "Hari ini" : "Lewat"}
          note={version?.submissionDeadline ? DATE.format(version.submissionDeadline) : "Belum ditetapkan"}
          tone={left !== null && left <= 3 ? "attention" : "calm"}
          icon={<CalendarClock aria-hidden className="size-4" />}
        />
        <StatCard
          label="Sudah final"
          value={lines.length ? `${Math.round((final / lines.length) * 100)}%` : "–"}
          note={`${final} dari ${lines.length} baris dalam cakupan Anda`}
          tone="calm"
          icon={<CircleCheck aria-hidden className="size-4" />}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 2xl:grid-cols-3">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6 2xl:col-span-2">
          {waiting ? action : null}
          {chase}
          {waiting ? null : action}
          <Card>
            <CardHeader>
              <CardTitle>Posisi {version ? rkaLabel(version) : "RKA"}</CardTitle>
              <CardDescription>Baris dalam cakupan Anda per divisi dan tahap.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProgressBoard rows={cycleProgress(lines, (u) => org.divisionOf(u))} />
            </CardContent>
          </Card>
        </div>
        <Card className="min-w-0 content-start">
          <CardHeader>
            <CardTitle>Aktivitas terbaru</CardTitle>
            <CardDescription>Perpindahan baris terakhir dalam cakupan Anda.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityList groups={activity} />
          </CardContent>
        </Card>
      </div>
      {cards ? <HomeCards data={cards} unit={unit} link={(href) => (menu.has(href) ? href : undefined)} /> : null}
    </div>
  );
}

const DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

function StatCard({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: "attention" | "calm"; icon: React.ReactNode }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription className="flex items-center gap-2 font-medium">
          <span className={tone === "attention" ? "text-state-finance" : "text-muted-foreground"}>{icon}</span>
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1 px-4">
        <span className="tabular text-figure">{value}</span>
        <span className="text-muted-foreground text-xs">{note}</span>
      </CardContent>
    </Card>
  );
}
