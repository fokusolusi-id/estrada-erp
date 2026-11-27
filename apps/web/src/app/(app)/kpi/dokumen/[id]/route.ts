import { eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { can } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { getFile } from "@/lib/storage";
import { loadOrg } from "@/lib/workflow";

/** Serves a target's board decision to whoever reads the KPI screen, within their companies. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const notFound = new Response("Tidak ditemukan", { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(id) || !can(user.actor, "closing.view", null, await loadOrg())) return notFound;
  const [row] = await db.select().from(schema.kpiTarget).where(eq(schema.kpiTarget.id, id));
  if (!row?.documentPath || !(user.actor.entities.includes("*") || user.actor.entities.includes(row.entityCode))) return notFound;
  const data = await getFile(row.documentPath);
  return new Response(Buffer.from(data), {
    headers: {
      "Content-Type": row.documentType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.documentName ?? "dokumen")}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
