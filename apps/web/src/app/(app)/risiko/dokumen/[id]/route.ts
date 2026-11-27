import { eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { canViewRisk } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { getFile } from "@/lib/storage";
import { loadOrg } from "@/lib/workflow";

/** A risk's evidence, to whoever may read that risk. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const notFound = new Response("Tidak ditemukan", { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound;
  const [row] = await db
    .select({ log: schema.riskLog, entity: schema.risk.entityCode, ownerUserId: schema.risk.ownerUserId })
    .from(schema.riskLog)
    .innerJoin(schema.risk, eq(schema.risk.id, schema.riskLog.riskId))
    .where(eq(schema.riskLog.id, id));
  if (!row?.log.documentPath || !canViewRisk(user.actor, { entity: row.entity, ownerUserId: row.ownerUserId }, await loadOrg())) return notFound;
  const data = await getFile(row.log.documentPath);
  return new Response(Buffer.from(data), {
    headers: {
      "Content-Type": row.log.documentType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.log.documentName ?? "bukti")}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
