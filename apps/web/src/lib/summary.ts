import "server-only";
import type { ApprovalState, Role } from "@estrada/domain";
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
  const [scoped, org] = await Promise.all([version ? loadScopedLines(user, undefined, version.id) : [], loadOrg()]);
  const lines = scoped.filter(
    (l) =>
      (!params.entity || l.entity === params.entity) &&
      (!params.division || org.divisionOf(l.ownerUnit) === params.division) &&
      (!status.states || status.states.includes(l.state)),
  );
  return { versions, version, scoped, lines, org };
}
