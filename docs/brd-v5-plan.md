# BRD v5 implementation plan

Plan for growing the budget-first app into the full ERP that the client's BRD describes.
Written 2026-11-26. Read the whole document before starting a phase; the rules in `CLAUDE.md` still apply to every step.

## 0. Status (update this section when a step lands)

| Item | State |
|---|---|
| COA Structured RKA 2027 + Data Karyawan seed (`pnpm db:master`, migration `0020`, `employee` and `coa_segment` tables, TAX / BALANCE_SHEET categories) | Built and checked on a fresh and the main local DB; **not committed yet** — commit it before starting A1 |
| Phase A (A1–A11) | Not started |
| Phase B (B1–B8) | Not started |
| Phase C (C1–C5) | Not started |
| Phase D (D0–D6) | Not started; D0 can start after Phase A |
| Group E (E1–E9) | Not started; E1–E4 and E6–E8 need no new module |

Overall order: **Phase A → E4, E7 → D0 → E1, E2, E3 → Phase B → E5, E6, E8 → Phase C → D1–D6 → E9**. The quick E items and D0 come early because they use data the app already has and give BOD and Finance something visible while Phase B is built. Ask the user before changing the order.

## 1. Sources

| Source | Where | Notes |
|---|---|---|
| BRD workbook | `/Volumes/EXTREMESSD/FokuSolusi/[NEW] BRD-ERP/BRD_MasterData_rini v5.xlsx` | 101 sheets. Outside the repo, never commit it. |
| BRD CSV exports | `/Volumes/EXTREMESSD/FokuSolusi/[NEW] BRD-ERP/v5/*.csv` | Older exports of some of the same sheets. |
| Seed CSVs in the repo | `fixtures/coa-structured-rka-2027.csv`, `fixtures/data-karyawan.csv` | Git-ignored (`fixtures/*.csv`). Loaded by `pnpm db:master`. |

To read a sheet, export the workbook to text once (exceljs is already a dependency of `@estrada/importers`):

```bash
cd packages/importers && node --input-type=module -e '
import ExcelJS from "exceljs"; import { writeFileSync, mkdirSync } from "node:fs";
const [src, out] = [process.argv[1], process.argv[2]]; mkdirSync(out, { recursive: true });
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(src);
const v = (c) => { let x = c.value; if (x && typeof x === "object") x = "result" in x ? x.result : "richText" in x ? x.richText.map((t) => t.text).join("") : "text" in x ? x.text : x instanceof Date ? x.toISOString().slice(0, 10) : x; return x == null ? "" : String(x).replace(/\s+/g, " ").trim(); };
for (const ws of wb.worksheets) { const rows = []; ws.eachRow((r) => { const c = []; r.eachCell({ includeEmpty: true }, (x) => c.push(v(x))); while (c.length && !c.at(-1)) c.pop(); if (c.length) rows.push(c.join(" | ")); }); writeFileSync(`${out}/${ws.name.replace(/[^\w&-]+/g, "_")}.txt`, rows.join("\n")); }
' "/Volumes/EXTREMESSD/FokuSolusi/[NEW] BRD-ERP/BRD_MasterData_rini v5.xlsx" /tmp/brd
```

Then read only the sheets a step names (`grep`, `head`), not the whole set: together they are about 660 KB.

### Sheets by topic

| Topic | Sheets |
|---|---|
| Requirements and flow | `01_Master_BRD` (BR-* IDs), `02_Flow_L1`, `FC01`–`FC12` (one flow card per module), `03_Traceability` |
| Redesign and build spec | `00_Resume_Perbaikan_ERP` (audit log + end-to-end target flow), `BRD_Redesign_v2`, `P0_Module_Spec` … `P3_Module_Spec`, `ERD_Diagram`, `Roadmap_Gantt` |
| Governance | `04_Audit_Log_Spec`, `05_SoD_Matrix`, `06_Compliance`, `07_Org_Chart` |
| Finance reference | `08_KPI_Thresholds`, `09_COA_Detail`, `10_Liabilities`, `13_Master_Target_2026`, `14_Obligo_Status_Apr2026`, `22_Assumptions`, `42_Jadwal_Termin` |
| Telkom billing | `12_Stages_Penagihan` (12 stages + 7 JPMB assurance), `15_Escalation_Matrix` |
| UX | `17_UX_Screens_Catalog` (47 screen IDs), `18_Dashboard_Spec_BOD`, `19_Form_Field_Spec`, `20_Navigation_IA` (menu + RW/R/A access per function), `21_Process_Flow_Design` |
| Master data | `M Perusahaan`, `M Organisasi`, `M Karyawan`, `M Customer`, `Master Mitra`, `Master Produk Mitra`, `Master Target Perusahaan`, `M COA & Cost Center`, `33_Master_CostCenter`, `ref` (dropdown lists) |
| Executive | `EXEC_00_Index` … `EXEC_21_*`, `40_Exec_Strategic_Dashboard` |

