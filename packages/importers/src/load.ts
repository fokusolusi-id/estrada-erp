/**
 * Loads an RKA workbook into the database as a new open budget version.
 *   pnpm db:import -- "fixtures/RKA_2027_Upd_Fin v2.xlsx" [--dry-run] [--replace] [--state draft] [--name "RKA 2027 v2 Upd Fin"]
 * Nothing is guessed: rows the importer cannot place stop the load. Codes missing from COA Master are added
 * as provisional accounts, and the workbook's cleaning flags travel with each line for reviewers.
 */
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { ORG_UNITS } from "@estrada/db/seed-data";
import { APPROVAL_STATES, formatIdr, headcountBasis, pnl, type ApprovalState } from "@estrada/domain";
import { readRkaWorkbook } from "./workbook";

const { values, positionals } = parseArgs({
  // pnpm forwards the "--" in `pnpm db:import -- file --dry-run`; without this the flags would become file names.
  args: process.argv.slice(2).filter((a) => a !== "--"),
  allowPositionals: true,
  options: {
    "dry-run": { type: "boolean", default: false },
    replace: { type: "boolean", default: false },
    state: { type: "string", default: "draft" },
    name: { type: "string" },
    year: { type: "string", default: "2027" },
  },
});

async function main() {
  // pnpm runs this from the package folder; INIT_CWD is where you typed the command.
  if (positionals.length > 1) throw new Error(`One workbook at a time; got ${positionals.join(", ")}`);
  const path = positionals[0] ? resolve(process.env.INIT_CWD ?? process.cwd(), positionals[0]) : null;
  if (!path) throw new Error('Usage: pnpm db:import -- "<workbook.xlsx>" [--dry-run] [--replace] [--state draft] [--name "..."]');
  const state = values.state as ApprovalState;
  if (!APPROVAL_STATES.includes(state) || state === "locked") throw new Error(`--state must be one of ${APPROVAL_STATES.filter((s) => s !== "locked").join(", ")}`);
  const name = values.name ?? basename(path).replace(/\.xlsx$/i, "").replace(/_/g, " ");
  const fiscalYear = Number(values.year);

  const wb = await readRkaWorkbook(path, ORG_UNITS);
  if (wb.problems.length) {
    for (const p of wb.problems) console.error(`  No ${p.no}: ${p.message}`);
    throw new Error(`${wb.problems.length} rows could not be placed; nothing was loaded`);
  }

  const summary = pnl(wb.lines.map((l) => ({ category: l.category, ownerUnit: l.ownerUnit, entity: l.entity, months: l.months })));
  const total = (key: string) => formatIdr(summary.find((r) => r.key === key)!.total);
  const provisional = wb.accounts.filter((a) => a.provisional).map((a) => a.code);
  console.log(`${name}: ${wb.lines.length} lines · revenue ${total("Revenue")} · total cost ${total("TotalCost")}`);
  console.log(`COA: ${wb.accounts.length - provisional.length} from COA Master, provisional ${provisional.join(", ") || "none"}`);
  console.log(`Lines flagged for review: ${wb.lines.filter((l) => l.flags.length).length}`);
  console.log(`Recruitment rows read as headcount plan positions: ${wb.lines.filter((l) => l.headcount).length}`);
  if (values["dry-run"]) {
    console.log("Dry run: nothing written.");
    return;
  }

  const entities = new Set((await db.select({ code: schema.companyEntity.code }).from(schema.companyEntity)).map((e) => e.code));
  const units = new Set((await db.select({ code: schema.orgUnit.code }).from(schema.orgUnit)).map((u) => u.code));
  const missing = [
    ...new Set([...wb.lines.map((l) => l.entity).filter((e) => !entities.has(e)), ...wb.lines.flatMap((l) => [l.requestorUnit, l.ownerUnit]).filter((u) => !units.has(u))]),
  ];
  if (missing.length) throw new Error(`Unknown entities or units: ${missing.join(", ")}. Run pnpm db:seed first.`);

  const versionId = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.budgetVersion).where(eq(schema.budgetVersion.name, name));
    if (existing) {
      if (!values.replace) throw new Error(`Version "${name}" already exists. Use --replace to load it again.`);
      if (existing.status === "locked") throw new Error(`Version "${name}" is locked and cannot be replaced.`);
      await tx.delete(schema.budgetVersion).where(eq(schema.budgetVersion.id, existing.id));
    }

    for (const a of wb.accounts) {
      const row = { name: a.name, category: a.category, center: a.center, defaultOwnerUnit: a.defaultOwnerUnit, active: a.active, guidance: a.guidance, examples: a.examples };
      if (a.provisional) {
        // A provisional code Finance already fixed keeps Finance's version.
        await tx.insert(schema.coaAccount).values({ code: a.code, ...row, provisional: true }).onConflictDoNothing();
      } else {
        await tx
          .insert(schema.coaAccount)
          .values({ code: a.code, ...row })
          .onConflictDoUpdate({ target: schema.coaAccount.code, set: { ...row, provisional: false, updatedAt: new Date() } });
      }
    }
    const codes = [...new Set(wb.references.map((r) => r.code))];
    await tx.delete(schema.coaReference).where(inArray(schema.coaReference.code, codes));
    await tx.insert(schema.coaReference).values(
      wb.references.map((r) => ({
        code: r.code,
        entityGroup: r.entityGroup,
        rka2026: r.rka2026?.toFixed(2) ?? null,
        actualYtd: r.actualYtd?.toFixed(2) ?? null,
        forecastQ4: r.forecastQ4?.toFixed(2) ?? null,
      })),
    );

    // One open version per year: the import replaces whatever was open before.
    const archived = await tx
      .update(schema.budgetVersion)
      .set({ status: "archived" })
      .where(and(eq(schema.budgetVersion.fiscalYear, fiscalYear), eq(schema.budgetVersion.status, "open"), ne(schema.budgetVersion.name, name)))
      .returning({ name: schema.budgetVersion.name });
    for (const v of archived) console.log(`Archived open version "${v.name}"`);

    const [version] = await tx.insert(schema.budgetVersion).values({ fiscalYear, name, source: basename(path) }).returning({ id: schema.budgetVersion.id });

    const inserted = await tx
      .insert(schema.budgetLine)
      .values(
        wb.lines.map((l) => ({
          versionId: version!.id,
          coaCode: l.coaCode,
          entityCode: l.entity,
          requestorUnit: l.requestorUnit,
          ownerUnit: l.ownerUnit,
          item: l.item,
          // A planned line's basis is written from its plan, as the app does; the workbook's own basis moves to the notes.
          basis: l.headcount ? headcountBasis(l.headcount) : l.basis,
          notes: l.headcount && l.basis ? [l.notes, l.basis].filter(Boolean).join(" · ") : l.notes,
          crossDivision: l.crossDivision,
          rka2026: l.rka2026?.toFixed(2) ?? null,
          actual2026: l.actual2026?.toFixed(2) ?? null,
          reviewFlags: l.flags,
          sourceRef: `RKA 2027 Data #${l.ref.no} (${l.ref.sheet}${l.ref.row ? ` baris ${l.ref.row}` : ""})`,
          state,
        })),
      )
      .returning({ id: schema.budgetLine.id });
    await tx.insert(schema.budgetLineAmount).values(
      wb.lines.flatMap((l, i) => l.months.map((m, k) => ({ lineId: inserted[i]!.id, month: k + 1, amount: m.toFixed(2) }))),
    );

    const plans = wb.lines.flatMap((l, i) =>
      l.headcount
        ? [{ lineId: inserted[i]!.id, position: l.headcount.position, headCount: l.headcount.count, startMonth: l.headcount.startMonth, costPerHead: l.headcount.costPerHead.toFixed(2) }]
        : [],
    );
    if (plans.length) await tx.insert(schema.headcountPlan).values(plans);

    await tx.insert(schema.auditLog).values({
      action: "import.workbook",
      subjectType: "budget_version",
      subjectId: version!.id,
      after: { file: basename(path), lines: wb.lines.length, revenue: total("Revenue"), totalCost: total("TotalCost"), provisional, state, headcountPositions: plans.length },
    });
    return version!.id;
  });

  console.log(`Loaded as open version ${versionId} (lines in state "${state}").`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
