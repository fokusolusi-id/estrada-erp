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
pnpm db:import -- "fixtures/RKA_2027_Upd_Fin v2.xlsx"   # optional: load the real RKA 2027 lines (see below)
pnpm --filter web create-demo-users   # optional: one user per role, passwords in .dev-users.txt
pnpm dev                         # http://localhost:3000
```

Log in as the admin, open **Pengguna**, and invite users. With no `RESEND_API_KEY`, the invitation email is printed in the server console; open its link to set a password.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm test` | All Vitest projects (domain + web) |
| `pnpm e2e` | Playwright journeys: requestor to Director lock, on a throwaway `estrada_e2e` database and a dev server on :3100 (needs `docker compose up -d db`; first run: `pnpm --filter web exec playwright install chromium`) |
| `pnpm db:import -- "<file.xlsx>"` | Load an RKA workbook as the open version. `--dry-run` prints totals only; `--replace` reloads a version that is not locked; `--state` sets the lines' approval state (default `draft`) |
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

## Importing the RKA workbook

`packages/importers` reads `COA MASTER` and `RKA 2027 Data` from `RKA_2027_Upd_Fin v2.xlsx`. The workbook is client data and is **not committed**: put it in `fixtures/` (git-ignored) or point `RKA_WORKBOOK` at it.

- Rows the importer cannot place stop the load; nothing is guessed.
- COA codes the lines use but COA Master lacks (4300, 1615, …) are added as **provisional** accounts for Finance to confirm or remap.
- COA Master's per-entity-group 2026 figures are kept in `coa_reference`; each line keeps its RKA 2026, Actual 2026, source row and the workbook's cleaning flags.
- The golden test (`packages/importers/test/golden.test.ts`) checks the import against Rekap to the rupiah: revenue Rp 457,830,698,346, total cost Rp 294,400,936,589.71, every category, requestor division and unit, and month. It skips when the workbook is absent, as in CI.

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
| Auth, invitations, password reset, role home, nav by role | Show RKA 2026 / Actual 2026 and review flags beside each line |
| Domain rules, importer and golden test; web tests for every composite and nav (114 in all) | COA Master screen; Finance confirms provisional codes |
| Workbook importer: 192 lines, 85 COA codes, Rekap reproduced to the rupiah | RKA cycle: open with deadline, revise a locked version |
| Email outbox with Bahasa templates; console in dev, Resend in prod | Integration tests on Testcontainers Postgres; CI workflow running unit, typecheck, lint and e2e |
| BudgetEditor: paste from Excel, fill-right, per-row save, submit | CommentThread for discussion on a line |
| Queues on `applyTransition`: Antrean Konsolidasi, RKA Divisi, Status Board Finance, Kunci RKA | Daily digest and pending-item reminders |
| Management Summary (P&L by month, Kontribusi Divisi, per entity, URL filters); line history and return notes | Excel export in Finance's layout |
