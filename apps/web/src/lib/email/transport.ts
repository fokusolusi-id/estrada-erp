import "server-only";
import { Resend } from "resend";
import { env } from "../env";

export interface Mail {
  to: string;
  subject: string;
  html: string;
}

/** Resend when RESEND_API_KEY is set; otherwise logs to the console for local development. */
export async function sendMail(mail: Mail) {
  if (!env.RESEND_API_KEY) {
    console.info(`[email] to=${mail.to} subject="${mail.subject}"\n${mail.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`);
    return;
  }
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: env.EMAIL_FROM, to: mail.to, subject: mail.subject, html: mail.html });
  if (error) throw new Error(error.message);
}
