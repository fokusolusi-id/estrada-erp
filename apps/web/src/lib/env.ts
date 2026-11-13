import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().default("postgres://estrada:estrada@localhost:5432/estrada"),
  BETTER_AUTH_SECRET: z.string().min(16).default("dev-only-secret-change-me-please"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("ERP Estrada <info@erpestrada.com>"),
  /** Who locks the final RKA version — open question 3 for the client. */
  RKA_LOCK_ROLE: z.enum(["director", "finance"]).default("finance"),
  /** Bearer token the daily scheduler sends to /api/cron/reminders. Unset = the endpoint is off. */
  CRON_SECRET: z.string().min(16).optional(),
  /** Items waiting this many days remind whoever holds them. */
  REMINDER_PENDING_DAYS: z.coerce.number().int().min(1).default(3),
  /** Payment attachments go to this Supabase Storage bucket when both are set; otherwise to STORAGE_DIR on disk (development). */
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  STORAGE_BUCKET: z.string().default("payment-documents"),
  STORAGE_DIR: z.string().default(".uploads"),
});

// Preview deployments get a new URL each time: fall back to Vercel's own when APP_URL is unset.
const vercelUrl = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;

export const env = schema.parse({ ...process.env, APP_URL: process.env.APP_URL || vercelUrl });
