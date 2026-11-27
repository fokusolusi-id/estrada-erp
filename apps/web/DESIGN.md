---
name: ERP Estrada
description: "Budget-first ERP: exact figures on quiet ruled surfaces, colour only where it means something."
colors:
  estrada-indigo: "oklch(0.42 0.22 268)"
  brand-deep: "oklch(0.3 0.14 268)"
  paper: "oklch(1 0 0)"
  ink: "oklch(0.145 0 0)"
  sidebar-wash: "oklch(0.975 0.015 265)"
  muted-fill: "oklch(0.965 0.012 265)"
  secondary-fill: "oklch(0.96 0.02 265)"
  accent-fill: "oklch(0.94 0.04 265)"
  selected-fill: "oklch(0.92 0.05 265)"
  muted-ink: "oklch(0.5 0.03 265)"
  secondary-ink: "oklch(0.3 0.12 268)"
  rule: "oklch(0.91 0.02 265)"
  focus-ring: "oklch(0.62 0.17 268)"
  destructive: "oklch(0.53 0.216 27.325)"
  success: "oklch(0.5 0.13 150)"
  warning: "oklch(0.75 0.15 75)"
  info: "oklch(0.6 0.13 240)"
  state-draft: "oklch(0.55 0.02 260)"
  state-consolidation: "oklch(0.62 0.13 230)"
  state-division: "oklch(0.52 0.18 275)"
  state-finance: "oklch(0.7 0.15 70)"
  state-finance-text: "oklch(0.5 0.12 65)"
  state-awaiting: "oklch(0.55 0.2 300)"
  state-locked: "oklch(0.6 0.14 160)"
  cat-revenue: "oklch(0.62 0.15 160)"
  cat-cogs: "oklch(0.68 0.17 50)"
  cat-opex: "oklch(0.58 0.1 235)"
  cat-others: "oklch(0.6 0.02 260)"
  cat-capex: "oklch(0.52 0.2 310)"
  entity-estrada: "oklch(0.36 0.15 265)"
  entity-matrik: "oklch(0.62 0.11 190)"
  entity-djalu: "oklch(0.66 0.15 110)"
  entity-pas: "oklch(0.6 0.2 350)"
typography:
  figure:
    fontFamily: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "1.75rem"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  page:
    fontFamily: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "1.625rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  section:
    fontFamily: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.estrada-indigo}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.secondary-fill}"
    textColor: "{colors.secondary-ink}"
    rounded: "{rounded.md}"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    height: "36px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "24px 0"
  status-badge:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  nav-item:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  nav-item-active:
    backgroundColor: "{colors.selected-fill}"
    textColor: "{colors.estrada-indigo}"
---

# Design System: ERP Estrada

## Overview

**Creative North Star: "The Budget Ledger"**

ERP Estrada reads like a well-kept ledger: white paper, ruled lines, figures aligned and exact. It is an Operate surface used at office desktops during the budget cycle and payment runs, so density and scanability come first. Colour is rationed: Estrada Indigo marks the brand and the action to take, and every other hue says something specific (approval state, P&L category, company entity).

Components are quiet and flat. Hairline borders and pale indigo tints separate things; shadows are barely there and only overlays lift. Light, dark and follow-system themes share one token set.

**Key Characteristics:**
- Exact rupiah in tabular figures with a slashed zero
- Hairline rules and tonal fills before shadows
- Three meaning families: state, category, entity
- One typeface, four hierarchy steps, nothing under 12px
- Every screen fits a phone without sideways page scroll

## Colors

A white, faintly indigo-tinted ledger with one brand voice and three strictly separated meaning families. Frontmatter holds the light theme; dark values are defined under `.dark` in `src/app/globals.css`.

### Primary
- **Estrada Indigo** (`estrada-indigo`): primary buttons, links, the active menu item.
- **Logo Deep Blue** (`brand-deep`): brand surfaces such as the sign-in panel; lighter in dark mode so it stays distinct from the page.
- **Focus Indigo** (`focus-ring`): focus outlines.

### Neutral
- **Ledger Paper** (`paper`): page, card and popover background.
- **Ledger Ink** (`ink`): body text and figures.
- **Pencil Grey** (`muted-ink`): captions, secondary text, placeholders.
- **Ruled Line** (`rule`): borders, table rows, input strokes.
- **Margin Wash** (`sidebar-wash`): the menu column.
- **Column Tint** (`muted-fill`): table footers and row hover (at half strength).
- **Secondary Tint** (`secondary-fill`): secondary buttons, with `secondary-ink` text.
- **Hover Tint** (`accent-fill`): ghost and outline hover.
- **Selected Tint** (`selected-fill`): current and hovered menu items.