## 2. Decisions already made (do not re-ask)

1. **Units:** amounts are rupiah. "450,000" or "450B" in the BRD means Rp 450 miliar.
2. **Cash-in target:** BOD types an amount per PT per year. No fixed 70% or 80% rule.
3. **No general ledger.** The P&L is built from sub-ledgers: invoices (revenue), AP bills and payments (expense by COA), cash transactions. A P&L snapshot is locked at period closing (`P1-M6`).
4. **Balance sheet:** Accounting types the totals the Liquidity and Solvency KPIs need (current assets, current liabilities, total assets, total liabilities, equity) on a monthly closing screen. No import.
5. **Cost center = org unit.** Org units get an approval limit and a function group (Revenue / Delivery / Support / Governance). CC-001…CC-012 in `33_Master_CostCenter` are old names only, kept as aliases.
6. **Documents:** no SHA-256 hashing, no versioning, no Privy e-sign (`MOD-F6` is out). Attachments keep working as `payment_document` does today.
7. **COA:** where `COA Structured RKA 2027` and `09_COA_Detail` disagree (7100, 4200), the structured COA wins.
8. **Employees are not logins.** `employee` (keyed by NIP) links to `user` by email; Admin still invites users.
9. **Out of scope:** full GL, AI recommendations (`P3-M6`), HR features that belong in HRMS (BPJS, leave, overtime, attendance).

## 3. What the app already has

Know this before adding anything; extend before you create.

| Area | Tables / code | Screens |
|---|---|---|
| RKA | `budget_version`, `budget_line`, `budget_line_amount`, `approval_event`, `line_comment`, `headcount_plan`; domain `approval.ts`, `budget.ts`, `allocation.ts`; `applyTransition` in `apps/web/src/lib/workflow.ts` | `/rka/*` |
| COA | `coa_account` (tree, category incl. `TAX` and `BALANCE_SHEET`, level, account type, normal balance, statement, postable, segmented, requestor/owner units), `coa_segment`, `coa_reference` | `/coa` |
| Org and access | `company_entity`, `org_unit` (tree, aliases, validFrom/To), `position` (role, holder, acting), `position_entity_scope`, `employee`; domain `roles.ts`, `policy.ts` (`can()`), `org.ts` | `/admin/*` |
| Pipeline | `pipeline_deal` (status PP/PT/QO/WB/CW, customer as text), `pipeline_target`, `billing_termin`, `pipeline_recovery_plan` | `/pipeline` |
| Projects | `project`, `project_site`, `project_handover`, `handover_artefact`, `project_defect`, `project_planning_item` (Telkom BAI/BAUT/BARD/BAST, warranty) | `/implementasi/*` |
| Payments | `company_bank_account`, `payment_request` (payee as text, gross/PPN/PPh, budget line), `payment_document`, `payment_event` | `/pembayaran/*` |
| Cash | `cash_setting`, `cash_opening`, `loan_facility`, `loan_move` | `/cash` |
| Cross-cutting | `audit_log`, `email_outbox` (`enqueueEmail`), `notification`, `reminder_log` | `/panduan` |

Seeding: `pnpm db:seed` = `packages/db/src/seed.ts` (entities, org units, starter COA when no CSV) → `pnpm db:master` (`packages/importers/src/master.ts`: COA and Karyawan CSVs) → `seed:demo`. New default data follows the same pattern: a parser in `packages/importers/src` with tests in `packages/importers/test`, loaded by `master.ts`, the file kept in `fixtures/` and git-ignored when it names people or holds client figures.

## 4. How to work each step

