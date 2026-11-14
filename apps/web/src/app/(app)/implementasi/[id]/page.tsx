import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PROJECT_STATUS_LABEL, baiKpi, bastProblems, canProject, delayDays, projectProgress, rfsProblems, siteDeleteProblems } from "@estrada/domain";
import { deliveryPeople, loadProjects, userNames } from "@/lib/implementasi";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { BaiKpi } from "@/components/erp/bai-kpi";
import { PageHeader } from "@/components/erp/page-header";
import { ProjectContract } from "@/components/erp/project-contract";
import { ProjectDrop } from "@/components/erp/project-drop";
import { ProjectSignoff } from "@/components/erp/project-signoff";
import { ProjectSites } from "@/components/erp/project-sites";
import { ProjectTelkom } from "@/components/erp/project-telkom";
import { ProjectTeam } from "@/components/erp/project-team";
import { SiteBai } from "@/components/erp/site-bai";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { approveSignoff, assignTeam, baiStep, changeContractSites, declareRfs, deleteSite, dropProject, prepareBast, recordTelkomDoc, returnBai, saveSite, setTelkomScheme } from "../actions";

export const metadata: Metadata = { title: "Proyek" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const [org, [project], people] = await Promise.all([loadOrg(), loadProjects(id), deliveryPeople()]);
  if (!project || !canProject(user.actor, "view", project, org)) notFound();

  const today = todayJakarta();
  const can = (action: Parameters<typeof canProject>[1]) => canProject(user.actor, action, project, org);
  const names = await userNames([project.rfs.proposedBy, project.bast.proposedBy, ...project.sites.flatMap((s) => [s.bai?.collectedBy, s.bai?.compiledBy, s.bai?.verifiedBy])]);
  const verified = project.sites.filter((s) => s.status === "Selesai").length;
  const RFS_BLOCKER = {
    sites_missing: `Baru ${project.sites.length} dari ${project.contractSites} lokasi kontrak yang terdaftar.`,
    sites_untested: "Masih ada lokasi yang belum lulus uji atau terkendala.",
  };
  const BAST_BLOCKER = {
    rfs: "RFS belum disahkan.",
    bai_incomplete: `BAI terverifikasi ${verified} dari ${project.contractSites} lokasi kontrak.`,
    bard: "Skema TELKOM: BARD belum dicatat.",
    baut: "Skema TELKOM: BAUT belum dicatat.",
  };
  const progress = projectProgress(project.sites, project.contractSites);
  const late = project.sites.filter((s) => delayDays(s, today) > 0).length;
  const stats = [
    { label: "Lokasi kontrak", value: String(project.contractSites) },
    { label: "Lokasi selesai", value: `${progress.done} / ${progress.total}` },
    { label: "Progres", value: `${progress.pct.toFixed(1).replace(".", ",")}%` },
    { label: "Lokasi terlambat", value: String(late), alert: late > 0 },
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={project.name}
        description={`${project.customer}${project.endCustomer ? ` · ${project.endCustomer}` : ""} · ${project.entity} · ${project.fiscalYear}`}
        actions={
          <>
            <Badge variant="secondary">{PROJECT_STATUS_LABEL[project.status]}</Badge>
            <Link href={`/implementasi/${project.id}/perencanaan`} className="text-sm font-medium underline underline-offset-4">
              Perencanaan
            </Link>
            <Link href={`/implementasi/${project.id}/serah-terima`} className="text-sm font-medium underline underline-offset-4">
              Serah terima
            </Link>
            <Link href={`/implementasi/${project.id}/garansi`} className="text-sm font-medium underline underline-offset-4">
              Garansi & penutupan
            </Link>
            <Link href="/implementasi" className="text-muted-foreground text-sm underline-offset-4 hover:underline">
              Semua proyek
            </Link>
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border p-4">
            <dt className="text-muted-foreground text-xs">{s.label}</dt>
            <dd className={s.alert ? "text-destructive tabular mt-1 text-xl font-semibold" : "tabular mt-1 text-xl font-semibold"}>{s.value}</dd>
          </div>
        ))}
      </dl>

      <Card>
        <CardHeader>
          <CardTitle>Lingkup kontrak</CardTitle>
          <CardDescription>Jumlah lokasi menurut kontrak adalah pembagi progres. Perubahannya (addendum) dicatat oleh BCD dengan dasarnya, sampai BAST disahkan.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectContract
            contractSites={project.contractSites}
            registered={project.sites.length}
            canChange={can("contract.change")}
            locked={!!project.bast.on || !["Initiation", "Pengadaan_Barang", "Implementasi"].includes(project.status)}
            onChange={changeContractSites.bind(null, project.id)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tim proyek</CardTitle>
          <CardDescription>Ditetapkan oleh Head PMO dari orang PMO. Delivery Control tidak merangkap Project Manager maupun Project Admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectTeam team={project.team} people={people} canAssign={canProject(user.actor, "assign", project, org)} onSave={assignTeam.bind(null, project.id)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>RFS dan BAST</CardTitle>
          <CardDescription>
            Project Manager menyatakan RFS setelah semua lokasi lulus uji. Project Admin menyiapkan BAST setelah BAI terverifikasi sama dengan jumlah lokasi kontrak. Keduanya disahkan
            Head PMO; BAST yang disahkan membawa proyek ke tahap Penagihan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectSignoff
            rfs={{
              ...project.rfs,
              proposedBy: project.rfs.proposedBy ? (names[project.rfs.proposedBy] ?? null) : null,
              blockers: rfsProblems(project).map((p) => RFS_BLOCKER[p]),
              canPropose: can("rfs.declare"),
              canApprove: can("rfs.approve"),
            }}
            bast={{
              ...project.bast,
              proposedBy: project.bast.proposedBy ? (names[project.bast.proposedBy] ?? null) : null,
              blockers: bastProblems({ ...project, rfsOn: project.rfs.on }).map((p) => BAST_BLOCKER[p]),
              canPropose: can("bast.prepare"),
              canApprove: can("bast.approve"),
            }}
            onDeclareRfs={declareRfs.bind(null, project.id)}
            onPrepareBast={prepareBast.bind(null, project.id)}
            onApprove={approveSignoff.bind(null, project.id)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>BARD dan BAUT</CardTitle>
          <CardDescription>Hanya untuk pelanggan skema TELKOM: kedua dokumen ditandatangani sebelum BAST. BCD menandai skemanya; Assurance mencatat dokumennya setelah RFS disahkan.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectTelkom
            telkomScheme={project.telkomScheme}
            bard={project.bard}
            baut={project.baut}
            rfsApproved={!!project.rfs.on}
            locked={!!project.bast.on}
            canRecord={can("telkom.record")}
            onScheme={setTelkomScheme.bind(null, project.id)}
            onRecord={recordTelkomDoc.bind(null, project.id)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ketepatan waktu BAI</CardTitle>
          <CardDescription>
            Target tiap langkah: Delivery Control 7 hari, Project Admin 5 hari, Assurance 3 hari, masing-masing dihitung sejak langkah sebelumnya. Langkah yang masih berjalan melewati target dihitung
            terlambat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BaiKpi kpi={baiKpi(project.sites, today)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>BAI per lokasi</CardTitle>
          <CardDescription>
            Tiga tangan, satu dokumen: Delivery Control mencatat BAI lokasi yang lulus uji, Project Admin mengompilasi, Assurance (BCD) memverifikasi untuk penagihan. Satu orang tidak
            memegang dua langkah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SiteBai
            sites={project.sites}
            names={names}
            can={{ collect: can("bai.collect"), compile: can("bai.compile"), verify: can("bai.verify") }}
            onStep={baiStep.bind(null, project.id)}
            onReturn={returnBai.bind(null, project.id)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lokasi</CardTitle>
          <CardDescription>
            Project Manager mendaftarkan lokasi; Project Manager dan Project Admin memperbaruinya. Keterlambatan dihitung sistem dari tanggal rencana selesai.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectSites
            sites={project.sites.map((s) => ({ ...s, deletable: siteDeleteProblems(s, project).length === 0 }))}
            contractSites={project.contractSites}
            today={today}
            canAdd={canProject(user.actor, "site.add", project, org)}
            canEdit={canProject(user.actor, "site.edit", project, org)}
            canDelete={can("site.delete")}
            onSave={saveSite.bind(null, project.id)}
            onDelete={deleteSite.bind(null, project.id)}
          />
        </CardContent>
      </Card>
      {can("drop") && !project.bast.on ? (
        <Card>
          <CardHeader>
            <CardTitle>Hentikan proyek</CardTitle>
            <CardDescription>Untuk proyek yang tidak jadi dikerjakan. Hanya sebelum BAST disahkan; data yang sudah tercatat tetap tersimpan.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectDrop onDrop={dropProject.bind(null, project.id)} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