### Semantic
`destructive`, `success`, `warning`, `info`: outcomes and alerts. Negative signed figures turn `destructive`.

### Meaning families
- **Approval state** (`state-*`), Draft to Terkunci: slate, blue, violet-blue, amber, purple, green. Badges show a solid dot on a 12 to 15% tint with ink text.
- **P&L category** (`cat-*`): the same colour for a category in every chart.
- **Entity** (`entity-*`): the same colour for a company in every chart and legend.

### Named Rules
**The One Meaning Rule.** A state, category or entity colour means only that thing. It is never decoration, and state colours are not charted beside category or entity colours.

**The Readable Colour Rule.** Any colour used as text reaches 4.5:1 on page, card and muted fills in both themes (`src/app/contrast.test.ts`); chart series colours stay on bars and markers, never on labels.

**The Never Colour Alone Rule.** Every meaning colour travels with a label, dot-plus-text or icon.

**The Reserved Amber Rule.** Amber belongs to Review Finance and warnings. Amber text uses Review Finance, as text.

## Typography

**Body Font:** Inter Variable (with system-ui fallbacks), used for everything.
**Mono:** system monospace, for code-like values only.

**Character:** One plain, highly legible sans; weight and size carry hierarchy.

### Hierarchy
- **Figure** (650, 1.75rem, 1.1): KPI values and totals.
- **Page title** (650, 1.625rem, 1.2): one per screen.
- **Section title** (600, 1.0625rem, 1.4): card and section headings.
- **Body** (400, 0.875rem): tables, forms, controls; medium for buttons and table headers. Inputs use 1rem on small screens.
- **Label** (500, 0.75rem): captions and badges.

### Named Rules
**The Ledger Figures Rule.** Every rupiah figure uses tabular, slashed-zero numerals and the screen states its unit.

**The Four Steps Rule.** Hierarchy comes from Figure, Page title, Section title and body; do not invent in-between sizes.

## Layout

A full-height shell: a collapsible menu column on the left, a sticky 56px header (position, view scope, notifications, theme, user), and a content area capped at the 2xl width (1536px) with 16px padding, 24px from the md breakpoint. Pages stack in a 16px grid; headers put title and description left, actions right, wrapping when narrow. Spacing follows Tailwind's 4px steps, mostly 4, 8, 16 and 24px. On phones the menu becomes a Menu button and tables scroll within their container. KPI groups respond to their container width: 1, 2, then 4 columns.

## Elevation & Depth

Flat. Depth comes from 1px rules and tonal fills. Controls carry an extra-small shadow and cards a small one, both barely perceptible; the KPI strip removes it altogether. The sticky header separates with a bottom border.

### Named Rules
**The Flat Page Rule.** Surfaces rest on borders and tint. Only popovers, menus and dialogs may cast a visible shadow.

## Shapes

Gently rounded rectangles from a 10px base: 8px on buttons, inputs, badges and menu items; 14px on cards and the KPI strip. Full circles are for status dots and similar markers.

## Components

### Buttons
- **Shape:** 8px radius; 36px high (32px small, 40px large, 36px square icon).
- **Primary:** indigo with white text, 16px side padding; hover at 90% strength.
- **Variants:** outline (border, tint on hover), secondary (indigo tint), ghost, link, destructive.
- **States:** disabled at 50% opacity; focus shows the indigo ring.

### Status badges
Label-size medium text, solid state dot, pale state tint, no border.

### Cards / Containers
14px radius, 1px rule, white, 24px vertical padding and gaps.

### KPI strip
One bordered container divided by rules, not separate cards: muted label, caption, large tabular figure, change with arrow icon.

### Inputs / Fields
36px, 8px radius, ruled stroke, transparent fill, 12px side padding. Selects draw their own chevron 12px in.

### Tables
Body-size text, 40px header row in medium weight, 8px cells without wrapping, row rules, half-strength tint on hover and in the footer.

### Navigation
Icon plus label rows, 8px radius. Hover fills with the selected tint; the current page adds indigo medium text and a 3px indigo inset bar on the left. Collapses to icons.

## Do's and Don'ts

### Do:
- Do apply the `tabular` class to every column of money and every KPI figure.
- Do use the ERP composites (`components/erp`) on screens rather than raw primitives.
- Do use Estrada Indigo for the primary action, links, focus and the current menu item.
- Do take colours from the tokens in `globals.css` so light and dark stay in step.
- Do keep wide tables scrolling inside their own container.
- Do meet WCAG 2.2 AA in both themes.

### Don't:
- Don't use a state, category or entity colour as decoration.
- Don't convey status by colour alone.
- Don't set text below 12px.
- Don't add shadows to separate sections; use a rule or a tint.
- Don't recolour, redraw or restyle the Estrada logo.
- Don't use the BRD sample figures as real data.
