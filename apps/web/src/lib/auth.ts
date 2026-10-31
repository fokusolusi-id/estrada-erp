import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { env } from "./env";
import { enqueueEmail } from "./email/outbox";

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
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: { "/sign-in/email": { window: 300, max: 5 } },
  },
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
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
