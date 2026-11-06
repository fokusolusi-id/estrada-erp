import Link from "next/link";
import { ArrowRight, CalendarClock, CircleCheck, Inbox } from "lucide-react";
import { ROLE_LABEL, cycleProgress, daysLeft, type ApprovalAction, type Role } from "@estrada/domain";
import { loadScopedLines, openVersion } from "@/lib/rka";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { ProgressBoard } from "@/components/erp/progress-board";
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
    body: "Review konsistensi, minta klarifikasi, finalisasi RKA konsolidasi, lalu kunci versi final.",
    cta: { href: "/rka/review", label: "Buka status board" },
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

/** What each handoff is called in the activity list. */
const DID: Record<ApprovalAction, string> = {
  submit: "mengirim ke Default Owner",
  return: "mengembalikan",
  consolidate: "mengirim ke Division Owner",
  approve: "menyetujui ke Finance",
  clarify: "meminta klarifikasi",
  finalize: "memfinalisasi",
  lock: "mengunci",
};
const WHEN = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export default async function HomePage() {
  const user = await requireUser();
  const home = HOME[user.actor.role];
  const header = (
    <PageHeader title={`Halo, ${user.name}`} description={`${ROLE_LABEL[user.actor.role]} · ${user.actor.orgUnit} · Entitas: ${user.actor.entities.join(", ")}`} />
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
      <div className="mx-auto grid max-w-5xl gap-6">
        {header}
        {action}
      </div>
    );
  }

  const [version, lines, org] = await Promise.all([openVersion(), loadScopedLines(user), loadOrg()]);
  const waiting = lines.filter((l) => l.actions.length).length;
  const final = lines.filter((l) => l.state === "awaiting_lock" || l.state === "locked").length;
  const left = version?.submissionDeadline ? daysLeft(version.submissionDeadline, new Date()) : null;
  const activity = lines
    .flatMap((l) => l.history.map((e) => ({ ...e, line: l })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
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
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6 lg:col-span-2">
          {action}
          <Card>
            <CardHeader>
              <CardTitle>Posisi {version ? version.name : "RKA"}</CardTitle>
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
            {activity.length ? (
              <ol className="grid gap-3" aria-label="Aktivitas terbaru">
                {activity.map((e, i) => (
                  <li key={i} className="grid gap-0.5 border-l-2 pl-3 text-sm">
                    <span>
                      <span className="font-medium">{e.actorName}</span> {DID[e.action]}{" "}
                      <Link href={`/rka/line/${e.line.id}`} className="text-primary hover:underline">
                        {e.line.coaCode}
                      </Link>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {e.actorRole} · {WHEN.format(new Date(e.at))}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground text-sm">Belum ada aktivitas.</p>
            )}
          </CardContent>
        </Card>
      </div>
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
        <span className="text-xl font-semibold tracking-tight">{value}</span>
        <span className="text-muted-foreground text-xs">{note}</span>
      </CardContent>
    </Card>
  );
}
