# ERP Estrada

Budget-first ERP for Estrada Group. Phase 0 base: login, invitations, role-scoped home, RKA grid, approval state machine and email notifications.

Stack: Next.js 16 · TypeScript · shadcn/ui on Tailwind 4 · Postgres · Drizzle · Better Auth · Vitest · React Email + Resend.

## Run locally

```bash
cp .env.example .env            # then set BETTER_AUTH_SECRET
brew install postgresql@16 && brew services start postgresql@16   # Postgres 16 on :5432 (first time only)
createuser -s estrada && psql -d postgres -c "ALTER ROLE estrada PASSWORD 'estrada'" && createdb -O estrada estrada   # first time only
pnpm install
pnpm db:migrate
pnpm db:seed                     # entities, org units, starter COA, demo RKA version
pnpm --filter web create-admin -- admin@estrada.co.id "Admin" 'password-min-10'
pnpm db:import -- "fixtures/RKA_2027_Upd_Fin v2.xlsx"   # optional: load the real RKA 2027 lines (see below)
pnpm --filter web create-demo-users   # optional: one user per role, passwords in .dev-users.txt
pnpm dev                         # http://localhost:3000
```

Postgres must be on PATH (`brew link postgresql@16` or add `/opt/homebrew/opt/postgresql@16/bin`). `docker-compose.yml` is still there if you prefer a container: `docker compose up -d db`.

Log in as the admin, open **Pengguna**, and invite users. With no `RESEND_API_KEY`, the invitation email is printed in the server console; open its link to set a password.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm test` | All Vitest projects (domain + web) |
| `pnpm e2e` | Playwright journeys: requestor to Director lock, on a throwaway `estrada_e2e` database and a dev server on :3100 (needs Postgres running and the `estrada` role above; first run: `pnpm --filter web exec playwright install chromium`) |
| `pnpm db:import -- "<file.xlsx>"` | Load an RKA workbook as the open version. `--dry-run` prints totals only; `--replace` reloads a version that is not locked; `--state` sets the lines' approval state (default `draft`) |
| `GET /api/cron/reminders` | Daily reminders (deadline 7/3/1 days, items waiting `REMINDER_PENDING_DAYS`); call once a day with `Authorization: Bearer $CRON_SECRET`. Each reminder is sent once |
| `GET /api/export/rka?version=&entity=&division=&status=` | The Management Summary as an `.xlsx` (signed in; Division Owner, Finance, Director, Auditor). Its RKA Data sheet uses the importer's columns |
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
- The golden test (`packages/importers/test/golden.test.ts`) checks the import against the workbook to the rupiah: revenue Rp 457,830,698,346, total cost Rp 294,445,936,589.71 (the Management Summary figure; Rekap's Rp 294,400,936,589.71 leaves out the FRM line below), every category, requestor division and unit, and month. It skips when the workbook is absent, as in CI.

## Login and roles

- Invitation only: Admin creates the user and position; the user sets a password from the email link. No self sign-up.
- Login is rate limited (5 attempts per 5 minutes) and every login is written to `audit_log`.
- Permissions follow the **position**, not the person. A vacant head routes to its acting holder (pjs). With no pjs, nothing escalates: Admin is emailed and assigns one under **Posisi & pjs**. A pjs switches positions from the header.
- Roles: Requestor, Default Owner, Division Owner, Finance Reviewer, Direktur, Auditor, Admin.

## Approval flow

`draft → consolidation → division_approval → finance_review → awaiting_lock → locked`, with comment-required returns from Default Owner and clarifications from Finance. When the last line locks, the version locks; a revision copies it into a new open version, starting at Draft (every division again) or Review Finance (Finance adjusts alone). Head Finance locks the final version (client answer 3); `RKA_LOCK_ROLE` can hand it to the Director.

## Done in this base vs next

| Done | Next (phase 1) |
| --- | --- |
| Auth, invitations, password reset, role home, nav by role | |
| Domain rules, importer and golden test; web tests for every composite and nav (128 in all) | Row-level security in Postgres as a second scope guard |
| Workbook importer: 192 lines, 85 COA codes, Rekap reproduced to the rupiah | Schedule the reminder endpoint in production |
| Siklus RKA: open a cycle with deadline, revise a locked version; lock marks the version locked; summary keeps the final version | |
| Email outbox with Bahasa templates; console in dev, Resend in prod | Integration tests on Testcontainers Postgres; CI workflow running unit, typecheck, lint and e2e |
| BudgetEditor: paste from Excel, fill-right, per-row save, submit | e2e for opening a new cycle and the Draft revision path |
| Queues on `applyTransition`: Antrean Konsolidasi, RKA Divisi, Status Board Finance, Kunci RKA | Copy the holder's head on pending-item reminders |
| Management Summary (P&L by month, Kontribusi Divisi, per entity, URL filters); line history and return notes | Allocation of shared cost to MATRIK, DJALU, PAS (needs Finance's keys) |
| Rencana headcount on RKA Saya: per position (heads × cost per head from the start month) it writes a read-only draft line on 6221, owned by HCM | |
| Importer reads the workbook's 12 recruitment rows with a head count as plan positions; rows it cannot rebuild to the rupiah stay plain lines | |
| RKA 2026 / Actual 2026 and the change beside each line; workbook review flags on every screen | |
| COA Master (Finance only, at `/coa`): add, edit, deactivate; confirm or remap provisional codes; parent/child tree (5500 → 5510, 5520), started from the code numbers on import | |
| Satuan switch (angka penuh, juta, miliar) on Summary, queues, RKA Saya and line pages, remembered per viewer | |
| New cycle proposes 31 Desember of the running year as its submission deadline (Batas pengajuan) | |
| A line with a typed total and no months (FRM's Rp 45 jt training line) is spread evenly over Jan–Des at import, flagged, and stays editable | |
| Biaya Bersama (Finance): mark a cost line as shared by revenue share, headcount (typed per entity) or fixed percentages; Management Summary and its Excel split it across ESTRADA, MATRIK, DJALU and PAS, lines unchanged; locked lines keep their split | |
| Realisasi 2026 (Finance): type or paste each line's 2026 actual from an Excel column; audited, never changes the plan | |
| Responsive: a header menu on phones; every live screen checked at 375 px for each role (e2e `phone` project) | |
| COA filter on every approval queue, listing only the codes in that position's lines and their parents | |
| Discussion on each line (`/rka/line/[id]`): everyone in the cycle who sees the line can ask or answer without moving it; Auditor reads; closed once locked. The requestor, the current holder and the thread hear about it: in-app every time, email at most hourly and without the comment text | |
| Excel export from Management Summary ("Unduh Excel"): RKA Data in the importer's layout, Rekap, Kontribusi Divisi, Per Entitas; same version, filters and scope as the screen | |
