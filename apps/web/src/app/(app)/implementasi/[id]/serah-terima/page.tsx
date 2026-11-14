import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { HANDOVER_STATUS_LABEL, canHandover, canProject, type HandoverAction } from "@estrada/domain";
import { loadHandover, loadProjects, userNames } from "@/lib/implementasi";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { ProjectHandover } from "@/components/erp/project-handover";
import { Badge } from "@/components/ui/badge";
import { acceptIso, decideHandover, saveChecklist, savePackage, submitHandover } from "../../handover-actions";

export const metadata: Metadata = { title: "Serah Terima" };

export default async function HandoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const [org, [project]] = await Promise.all([loadOrg(), loadProjects(id)]);
  if (!project || !canProject(user.actor, "view", project, org)) notFound();
  const handover = await loadHandover(id);
  const names = await userNames([handover.submittedBy, handover.msoAcceptedBy, handover.checklistBy, handover.isoAcceptedBy]);
  const name = (uid: string | null) => (uid ? (names[uid] ?? null) : null);
  const can = (action: HandoverAction) => canHandover(user.actor, action, project, org);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Serah Terima"
        description={`${project.name} · ${project.customer} · ${project.entity}. PMO menyerahkan ke MSO; ISO menerima turunan teknisnya.`}
        actions={
          <>
            <Badge variant="secondary">{HANDOVER_STATUS_LABEL[handover.status]}</Badge>
            <Link href={`/implementasi/${project.id}`} className="text-muted-foreground text-sm underline-offset-4 hover:underline">
              Kembali ke proyek
            </Link>
          </>
        }
      />
      <ProjectHandover
        key={`${handover.status}:${JSON.stringify(handover.artefacts)}:${JSON.stringify(handover.checklist)}`}
        view={{
          ...handover,
          bastOn: project.bast.on,
          msoAcceptedOn: project.msoAcceptedOn,
          submittedBy: name(handover.submittedBy),
          msoAcceptedBy: name(handover.msoAcceptedBy),
          checklistBy: name(handover.checklistBy),
          isoAcceptedBy: name(handover.isoAcceptedBy),
        }}
        can={{ artefact: can("artefact"), submit: can("submit"), decide: can("accept_mso"), checklist: can("checklist"), acceptIso: can("accept_iso") }}
        onSavePackage={savePackage.bind(null, project.id)}
        onSubmit={submitHandover.bind(null, project.id)}
        onDecide={decideHandover.bind(null, project.id)}
        onSaveChecklist={saveChecklist.bind(null, project.id)}
        onAcceptIso={acceptIso.bind(null, project.id)}
      />
    </div>
  );
}
