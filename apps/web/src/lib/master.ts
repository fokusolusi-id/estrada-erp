import "server-only";
import { can, type Permission } from "@estrada/domain";
import { requireUser } from "./session";
import { loadOrg } from "./workflow";

/** Who is looking at a master page and what they may do there. Everyone signed in may read the masters but Karyawan. */
export async function masterAccess() {
  const user = await requireUser();
  const org = await loadOrg();
  const may = (permission: Permission) => can(user.actor, permission, null, org);
  return { may, employees: may("employee.view"), requests: may("master.requests"), costCenters: may("costcenter.view"), periods: may("period.view") };
}

/** The form's view of a database row: blanks for nulls, text for numbers. */
export const formValues = (row: object, names: readonly string[]): Record<string, string | boolean> =>
  Object.fromEntries(
    [...names, "active"].map((n) => {
      const value = (row as Record<string, unknown>)[n];
      return [n, typeof value === "boolean" ? value : value == null ? "" : String(value)];
    }),
  );
