import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runReminders } from "@/lib/reminders";

/** Called once a day by a scheduler with "Authorization: Bearer <CRON_SECRET>". */
export async function GET(request: Request) {
  if (!env.CRON_SECRET) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await runReminders());
}
