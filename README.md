# ERP Estrada

Budget-first ERP for Estrada Group. Phase 0 base: login, invitations, role-scoped home, RKA grid, approval state machine and email notifications.

Stack: Next.js 16 · TypeScript · shadcn/ui on Tailwind 4 · Postgres · Drizzle · Better Auth · Vitest · React Email + Resend.

## Run locally

```bash
cp .env.example .env            # then set BETTER_AUTH_SECRET
docker compose up -d db          # Postgres 16 on :5432
pnpm install
pnpm db:migrate
pnpm db:seed                     # entities, org units, starter COA, demo RKA version
pnpm --filter web create-admin -- admin@estrada.co.id "Admin" 'password-min-10'
pnpm --filter web create-demo-users   # optional: one user per role, passwords in .dev-users.txt
pnpm dev                         # http://localhost:3000
```

Log in as the admin, open **Pengguna**, and invite users. With no `RESEND_API_KEY`, the invitation email is printed in the server console; open its link to set a password.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm test` | All Vitest projects (domain + web) |
| `pnpm typecheck` | `tsc` in every package |
| `pnpm lint` | ESLint on the web app |
| `pnpm build` | Production build |
| `pnpm db:generate` | New migration from schema changes |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations / seed master data |

## Structure

```text
apps/web            Next.js app: auth pages, (app) shell, server actions, email, workflow
packages/domain     money, budget lines, approval state machine, RBAC policy, notifications (+ tests)
packages/db         Drizzle schema, migrations, seed
packages/config     shared tsconfig
```

## Login and roles

- Invitation only: Admin creates the user and position; the user sets a password from the email link. No self sign-up.
- Login is rate limited (5 attempts per 5 minutes) and every login is written to `audit_log`.
- Permissions follow the **position**, not the person. A vacant head routes to its acting holder (pjs). With no pjs, nothing escalates: Admin is emailed and assigns one under **Posisi & pjs**. A pjs switches positions from the header.
- Roles: Requestor, Default Owner, Division Owner, Finance Reviewer, Direktur, Auditor, Admin.

## Approval flow

`draft → consolidation → division_approval → finance_review → awaiting_lock → locked`, with comment-required returns from Default Owner and clarifications from Finance. `RKA_LOCK_ROLE` decides whether the Director or Finance locks (open question for the client).

## Done in this base vs next

| Done | Next (phase 1) |
| --- | --- |
| Auth, invitations, password reset, role home, nav by role | Workbook importer for the full COA Master and division sheets |
| Domain rules with 64 tests; web tests for every composite and nav (95 in all) | Golden test against `RKA_2027_Upd_Fin v2.xlsx` |
| Schema + migration for masters, budget, approvals, audit, email outbox | RKA 2026 / Actual 2026 beside each line (needs the importer) |
| Email outbox with Bahasa templates; console in dev, Resend in prod | Playwright journeys; integration tests on Testcontainers Postgres |
| BudgetEditor: paste from Excel, fill-right, per-row save, submit | CommentThread for discussion on a line |
| Queues on `applyTransition`: Antrean Konsolidasi, RKA Divisi, Status Board Finance, Kunci RKA | Daily digest and pending-item reminders |
| Management Summary (P&L by month, Kontribusi Divisi, per entity, URL filters); line history and return notes | Excel export in Finance's layout |
