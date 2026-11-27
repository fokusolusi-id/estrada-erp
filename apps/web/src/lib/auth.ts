import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { env } from "./env";
import { enqueueEmail } from "./email/outbox";

async function recordAuth(action: "auth.logout" | "auth.login_failed", userId: string | null, sessionId: string | null, headers: Headers | undefined, after?: { email: string }) {
  await db.insert(schema.auditLog).values({
    actorUserId: userId,
    action,
    subjectType: "session",
    subjectId: sessionId,
    after: after ?? null,
    ip: headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
  });
}

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.APP_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: {
    enabled: true,
    // Accounts are created by Admin invitation only.
    disableSignUp: true,
    minPasswordLength: 10,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60 * 24, // 24h, long enough for an invitation
    async sendResetPassword({ user, url }) {
      // A user with no credential account yet is accepting an invitation.
      const [credential] = await db
        .select({ id: schema.account.id })
        .from(schema.account)
        .where(and(eq(schema.account.userId, user.id), eq(schema.account.providerId, "credential")))
        .limit(1);
      await enqueueEmail({
        template: credential ? "password_reset" : "invitation",
        to: { userId: user.id, email: user.email, name: user.name },
        payload: { url },
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 12, // one working day
    updateAge: 60 * 60,
    additionalFields: { activePositionId: { type: "string", required: false, input: false } },
  },
  user: { additionalFields: { active: { type: "boolean", required: false, input: false } } },
  databaseHooks: {
    session: {
      create: {
        async after(session) {
          await db.insert(schema.auditLog).values({
            actorUserId: session.userId,
            action: "auth.login",
            subjectType: "session",
            subjectId: session.id,
            ip: session.ipAddress ?? null,
          });
        },
      },
    },
  },
  hooks: {
    // Sign-out and refused sign-ins have no session to hook, so they are recorded around the request (AUTH.LOGIN / AUTH.LOGOUT).
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-out") return;
      const session = await getSessionFromCtx(ctx);
      if (session) await recordAuth("auth.logout", session.user.id, session.session.id, ctx.headers);
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email" || !(ctx.context.returned instanceof APIError)) return;
      const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? "").trim().toLowerCase().slice(0, 200);
      const [user] = email ? await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email)).limit(1) : [];
      // The password is never recorded.
      await recordAuth("auth.login_failed", user?.id ?? null, null, ctx.headers, { email });
    }),
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
