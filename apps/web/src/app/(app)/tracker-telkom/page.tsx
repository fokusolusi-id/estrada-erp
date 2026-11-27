import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ASSURANCE_AREAS, ASSURANCE_LABEL, STAGE_ACTOR_LABEL, TELKOM_STAGES, assuranceSummary, canCompleteStage, canViewTracker } from "@estrada/domain";
import { formatDate, todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadTracker } from "@/lib/telkom";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { AssuranceSelect, ObstacleForm, ObstacleUpdate, ReopenStage, StageForm, StartTracking } from "@/components/erp/telkom-forms";
import { ViewNote } from "@/components/erp/view-note";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addObstacle, completeStage, reopenStage, saveAssurance, startTracking, updateObstacle } from "./actions";

export const metadata: Metadata = { title: "Tracker Telkom" };

export default async function TelkomTrackerPage({ searchParams }: { searchParams: Promise<{ proyek?: string }> }) {
  const user = await requireUser();
  const org = await loadOrg();
  if (!canViewTracker(user.actor, org)) redirect("/");
  const today = todayJakarta();
  const [view, all, asked] = await Promise.all([activeView(), loadTracker(today), searchParams]);
  const list = all.filter((p) => (user.actor.entities.includes("*") || user.actor.entities.includes(p.entity)) && (!view.entity || p.entity === view.entity));
  const chosen = list.find((p) => p.id === asked.proyek) ?? list.find((p) => p.startedOn) ?? list[0];
  const jpmb = assuranceSummary(list.flatMap((p) => p.assurance));
  const stageName = (n: number) => TELKOM_STAGES[n - 1]!.name;
  const section = (title: string, description: string, content: React.ReactNode) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4">{content}</CardContent>
    </Card>
  );
  const delivery = !!chosen && canCompleteStage(user.actor, 4, chosen.entity, org);
  const current = chosen?.position?.current ?? null;
  const last = chosen?.stages.at(-1);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Tracker Telkom" description="Proyek skema TELKOM dari P6 sampai Cash In: 12 tahap berurutan dengan SLA, bukti, eskalasi, kendala dan assurance JPMB." note={<ViewNote ignores={["division"]} />} />
      {list.length ? (
        <>
          {section(
            "Posisi proyek",
            "Pilih proyek untuk melihat tahapnya. Tier eskalasi naik satu tiap satu periode SLA terlewat.",
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proyek</TableHead>
                  <TableHead>Tahap berjalan</TableHead>
                  <TableHead>Batas SLA</TableHead>
                  <TableHead>Eskalasi</TableHead>
                  <TableHead className="text-right">Kendala terbuka</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => (
                  <TableRow key={p.id} data-testid={`telkom-${p.id}`} className={p.id === chosen?.id ? "bg-muted/40" : ""}>
                    <TableCell className="min-w-64 whitespace-normal">
                      <Link href={`/tracker-telkom?proyek=${p.id}`} className="font-medium underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                      <span className="text-muted-foreground block text-xs">{p.entity}</span>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {!p.position ? "Belum dilacak" : p.position.current ? `${p.position.current}. ${stageName(p.position.current)}` : "Selesai (Cash In)"}
                    </TableCell>
                    <TableCell className={p.tier ? "text-destructive font-medium whitespace-nowrap" : "whitespace-nowrap"}>{p.position?.deadline ? formatDate(p.position.deadline) : "–"}</TableCell>
                    <TableCell className={p.tier ? "text-destructive" : ""}>{p.tier ? `Tier ${p.tier}` : "–"}</TableCell>
                    <TableCell className="tabular text-right">{p.obstacles.filter((o) => !o.resolvedOn).length || "–"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>,
          )}
          {chosen
            ? section(
                `Tahapan: ${chosen.name}`,
                chosen.startedOn ? `Dilacak sejak ${formatDate(chosen.startedOn)}.` : "Belum dilacak. Sales (BCD) memulainya.",
                <>
                  {!chosen.startedOn && canCompleteStage(user.actor, 1, chosen.entity, org) ? <StartTracking projectId={chosen.id} today={today} onStart={startTracking} /> : null}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tahap</TableHead>
                        <TableHead>PIC Estrada · Telkom</TableHead>
                        <TableHead>SLA</TableHead>
                        <TableHead>Hasil</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {TELKOM_STAGES.map((s) => {
                        const done = chosen.stages.find((d) => d.stage === s.no);
                        const reached = chosen.escalations.filter((e) => e.stage === s.no).reduce((max, e) => Math.max(max, e.tier), 0);
                        return (
                          <TableRow key={s.no} data-testid={`stage-${s.no}`} className={s.no === current ? "bg-muted/40" : ""}>
                            <TableCell className="min-w-56 align-top whitespace-normal">
                              {s.no}. {s.name}
                              <span className="text-muted-foreground block text-xs">Level eskalasi {s.level}</span>
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              {STAGE_ACTOR_LABEL[s.actor]}
                              <span className="text-muted-foreground block text-xs">{s.telkom}</span>
                            </TableCell>
                            <TableCell className="align-top whitespace-nowrap">
                              {s.slaDays ? `${s.slaDays} hari` : "–"}
                              {reached ? <span className="text-destructive block text-xs">Pernah eskalasi tier {reached}</span> : null}
                            </TableCell>
                            <TableCell className="min-w-64 align-top whitespace-normal">
                              {done ? (
                                <>
                                  {done.notApplicable ? "Tidak berlaku" : "Selesai"} {formatDate(done.doneOn)}
                                  {done.documentPath ? (
                                    <>
                                      {" · "}
                                      <a href={`/tracker-telkom/dokumen/${chosen.id}/${s.no}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                                        dokumen
                                      </a>
                                    </>
                                  ) : null}
                                  {done.note ? <span className="text-muted-foreground block text-xs">{done.note}</span> : null}
                                </>
                              ) : s.no === current && canCompleteStage(user.actor, s.no, chosen.entity, org) ? (
                                <StageForm key={`${chosen.id}-${s.no}`} projectId={chosen.id} stage={s.no} optional={!!s.optional} today={today} onSave={completeStage} />
                              ) : s.no === current ? (
                                "Sedang berjalan"
                              ) : (
                                "–"
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {last && canCompleteStage(user.actor, last.stage, chosen.entity, org) ? <ReopenStage key={`${chosen.id}-${last.stage}`} projectId={chosen.id} onReopen={reopenStage} /> : null}
                </>,
              )
            : null}
          {chosen
            ? section(
                "Kendala",
                "Kendala kontrak, BAST atau BAPL beserta penyebabnya.",
                <>
                  {chosen.obstacles.map((o) => (
                    <div key={o.id} className="grid gap-1 border-b pb-3 text-sm">
                      <span>
                        <span className="font-medium">{stageName(o.stage)}</span>: {o.issue} — {o.cause}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {o.resolvedOn ? `Selesai ${formatDate(o.resolvedOn)}` : "Terbuka"}
                        {o.lastUpdate ? ` · ${o.lastUpdate}` : ""}
                      </span>
                      {!o.resolvedOn && (delivery || canCompleteStage(user.actor, o.stage, chosen.entity, org)) ? <ObstacleUpdate id={o.id} onUpdate={updateObstacle} /> : null}
                    </div>
                  ))}
                  {!chosen.obstacles.length ? <p className="text-muted-foreground text-sm">Belum ada kendala.</p> : null}
                  {delivery || (current && canCompleteStage(user.actor, current, chosen.entity, org)) ? (
                    <ObstacleForm key={chosen.id} projectId={chosen.id} stages={delivery ? TELKOM_STAGES : TELKOM_STAGES.filter((s) => s.no === current)} onAdd={addObstacle} />
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
                    {ASSURANCE_AREAS.map((area) => {
                      const row = chosen.assurance.find((a) => a.area === area);
                      return <AssuranceSelect key={`${chosen.id}-${area}`} projectId={chosen.id} area={area} standing={row ? (row.done ? "done" : "progress") : "none"} disabled={!delivery} onSave={saveAssurance} />;
                    })}
                  </div>
                </>,
              )
            : null}
          {section(
            "Assurance JPMB",
            "Seluruh proyek yang tampil.",
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Area</TableHead>
                  <TableHead className="text-right">Total proyek</TableHead>
                  <TableHead className="text-right">Done</TableHead>
                  <TableHead className="text-right">In progress</TableHead>
                  <TableHead className="text-right">Selesai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jpmb.map((a) => (
                  <TableRow key={a.area}>
                    <TableCell>{ASSURANCE_LABEL[a.area]}</TableCell>
                    <TableCell className="tabular text-right">{a.total}</TableCell>
                    <TableCell className="tabular text-right">{a.done}</TableCell>
                    <TableCell className="tabular text-right">{a.inProgress}</TableCell>
                    <TableCell className="tabular text-right">{a.percent === null ? "–" : `${a.percent}%`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>,
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Belum ada proyek skema TELKOM. Tandai skemanya di halaman proyek (Implementasi).</p>
      )}
    </div>
  );
}
