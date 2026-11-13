import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PROJECT_STATUS_LABEL, canProject, delayDays, projectProgress } from "@estrada/domain";
import { dealsAwaitingProject, deliveryPeople, loadProjects } from "@/lib/implementasi";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { ProjectOpen } from "@/components/erp/project-open";
import { ViewNote } from "@/components/erp/view-note";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { openProject } from "./actions";

export const metadata: Metadata = { title: "Implementasi" };

export default async function ImplementasiPage() {
  const user = await requireUser();
  const org = await loadOrg();
  if (!canProject(user.actor, "view", null, org)) notFound();
  const [all, awaiting, people, view] = await Promise.all([loadProjects(), dealsAwaitingProject(), deliveryPeople(), activeView()]);
  const inView = <T extends { entity: string }>(rows: T[]) => rows.filter((r) => canProject(user.actor, "view", { entity: r.entity, team: null }, org) && (!view.entity || r.entity === view.entity));
  const projects = inView(all);
  const deals = inView(awaiting).map((d) => ({ ...d, canOpen: canProject(user.actor, "open", { entity: d.entity, team: null }, org) }));
  const name = new Map(people.map((p) => [p.id, p.name]));
  const today = todayJakarta();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Implementasi"
        description="Proyek dibuka dari deal Closed Won dan dicatat per lokasi. Progres = lokasi selesai ÷ jumlah lokasi kontrak."
        note={<ViewNote ignores={["division"]} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Proyek</CardTitle>
          <CardDescription>Buka proyek untuk melihat tim dan lokasinya.</CardDescription>
        </CardHeader>
        <CardContent>
          {projects.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Entitas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Project Manager</TableHead>
                  <TableHead className="text-right">Lokasi selesai</TableHead>
                  <TableHead className="text-right">Progres</TableHead>
                  <TableHead className="text-right">Lokasi terlambat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => {
                  const progress = projectProgress(p.sites, p.contractSites);
                  const late = p.sites.filter((s) => delayDays(s, today) > 0).length;
                  return (
                    <TableRow key={p.id} data-testid={`project-${p.id}`}>
                      <TableCell className="font-medium whitespace-normal">
                        <Link href={`/implementasi/${p.id}`} className="underline-offset-4 hover:underline">
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell>{p.customer}</TableCell>
                      <TableCell>{p.entity}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{PROJECT_STATUS_LABEL[p.status]}</Badge>
                      </TableCell>
                      <TableCell>{p.team.pm ? (name.get(p.team.pm) ?? "–") : <span className="text-destructive text-sm">Belum ditetapkan</span>}</TableCell>
                      <TableCell className="tabular text-right">
                        {progress.done} / {progress.total}
                      </TableCell>
                      <TableCell className="tabular text-right" data-testid="progress">
                        {progress.pct.toFixed(1).replace(".", ",")}%
                      </TableCell>
                      <TableCell className={late ? "text-destructive tabular text-right font-medium" : "tabular text-right"}>{late || "–"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">Belum ada proyek. Proyek dibuka oleh BCD dari deal berstatus Closed Won.</p>
          )}
        </CardContent>
      </Card>

      {deals.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Closed Won menunggu proyek</CardTitle>
            <CardDescription>Kontrak sudah terbit tetapi proyeknya belum dibuka. BCD mengisi jumlah lokasi menurut kontrak; angka itu menjadi pembagi progres.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectOpen deals={deals} onOpen={openProject} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
