# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Estrada Group staff, working in Bahasa Indonesia at office desktops; phones are a secondary place to check status and approve. Each user holds a position (role + org unit + visible entities), and may hold several or act as pjs.

- **Requestor, Default Owner, Division Owner**: prepare, consolidate and approve their unit's RKA lines during the budget cycle; raise payment requests.
- **Finance Reviewer**: reviews, finalises and locks RKA; owns Realisasi, Biaya Bersama, COA Master, Arus Kas, Pipeline and Implementasi oversight.
- **Business Finance (BFP) and Cash Management**: check, schedule and pay payment requests; manage bank accounts.
- **PDMS (PMO, SCM, ISO, MSO) and BCD**: run Implementasi (BAI, RFS/BAST, handover, warranty) and the sales Pipeline.
- **Direktur / BOD**: read-only view of group health per PT; locks RKA where configured.
- **Auditor**: reads everything, including the audit trail.
- **Admin**: users, units, entities, org structure; never sees budget figures.

## Product Purpose

ERP Estrada replaces the RKA 2027 workbook. It carries every budget line from Draft to Terkunci through a fixed approval chain, then measures payments, pipeline, implementation and (per the BRD v5 plan) invoices, cash, closing and P&L against that budget. Success: the cycle runs without the workbook, figures reconcile to it to the rupiah, and BOD sees group health without asking Finance.

## Positioning

- **Budget-first.** The RKA is the spine; every other module is measured against it.
- **One seat per stage.** At each approval stage exactly one role can act; returns need a note; every change is audited.
- **Workbook parity.** Imports reconcile to the source workbook to the rupiah and nothing is guessed; the team's own vocabulary stays.
- **BOD visibility.** Executives see per-PT and consolidated health directly.

## Operating Context

- RKA cycle: Draft → Konsolidasi → Persetujuan Divisi → Review Finance → Menunggu Kunci → Terkunci; changes after locking go through revisi.
- A global "Tampilan" (year, entity, division, unit of display e.g. Juta) scopes every screen; active filters are always stated.
- Source documents: RKA_2027_Upd_Fin v2.xlsx and BRD_MasterData_rini v5.xlsx (client data, not committed); `.xlsx` export of the Management Summary.
- Email: one per handoff, no rupiah figures in the body; daily reminders.
- In-app guide (Panduan) in Bahasa Indonesia covers every menu, role and state.

## Capabilities and Constraints

- Entities include ESTRADA and MATRIK (PTs); consolidated views sum PTs.
- Money is exact decimal rupiah; never approximate figures in the UI.
- Authorisation is enforced on the server for every page and action; hidden menus are not a security boundary.
- UI copy in Bahasa Indonesia; keep RKA, COA, Realisasi, Beban, BAI, BAST, RFS, Termin as the team uses them.
- Every screen must fit a phone without sideways scroll.
- Planned (docs/brd-v5-plan.md): master data, finance core (invoice, AR, AP, tax, closing, P&L), ops flow (SPH, PR/PO, Telkom billing tracker), BOD dashboard. Settled decisions there are not reopened.

## Brand Commitments

- The Estrada Group logo is binding, with its colours: `apps/web/public/logo.png`, `showcase/logo/logo.svg`, `showcase/logo/mark-light.svg`, `showcase/logo/mark-dark.svg`.
- Light, dark and follow-system themes are offered.

## Evidence on Hand

- Real RKA 2027 lines, COA and Karyawan via the importers (fixtures, not committed); golden test reconciles revenue to the workbook.
- BRD v5 `EXEC_*` sheets are **sample data** (e.g. "Kementerian X", "Bank XYZ"): use for layout intent only, never as figures.
- No testimonials, customer quotes or published metrics exist; do not invent them.

## Product Principles

1. The budget is the reference point: show any figure next to the RKA it is measured against.
2. Make the next action and its owner obvious; nobody should wonder whose turn it is.
3. Exact over approximate: figures must match the source to the rupiah, and units are always stated.
4. Scope is always visible: the user knows which year, entity and division they are looking at.
5. Speak the team's language, not generic ERP terms.

## Accessibility & Inclusion

WCAG 2.2 AA.
