import "server-only";
import { allocateShared, contribution, entityAllocation, type ApprovalState, type Role } from "@estrada/domain";
import { loadAllocation } from "./allocation";
import { loadScopedLines, reportVersions } from "./rka";
import type { CurrentUser } from "./session";
import { loadOrg } from "./workflow";

/** Who reads the Management Summary and may download it. */
export const SUMMARY_ROLES: readonly Role[] = ["division_owner", "finance", "director", "auditor"];

export const SUMMARY_STATUS: Record<string, { label: string; states: readonly ApprovalState[] | null }> = {
  all: { label: "Semua status", states: null },
  final: { label: "Sudah difinalisasi", states: ["awaiting_lock", "locked"] },
  locked: { label: "Terkunci", states: ["locked"] },
};

export interface SummaryParams {
  version?: string;
  entity?: string;
  division?: string;
  status?: string;
}

/**
 * The lines behind the Management Summary and its Excel export, so the download always matches the screen.
 * Shows the open version, else the latest locked one: the final RKA must stay readable after the lock.
 */
export async function loadSummary(user: CurrentUser, params: SummaryParams) {
  const status = SUMMARY_STATUS[params.status ?? "all"] ?? SUMMARY_STATUS.all!;
  const versions = await reportVersions();
  const version = versions.find((v) => v.id === params.version) ?? versions[0] ?? null;
  const [scoped, org, allocation] = await Promise.all([
    version ? loadScopedLines(user, undefined, version.id) : [],
    loadOrg(),
    version ? loadAllocation(version.id) : null,
  ]);
  const inScope = scoped.filter(
    (l) => (!params.division || org.divisionOf(l.ownerUnit) === params.division) && (!status.states || status.states.includes(l.state)),
  );
  const byEntity = <L extends { entity: string }>(l: L) => !params.entity || l.entity === params.entity;
  // Shared costs are split before the entity filter, so an entity's view carries its share of them.
  const { lines: allocated, problems } = allocation ? allocateShared(inScope, allocation.rules, allocation.ctx) : { lines: inScope, problems: [] };
  const entityRows = entityAllocation(
    contribution(inScope, (l) => l.entity),
    contribution(allocated, (l) => l.entity),
    allocation?.ctx.entities ?? [],
  ).filter((r) => !params.entity || r.key === params.entity);
  return {
    versions,
    version,
    scoped,
    org,
    /** The lines as entered, for counts and the RKA Data sheet. */
    lines: inScope.filter(byEntity),
    /** The lines as reports read them: shared costs split across the entities. Totals match `lines` without an entity filter. */
    reportLines: allocated.filter(byEntity),
    entityRows,
    allocationProblems: problems,
    sharedLines: allocation?.rules.size ?? 0,
  };
}
