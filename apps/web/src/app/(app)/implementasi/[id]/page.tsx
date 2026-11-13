import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PROJECT_STATUS_LABEL, canProject, delayDays, projectProgress } from "@estrada/domain";
import { deliveryPeople, loadProjects } from "@/lib/implementasi";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { ProjectSites } from "@/components/erp/project-sites";
import { ProjectTeam } from "@/components/erp/project-team";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { assignTeam, saveSite } from "../actions";

export const metadata: Metadata = { title: "Proyek" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const [org, [project], people] = await Promise.all([loadOrg(), loadProjects(id), deliveryPeople()]);
  if (!project || !canProject(user.actor, "view", project, org)) notFound();

  const today = todayJakarta();
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
          <CardTitle>Tim proyek</CardTitle>
          <CardDescription>Ditetapkan oleh Head PMO dari orang PMO. Delivery Control tidak merangkap Project Manager maupun Project Admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectTeam team={project.team} people={people} canAssign={canProject(user.actor, "assign", project, org)} onSave={assignTeam.bind(null, project.id)} />
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
            sites={project.sites}
            contractSites={project.contractSites}
            today={today}
            canAdd={canProject(user.actor, "site.add", project, org)}
            canEdit={canProject(user.actor, "site.edit", project, org)}
            onSave={saveSite.bind(null, project.id)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
