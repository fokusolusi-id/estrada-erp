import { and, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { canViewTracker } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { getFile } from "@/lib/storage";
import { loadOrg } from "@/lib/workflow";

/** Serves a stage's evidence to whoever reads the tracker, within their companies. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; stage: string }> }) {
  const { id, stage } = await params;
  const user = await requireUser();
  const notFound = new Response("Tidak ditemukan", { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{1,2}$/.test(stage) || !canViewTracker(user.actor, await loadOrg())) return notFound;
  const [row] = await db
    .select({ doc: schema.billingStage, entity: schema.pipelineDeal.entityCode })
    .from(schema.billingStage)
    .innerJoin(schema.project, eq(schema.project.id, schema.billingStage.projectId))
    .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.project.dealId))
    .where(and(eq(schema.billingStage.projectId, id), eq(schema.billingStage.stage, Number(stage))));
  if (!row?.doc.documentPath || !(user.actor.entities.includes("*") || user.actor.entities.includes(row.entity))) return notFound;
  const data = await getFile(row.doc.documentPath);
  return new Response(Buffer.from(data), {
    headers: {
      "Content-Type": row.doc.documentType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.doc.documentName ?? "dokumen")}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
