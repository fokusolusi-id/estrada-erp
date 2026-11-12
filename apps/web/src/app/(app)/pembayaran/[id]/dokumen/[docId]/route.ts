import { and, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { canViewPayment } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { asLike } from "@/lib/payment";
import { getFile } from "@/lib/storage";
import { loadOrg } from "@/lib/workflow";

/** Serves an attachment to whoever may open the request; storage itself is never public. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const user = await requireUser();
  const [row] = await db
    .select({ doc: schema.paymentDocument, request: schema.paymentRequest })
    .from(schema.paymentDocument)
    .innerJoin(schema.paymentRequest, eq(schema.paymentRequest.id, schema.paymentDocument.requestId))
    .where(and(eq(schema.paymentDocument.id, docId), eq(schema.paymentDocument.requestId, id)));
  if (!row || !canViewPayment(user.actor, asLike(row.request), await loadOrg())) return new Response("Tidak ditemukan", { status: 404 });
  const data = await getFile(row.doc.storagePath);
  return new Response(Buffer.from(data), {
    headers: {
      "Content-Type": row.doc.contentType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.doc.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
