import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().default("postgres://estrada:estrada@localhost:5432/estrada"),
  BETTER_AUTH_SECRET: z.string().min(16).default("dev-only-secret-change-me-please"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("ERP Estrada <no-reply@estrada.local>"),
  /** Who locks the final RKA version — open question 3 for the client. */
  RKA_LOCK_ROLE: z.enum(["director", "finance"]).default("director"),
  /** Bearer token the daily scheduler sends to /api/cron/reminders. Unset = the endpoint is off. */
  CRON_SECRET: z.string().min(16).optional(),
  /** Items waiting this many days remind whoever holds them. */
  REMINDER_PENDING_DAYS: z.coerce.number().int().min(1).default(3),
});

export const env = schema.parse(process.env);
