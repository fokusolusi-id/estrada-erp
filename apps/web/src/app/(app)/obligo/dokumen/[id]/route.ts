import { eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { can } from "@estrada/domain";
import { coversEntity } from "@/lib/obligo";
import { requireUser } from "@/lib/session";
import { getFile } from "@/lib/storage";
import { loadOrg } from "@/lib/workflow";

/** Serves a drawing's underlying document to whoever reads the register. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const notFound = new Response("Tidak ditemukan", { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(id) || !can(user.actor, "obligo.view", null, await loadOrg())) return notFound;
  const [d] = await db.select().from(schema.facilityDrawing).where(eq(schema.facilityDrawing.id, id));
  if (!d?.documentPath || !coversEntity(user.actor, d.entityCode)) return notFound;
  const data = await getFile(d.documentPath);
  return new Response(Buffer.from(data), {
    headers: {
      "Content-Type": d.documentType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(d.documentName ?? "dokumen")}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
