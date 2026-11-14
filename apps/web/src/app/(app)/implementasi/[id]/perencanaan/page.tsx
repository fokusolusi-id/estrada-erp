import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PLANNING_ITEMS, PROJECT_STATUS_LABEL, baselineProblems, canPlanning, canProject, kickoffGateProblems, kurvaS } from "@estrada/domain";
import { loadPlanning, loadProjects, userNames } from "@/lib/implementasi";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { KurvaS } from "@/components/erp/kurva-s";
import { PageHeader } from "@/components/erp/page-header";
import { ProjectPlanning } from "@/components/erp/project-planning";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { approveBaseline, approveKickoffGate, savePlanningItem } from "../../planning-actions";

export const metadata: Metadata = { title: "Perencanaan" };

const OWNER = { pm: "Project Manager", project_admin: "Project Admin" } as const;

export default async function PlanningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const [org, [project], planning] = await Promise.all([loadOrg(), loadProjects(id), loadPlanning(id)]);
  if (!project || !canProject(user.actor, "view", project, org)) notFound();
  const names = await userNames(Object.values(planning).map((p) => p.recordedBy));
  const filled = Object.keys(planning);
  const GATE = { kickoff: "Notulen kick-off belum dicatat.", mom: "MoM kick-off belum dicatat." };
  const BASE = {
    kickoff_gate: "Kick-Off Gate belum disahkan.",
    charter: "Project Charter belum dicatat.",
    risk: "Risk Register belum dicatat.",
    team: "Tim proyek belum lengkap (Project Manager, Delivery Control, Project Admin).",
    rfs_target: "",
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Perencanaan"
        description={`${project.name} · ${project.customer} · ${project.entity}`}
        actions={
          <>
            <Badge variant="secondary">{PROJECT_STATUS_LABEL[project.status]}</Badge>
            <Link href={`/implementasi/${project.id}`} className="text-muted-foreground text-sm underline-offset-4 hover:underline">
              Kembali ke proyek
            </Link>
          </>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Initiation dan Planning</CardTitle>
          <CardDescription>Catatan kick-off dan rencana, lalu pengesahan Head PMO. Pekerjaan lapangan lokasi (staging sampai uji) dimulai setelah baseline disahkan.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectPlanning
            key={`${filled.join()}:${project.kickoffGateOn}:${project.baselineOn}`}
            items={PLANNING_ITEMS.map((i) => ({
              key: i.key,
              name: i.name,
              owner: OWNER[i.owner],
              stage: i.stage,
              reference: planning[i.key]?.reference ?? null,
              recordedBy: planning[i.key]?.recordedBy ? (names[planning[i.key]!.recordedBy!] ?? null) : null,
              recordedOn: planning[i.key]?.recordedOn ?? null,
              canRecord: canPlanning(user.actor, "record", i.key, project, org),
            }))}
            gate={{ on: project.kickoffGateOn, blockers: kickoffGateProblems({ filled }).map((p) => GATE[p]), canApprove: canPlanning(user.actor, "approve_gate", null, project, org) }}
            baseline={{
              on: project.baselineOn,
              blockers: baselineProblems({ kickoffGateOn: project.kickoffGateOn, filled, team: project.team, rfsTargetOn: "2000-01-01" }).map((p) => BASE[p]),
              canApprove: canPlanning(user.actor, "approve_baseline", null, project, org),
            }}
            rfsTargetOn={project.rfsTargetOn}
            onSave={savePlanningItem.bind(null, project.id)}
            onApproveGate={approveKickoffGate.bind(null, project.id)}
            onApproveBaseline={approveBaseline.bind(null, project.id)}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Kurva S</CardTitle>
          <CardDescription>
            Lokasi selesai kumulatif per bulan terhadap jumlah lokasi kontrak ({project.contractSites}): rencana dari tanggal rencana selesai tiap lokasi, aktual dari tanggal aktual selesai.
            {project.rfsTargetOn ? ` Target RFS ${project.rfsTargetOn}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KurvaS points={kurvaS(project.sites, project.contractSites, todayJakarta())} />
        </CardContent>
      </Card>
    </div>
  );
}
