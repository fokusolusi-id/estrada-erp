# ERP Estrada: working rules

Budget-first ERP replacing the RKA 2027 workbook. Plan: https://claude.ai/artifact/AfNF8LLs3Dy4DBFBy7XJVV

## Layout
- `packages/domain`: pure TypeScript business rules (money, budget lines, approval state machine, RBAC policy, notifications). No framework or DB imports. Tests in `test/`.
- `packages/db`: Drizzle schema, migrations (`drizzle/`), seed.
- `apps/web`: Next.js 16 App Router. shadcn primitives in `src/components/ui`, ERP composites in `src/components/erp`. Screens use composites, not raw primitives.

## Rules
- TDD: write the failing test first, from a row or rule in the workbook. Domain logic lives in `packages/domain` and is tested there.
- Money is `Decimal` (`money()` from domain), stored as `numeric(20,2)`. Never JS numbers for rupiah.
- Every RKA state change goes through `applyTransition` in `apps/web/src/lib/workflow.ts` (domain rules + audit + email together).
- Authorise in the domain (`can()`), on the server, in every page and server action. `proxy.ts` is only an optimistic redirect.
- Emails: one per handoff, never one per line, no rupiah figures in the body. Queue through `enqueueEmail`.
- UI copy in Bahasa Indonesia. Keep RKA, COA, Realisasi, Beban as the team uses them.
- Next.js 16: middleware is `proxy.ts`; `params`, `searchParams`, `cookies()`, `headers()` are async. Check `node_modules/next/dist/docs/` before using an API you are unsure about.
- User guide: the in-app Panduan is `apps/web/src/content/panduan.ts` (Markdown, Bahasa Indonesia). Update it in the same change as anything a user can see; `panduan.test.ts` fails when a menu screen, approval state or role is missing from it.
