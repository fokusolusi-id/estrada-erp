import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PROJECT_STATUS_LABEL, canProject, canWarranty, closureProblems, defectProblems, transitionDays, type DefectAction, type WarrantyAction } from "@estrada/domain";
import { loadDefects, loadHandover, loadProjects, userNames } from "@/lib/implementasi";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { ProjectWarranty } from "@/components/erp/project-warranty";
import { Badge } from "@/components/ui/badge";
import { closeProject, defectStep, reportDefect, setWarranty } from "../../warranty-actions";

export const metadata: Metadata = { title: "Garansi & Penutupan" };

type Step = Exclude<DefectAction, "report">;
const STEPS: { step: Step; action: WarrantyAction }[] = [
  { step: "confirm_iso", action: "defect.confirm_iso" },
  { step: "confirm_pmo", action: "defect.confirm_pmo" },
  { step: "reject", action: "defect.reject" },
  { step: "fix", action: "defect.fix" },
  { step: "close", action: "defect.close" },
];
const jakartaDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d);

export default async function WarrantyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const [org, [project]] = await Promise.all([loadOrg(), loadProjects(id)]);
  if (!project || !canProject(user.actor, "view", project, org)) notFound();
  const [handover, defects] = await Promise.all([loadHandover(id), loadDefects(id)]);
  const names = await userNames(defects.flatMap((d) => [d.reportedBy, d.confirmedIso, d.confirmedPmo]));
  const can = (action: WarrantyAction) => canWarranty(user.actor, action, project, org);
  const siteCode = new Map(project.sites.map((s) => [s.id, s.kode]));
  const openDefects = defects.filter((d) => d.status === "Diajukan" || d.status === "Cacat_Bawaan" || d.status === "Diperbaiki").length;
  const BLOCKER = {
    closed: "Proyek sudah ditutup.",
    not_accepted: "MSO belum menyatakan menerima serah terima.",
    iso: "ISO belum menerima turunan teknis.",
    warranty_unset: "Tanggal akhir garansi belum diisi.",
    warranty_running: "Masa garansi belum berakhir.",
    defects_open: `${openDefects} cacat bawaan atau laporan masih terbuka.`,
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Garansi & Penutupan"
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
      <ProjectWarranty
        key={`${project.status}:${project.warrantyEndsOn}:${defects.map((d) => d.status).join()}`}
        view={{
          bastOn: project.bast.on,
          msoAcceptedOn: project.msoAcceptedOn,
          transitionDays: transitionDays(project.bast.on, project.msoAcceptedOn),
          warrantyEndsOn: project.warrantyEndsOn,
          closedOn: project.closedOn,
          closureBlockers: project.closedOn ? [] : closureProblems({ ...project, handoverStatus: handover.status, defects }, todayJakarta()).map((p) => BLOCKER[p]),
          canSetWarranty: can("warranty.set"),
          canReport: can("defect.report") && !!project.msoAcceptedOn,
          canClose: can("close"),
        }}
        defects={defects.map((d) => ({
          id: d.id,
          site: d.siteId ? (siteCode.get(d.siteId) ?? null) : null,
          description: d.description,
          status: d.status,
          reportedBy: names[d.reportedBy] ?? "–",
          reportedOn: jakartaDay(d.reportedAt),
          confirmedIso: d.confirmedIso ? (names[d.confirmedIso] ?? "ya") : null,
          confirmedPmo: d.confirmedPmo ? (names[d.confirmedPmo] ?? "ya") : null,
          rejectNote: d.rejectNote,
          fixNote: d.fixNote,
          wasInherited: !!d.confirmedIso && !!d.confirmedPmo,
          // Offer a step only when the user may take it and the rules allow it now (notes are typed afterwards).
          steps: project.closedOn
            ? []
            : STEPS.filter(
                ({ step, action }) =>
                  can(action) &&
                  !(step === "confirm_iso" && d.confirmedIso) &&
                  !(step === "confirm_pmo" && d.confirmedPmo) &&
                  defectProblems(step, d, user.id, { text: "x" }).problems.length === 0,
              ).map((s) => s.step),
        }))}
        sites={project.sites.map((s) => ({ id: s.id, kode: s.kode }))}
        onSetWarranty={setWarranty.bind(null, project.id)}
        onReport={reportDefect.bind(null, project.id)}
        onStep={defectStep.bind(null, project.id)}
        onClose={closeProject.bind(null, project.id)}
      />
    </div>
  );
}