1. Pick one numbered step below. One step = one change you can review.
2. TDD: write the failing test first, from a row or rule in the named sheet (quote the BR ID or sheet in the test name). Domain rules in `packages/domain`, parsers in `packages/importers`.
3. Schema change: edit `packages/db/src/schema/*.ts`, run `pnpm db:generate`, then append `ALTER TABLE "<new_table>" ENABLE ROW LEVEL SECURITY;` for every new table to the generated migration (see `0020_*.sql`).
4. Money is `money()` / `numeric(20,2)`. Every state change goes through a domain state machine plus an audit row; reuse the `applyTransition` pattern.
5. Authorise with `can()` in every page and server action. Add new actions to `policy.ts` with tests.
6. UI copy in Bahasa Indonesia. Screens use composites from `src/components/erp`. Add menu entries in `apps/web/src/lib/nav.ts`.
7. Update `apps/web/src/content/panduan.ts` in the same change for anything a user can see.
8. Before stopping: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm db:migrate` and `pnpm db:seed` on the local DB, then check the screen in the browser preview.
9. Never commit or push without the user's go-ahead. Stop with the changes in the working tree and a short summary.

## 5. Phases

Phases follow the workbook's roadmap (`BRD_Redesign_v2` section L) adjusted for what the app already has; the build order across phases, the Beranda steps (D0, D6) and group E is in section 0. Each phase ends at an exit gate the user signs off.

### Phase A — Foundation (P0)

| # | Step | Sheets / BR | Done when |
|---|---|---|---|
| A1 | **Customer master.** Table `customer` (id, nickname, legal name, segment, sub-segment, NPWP, address, email, phone, PIC name/phone/title/email, term of payment days, Wapu flag, active). Parser + seed from `M Customer`. Reject duplicate NPWP unless it is the placeholder `010611200093000` (flag those in a review list instead). | `M Customer`, `ref`, BR-MD-004, `P0 MOD-F3` | Customers seeded; duplicates reported, not loaded twice |
| A2 | **Pipeline and projects use the customer.** Add `pipeline_deal.customer_id` (FK), backfill by matching the current text to nickname/name, list the unmatched ones for BCD to fix. Keep the text column until every deal is matched. | BR-SP-002 | Every seeded deal has a customer or appears on a "Perlu dirapikan" list |
| A3 | **Mitra and Produk Mitra.** Tables `partner` (category Distributor/Principle, NPWP, contacts) and `partner_product` (own ID, partner FK, kategori, jenis, brand). Clean NPWP (strip non-digits, hidden Unicode). Warn on save when NPWP is empty. | `Master Mitra`, `Master Produk Mitra`, BR-MD-005, BR-SCM-004 | Seeded; Mitra-002 NPWP clean |
| A4 | **Payments use the partner.** `payment_request.partner_id` (nullable FK) next to the payee text; picking a partner fills the payee fields. | BR-SCM-002 | Payment form offers partners |
| A5 | **Master screens.** One "Master Data" area (Finance / data stewards): list + form for Customer, Mitra, Produk Mitra, Karyawan (read-only, synced). Stewards: Sales for Customer, SCM for Mitra, HCM for Karyawan, Finance for COA (`05_SoD_Matrix` mapping). | `17` SCR-MD-01..04, `20` | Each steward can edit only their master |
| A6 | **Master change workflow.** Requester → steward review → Finance Controller approval for sensitive masters (Perusahaan, COA). Effective date ≥ today, reason required, before/after in `audit_log`, soft delete only. Requester ≠ approver. | `FC12`, BR-MD-001, BR-MD-006, BR-NFR-006 | A COA change waits for approval and is audited |
| A7 | **Company master fields.** `company_entity`: NPWP, NIB, address, domicile, phone, email, director, commissioner, authorised capital. Seed from `M Perusahaan`. | `M Perusahaan`, BR-MD-001 | Fields shown under Unit & Entitas |
| A8 | **Org unit as cost center.** `org_unit`: `approval_limit numeric(20,2)`, `function_group` enum. Seed limits from `33_Master_CostCenter`, CC codes as aliases. Org levels 1–4 and function codes F0–F6 on positions. | Decision 5, `07_Org_Chart`, BR-MD-002, BR-MD-007 | Limits visible and editable by Finance |
| A9 | **Period master.** `fiscal_period` (entity, year, month, status open/closing/closed, closed_by/at). Domain rule: no posting into a closed period. | `P0 MOD-F1` | Closing a month blocks edits dated in it |
| A10 | **Approval matrix by amount.** Domain function `approverFor(docType, amount, unit)` from a table `approval_threshold` (doc type, from/to amount, required role). Used first by payment requests, later by PO and invoices. RKA keeps its own chain. | BR-SCM-003, `P0 MOD-F7` | Payment routing follows the table; tested at each boundary |
| A11 | **SoD check.** Encode the X pairs from `05_SoD_Matrix` in the domain; `can()` refuses an action when the same user did the conflicting step on the same record. | BR-NFR-003, `05` | Tests for every X pair |

Exit gate: masters seeded and editable by their stewards, change workflow audited, SoD tests green.

### Phase B — Finance core (P1)

| # | Step | Sheets / BR |
|---|---|---|
| B1 | **Invoice and termin schedule.** `invoice` + lines from `billing_termin` / project termin: DPP = tagihan − penalti − denda, PPN 11% unless Wapu, PPh by type, running number unique per PT. States draft → validated (tax) → approved → issued. Generator ≠ approver ≠ receiver of payment. | `FC07`, BR-FIN-001, BR-FIN-006, `42_Jadwal_Termin`, `P1-M1` |
| B2 | **Cash receipts and AR aging.** Receipt against invoice (≤ invoice value), aging buckets, weekly review list. | BR-FIN-002, `P1-M2` |
| B3 | **AP bills.** Extend `payment_request` into vendor bills (partner, COA, project, PPh 23), so expense actuals come from one place. | `P1-M3` |
| B4 | **Cash transactions and weekly cashflow.** W1–W4 per month per PT, consolidated ESA + MMT; cash out per COA (direct 5100–5900, OPEX 6100–6420). Reuse `/cash`. | `FC07` add. 1, BR-CF-001..003, `P1-M4` |
| B5 | **Bank facilities, drawdowns and BG.** Bank master; facility (BG/KMK/KI/trade line) with plafon and expiry; drawdown/BG linked to a project with underlying document; available = plafon − outstanding, block over-plafon; reminders 30 days before expiry and 7 days before interest due (3rd/15th/25th); alert when one bank holds > 50% of plafon. Seed from `10_Liabilities` and `14_Obligo_Status_Apr2026`. Build on `loan_facility` / `loan_move`. | `FC08`, BR-OBG-001..009, `P1-M5` |
| B6 | **Tax.** PPN out/in, PPh 21/23 withholding, e-Faktur export file. | `P1-M11`, BR-NFR-005 |
| B7 | **Monthly closing.** Closing wizard per PT per month: lock period (A9), Accounting types the balance-sheet totals (decision 4), take an immutable P&L snapshot. | `FC07` step 9, `FC09`, BR-RPT-003, BR-FIN-008 |
| B8 | **P&L engine.** Revenue → COGS → GP → OPEX → EBITDA → EBIT → EBT → Net from sub-ledgers by COA, per PT and consolidated with intercompany elimination; compare with RKA. | `P1-M6`, `P1-M9`, BR-FIN-004, BR-FIN-007 |

Exit gate: one month closed end to end for ESTRADA and MATRIK, P&L reconciles to invoices and bills.

### Phase C — Ops flow (P2)

| # | Step | Sheets / BR |
|---|---|---|
| C1 | **Pipeline statuses and SPH.** Add the missing statuses from `ref` / BR-SP-001 (POC, SPH, Negotiation, Admin Kontrak, Drop, Cancel) to the existing PP/PT/QO/WB flow; sequential transitions; SPH with running number per PT per year, Pricing review, Head BusDev approval; legal doc status P6/P8/Kontrak (DRAFT/Sirkulir/DONE); sub-segment, model bisnis, kategori product, PIC Sales/Presales; affiliated-PT tag for Korlantas direct. | `FC03`, BR-SP-001..007, `11_Pipeline_Actual` |
| C2 | **Project contract fields.** No Kontrak (unique per customer), Tgl Kontrak ≥ Tgl P8, durasi, term of payment (Lumpsum/Turnkey/Termin), PIC Legal/SCM/PM/OPS/HRD/Finance, project owner PT; auto-create the project at Won Bidding; inherited fields read-only. | `FC04`, BR-PRJ-001..004 |
| C3 | **Purchase request → PO → goods receipt.** PR from a project (budget check against the RKA line), PO number `NNN/<PT>-PO/MM/YYYY`, approval by A10 thresholds, receipt (BAST internal), 3-way match PO–receipt–bill before payment. Requester ≠ PO creator ≠ approver ≠ payer. | `FC05`, BR-SCM-001..004 |
| C4 | **Telkom billing tracker.** 12 stages P6 → Cash In with SLA per stage, document per stage, 7-stage JPMB assurance progress, obstacle log, escalation by the 5-level matrix (automatic notice on SLA breach). Link to existing BAI/BAUT/BARD/BAST fields on `project`. | `12_Stages_Penagihan`, `15_Escalation_Matrix`, BR-PNG-001..006 |
| C5 | **Billing trigger.** RFS or BAST opens the next termin's invoice (B1); invoice cannot be issued before RFS for service projects. | BR-IMP-002, `FC06` |

Exit gate: one Telkom project from Won Bidding to invoice issued without retyping data.

### Phase D — Executive (P3)

| # | Step | Sheets / BR |
|---|---|---|
| D1 | **KPI targets.** Per PT per year: revenue (won bidding), EBITDA %, cash-in amount (typed, decision 2), net margin %; Direktur PT submits, BOD approves; monthly phasing from `22_Assumptions` / `EXEC_01_Assumption`; consolidated = sum of PTs. Replaces the free-standing `pipeline_target` total. | `FC01`, BR-KPI-001..003, BR-TGT-001..002, `Master Target Perusahaan` |
| D2 | **KPI thresholds.** The 10 KPIs of `08_KPI_Thresholds` with SEHAT/WASPADA/KRITIS bands as domain rules; stress test (cash-in −20%, liabilities concentration > 40%, customer concentration > 50%). | BR-KPI-004..005 |
| D3 | **BOD dashboard and portfolio.** Layout from `18_Dashboard_Spec_BOD`; portfolio per project (revenue, COGS, GP %, cash-in, AR, BG outstanding); drill-down max 3 levels; BOD-only access. | `FC10`, `FC11`, BR-DSH-001..002, BR-PRT-001..002, BR-UX-002 |
| D4 | **Reports.** Monthly/quarterly/semester/yearly per PT and consolidated from closing snapshots; Excel/PDF export with company header. | `FC09`, BR-RPT-001..002 |
| D5 | **Early warning.** Rules on thresholds and SLAs raise notifications with acknowledge and escalation. | `P3-M4`, `00_Resume` C.14 |

Cross-cutting in every phase: access per function F0–F6 following `20_Navigation_IA` (BR-NFR-007, BR-UX-005); audit rows for every change (`04_Audit_Log_Spec`); Panduan updated.

### Beranda per role (EXEC sheets)

The `EXEC_*` sheets describe executive widgets. **Their figures are sample data** (customers such as "Kementerian X" or "Bank XYZ", a BNI facility that is not in `14_Obligo`, round numbers): use them for what to show and how, never as seed data. Every widget is computed from the app's own tables.

Layout of `apps/web/src/app/(app)/page.tsx`: keep today's per-role "what is waiting for you" card (the `HOME` map) and RKA progress on top; add KPI cards below, each linking to its detail screen. KPI logic belongs in `packages/domain` (extend `dashboard.ts`), scoped by `can()` and the user's entities and units. Status colours follow the `08_KPI_Thresholds` bands (SEHAT / WASPADA / KRITIS) once D2 exists.

| EXEC sheet | Widget | Shown to (app roles) | Data source | Buildable |
|---|---|---|---|---|
| 13 RKA | Budget approved vs Realisasi vs remaining per division, utilization % | finance, director, auditor; division_owner (own division) | locked `budget_version` lines + Realisasi; commitment from POs later | **Now** (commitment after C3) |
| 14 Cost Center | Budget, YTD, run rate, variance > 10% flag per unit | finance; division_owner, default_owner (own units) | org unit = cost center (decision 5), RKA vs Realisasi | **Now** |
| 04 Pipeline | Funnel by status, weighted value, aging (days since created) | director, auditor; requestor/default_owner/division_owner in BCD | `pipeline_deal` | **Now** |
| 10 Cashflow | Monthly cash in/out, ending balance, runway | cash_manager, finance, director | existing `/cash` projection; weekly W1–W4 after B4 | **Now** |
| 11 Bank Obligo | Plafon, outstanding, available, utilization per facility; concentration alert | cash_manager, director, finance | `loan_facility` / `loan_move`; BG and drawdowns after B5 | Partly now, full after B5 |
| 15 Headcount | Headcount actual vs plan per unit | director; division_owner (own division); HCM unit | `employee` count per unit + `headcount_plan`. No salaries on Beranda (HR data) | **Now** (counts only) |
| 05 Project | Project list, status, contract value | director; BCD and PDMS units | `project` + deal value; cost and margin after B3/C3 | List now, margin after C |
| 18 Dashboard | KPI cards: revenue vs target, EBITDA, net profit, cash collection, plafon obligo, headcount | director, auditor | D1 targets + B8 P&L + B2 receipts + B5 + `employee` | After B and D1 |
| 03 Sales | Target vs actual per salesperson, coverage | division_owner in BCD, director | PIC Sales on deals (C1) + invoices (B1) | After C1 |
| 06 Revenue | Earned vs invoiced, unbilled per project | finance, director; PDMS | project progress + invoices | After B1 and C5 |
| 07 Invoice | Issued, paid, outstanding, overdue | finance, bfp, cash_manager | `invoice` (B1) | After B1 |
| 08 AR | AR aging per customer, DSO | finance, cash_manager, director | B2 | After B2 |
| 09 AP | AP aging per partner, DPO | cash_manager, bfp | B3 | After B3 |
| 12 P&L | Quarterly P&L and margins | director, finance, auditor | B8 snapshots | After B8 |
| 17 Financial Ratio | Profitability, liquidity, solvency ratios | director, finance | B8 + balance-sheet totals typed at closing (B7) | After B7–B8 |
| 16 Productivity | Revenue and EBITDA per employee | director | B8 + `employee` | After B8 |
| 19 Executive Summary | Figures plus highlights text | director (and Komisaris, see section 7) | automatic figures + highlights typed by BOD/CFO | D3 |
| 20 Risk Analysis | Risk register, likelihood × impact heat map | director, auditor | new `risk` register (CRUD, owner, mitigation): add as step D6 | D6 |
| 01 Assumption, 02 Target | Not on Beranda | — | inputs: settings screens for Finance and BOD (D1) | D1 |
| 21 AI Recommendation | Not built | — | out of scope (decision 9) | — |

Per role, Beranda then shows:

- **requestor:** own RKA lines and payment requests (as today); BCD staff also see the pipeline funnel.
- **default_owner:** consolidation queue (today) + cost-center card for own units.
- **division_owner:** division approvals (today) + RKA utilization, cost centers and headcount for the division; BCD head also sales per salesperson; PDMS head also projects.
- **finance:** status board (today) + RKA utilization, cost centers, cashflow; later invoices, AR, P&L, ratios.
- **bfp:** payment checks (today); later invoices and AP.
- **cash_manager:** payment schedule (today) + cashflow, obligo; later AR and AP aging.
- **director:** RKA summary (today) + pipeline, cashflow, obligo, headcount, projects; later the EXEC_18 KPI cards, P&L, ratios, summary, risk.
- **auditor:** read-only versions of the director's cards + risk register.
- **admin:** unchanged (master data).

Steps:
- **D0 (can start after Phase A):** the "Now" widgets above.
- **D6:** risk register.

Each later widget ships with the step that provides its data.

### Other sheets: budget monitoring, forecasting, governance

The model sheets (`22`–`38`, `40`) use sample figures like the EXEC sheets; take their formulas and thresholds, not their numbers.

| # | Step | Sheets | Data source | Buildable |
|---|---|---|---|---|
| E1 | **Spending monitor per cost center.** Budget (locked RKA) vs committed vs actual vs remaining per org unit and COA, status <80% green, 80–95% amber, >95% red; CFO summary cards (total, actual YTD, committed, remaining, utilisation). | `34_Budget_Plan`, `35_Spending_Trx`, `36_Budget_Monitoring`, `38_Exec_Spending_Summary` | committed = `payment_request` in `submitted`…`scheduled`; actual = `paid` + Realisasi; POs join "committed" after C3 | **Now** |
| E2 | **Variance commentary.** Budget vs actual per cost center and COA with bands ±5% Watch, ±10% Investigate, ±15% Escalate and an auto-generated sentence per row; the owner may add a root-cause note (required at Escalate). | `31_Process_Mining`, `37_Variance_Analysis` | E1 figures; reuse `line_comment` style for notes | **Now** |
| E3 | **Budget vs actual as of a date.** As-of date and period (MTD/QTD/YTD) selector; manual adjustment entries (accrual, correction) by Accounting, kept apart from the automatic feed and audited. | `27_Budget_vs_Actual`, `27a_Daily_Actuals`, `27b_Auto_Feed` | RKA + Realisasi + payments now; invoices and receipts after B1–B2 | Now (cost side), revenue after B |
| E4 | **Won deal without a project.** Control list of Won Bidding deals that have no `project` record, with a button to create it. | `41_Pipeline_Projek_Sync` | `pipeline_deal` + `project.deal_id` | **Now** |
| E5 | **Termin schedule defaults.** DP 15%, retention 5%, planned vs billed per termin per month, overdue flag; % and dates may be overridden. Feeds B1. | `42_Jadwal_Termin`, `22_Assumptions` | `billing_termin` | Plan now, billed after B1 |
| E6 | **Scenarios and sensitivity.** Conservative / Normal / Aggressive revenue with monthly seasonality; cost by ratio; projected P&L and cashflow with burn rate and runway; net-profit grid over COGS % × OPEX %. Pure domain math over RKA totals and the cash assumptions. | `22`–`26`, `28_AR_AP_Forecast`, `30_Scenario_Sensitivity` | RKA + `/cash` assumptions; AR/AP forecast from DSO/DPO after B2–B3 | **Now** (AR/AP part later) |
| E7 | **Audit event catalogue.** Event code, severity and retention per event (e.g. `AUTH.LOGIN` incl. failed logins, 1 year); record login events; Audit Log Viewer screen (filter by user, module, object, date). | `04_Audit_Log_Spec`, SCR-AUD-01 | extend `audit_log` | **Now** |
| E8 | **Compliance tracker.** The checklist (PPN, PPh, PSAK, POJK, retention) as a list with status and evidence link per module. | `06_Compliance`, SCR-AUD-03 | new small table, seeded from the sheet | **Now** |
| E9 | **Project profitability.** Contract value, COGS actual, OPEX allocation, GP / EBITDA / net per project, ranking and rating. | `29_Project_Profitability` | after B3, C3; OPEX allocation from `/rka/allocation` | After B and C |

Reference only (use while building the related step, not a step of its own): `19_Form_Field_Spec` (field types, defaults and validation for the RKA, invoice, pipeline, PR, BG/KMK and employee forms), `21_Process_Flow_Design` (swimlanes and SOPs, good input for the Panduan), `32_Executive_Summary` and `40_Exec_Strategic_Dashboard` (same content as EXEC_18/19, see D3).

Suggested order for the "Now" items: E4 and E7 (small), then E1 → E2 → E3 (one budget-monitoring area), E6, E8, E5.

## 6. Data-quality issues to handle on import

- `M Customer`: eight customers share NPWP `010611200093000` (placeholder); Cust-005 and Cust-007 are the same ministry; ministries tagged segment "Telco" instead of K/L; invalid emails (`email@korlantas..id`, `email@tpi soetta.co.id`).
- `Master Mitra`: Mitra-002 NPWP contains hidden Unicode; Mitra-004..008 have no NPWP and the placeholder email `@lixabluepower.id`; Mitra-003 email copied from Mitra-002.
- `Master Produk Mitra`: rows reuse the Mitra ID as product ID.
- `M Organisasi`: NIP `E20190088 ` has a trailing space.
- COA: workbook-only codes 1615, 1616, 5100-1, 5200-1, 6130-S2 are still provisional; Finance decides whether to confirm or remap them.
- Data Karyawan: 9 employees without email; Posisi spelled "Engeener".

Report these in the importer output or a review list; never silently fix a value the client owns.

## 7. Open points to confirm with the user when the step comes up

- Which roles approve at which amounts (A10): the BRD gives the idea, not the numbers.
- Unit placement of DEVOPS, PDA and PITS (seeded under DIR; their staff are partly DJALU).
- Whether `postable = false` COA codes may still carry RKA lines (current lines sit on parents such as 4100).
- EXEC sheets name CEO, CFO, VP Sales and VP HR. The app's roles map VP Sales to BCD's division_owner and VP HR to HCM's, but no seat is "CFO" yet (probably Head FRM): confirm before D0.
- `EXEC_19` is for Board and Komisaris; the app has no Komisaris role. Add a read-only role, or let them use the director's view?
- A6 needs a "Finance Controller" approver for sensitive masters; the app has no such role. Is it the auditor seat (Audit & Finance Control), the FRM division owner, or a new role?
- HRMS sync (BR-MD-003): is there an API on `hrms.estrada.co.id`, or does HCM keep sending the Data Karyawan CSV?
