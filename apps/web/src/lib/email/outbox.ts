import "server-only";
import { after } from "next/server";
import { eq, and, lt } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import type { EmailTemplate } from "@estrada/domain";
import { renderEmail } from "./templates";
import { sendMail } from "./transport";

export interface EmailRequest {
  template: EmailTemplate;
  to: { userId?: string; email: string; name?: string };
  /** Links and labels only: never rupiah amounts. */
  payload: Record<string, string>;
}

/** Queue an email and deliver it after the response, so approvals never wait on the mail server. */
export async function enqueueEmail(req: EmailRequest) {
  const [row] = await db
    .insert(schema.emailOutbox)
    .values({
      template: req.template,
      toUserId: req.to.userId ?? null,
      toEmail: req.to.email,
      payload: { ...req.payload, name: req.to.name ?? "" },
    })
    .returning({ id: schema.emailOutbox.id });
  try {
    after(() => deliverPending());
  } catch {
    // Called outside a request (e.g. a script): deliver now.
    await deliverPending();
  }
  return row?.id;
}

const MAX_ATTEMPTS = 5;

export async function deliverPending(limit = 20) {
  const pending = await db
    .select()
    .from(schema.emailOutbox)
    .where(and(eq(schema.emailOutbox.status, "queued"), lt(schema.emailOutbox.attempts, MAX_ATTEMPTS)))
    .limit(limit);

  for (const mail of pending) {
    try {
      const { subject, html } = await renderEmail(mail.template as EmailTemplate, mail.payload as Record<string, string>);
      await sendMail({ to: mail.toEmail, subject, html });
      await db
        .update(schema.emailOutbox)
        .set({ status: "sent", sentAt: new Date(), attempts: mail.attempts + 1 })
        .where(eq(schema.emailOutbox.id, mail.id));
    } catch (e) {
      const attempts = mail.attempts + 1;
      await db
        .update(schema.emailOutbox)
        .set({ attempts, lastError: String(e), status: attempts >= MAX_ATTEMPTS ? "failed" : "queued" })
        .where(eq(schema.emailOutbox.id, mail.id));
    }
  }
}
