import { vi } from "vitest";
import { OrgTree, ROLES, type Actor, type Role } from "@estrada/domain";

/** A small company: enough units to tell a BCD person from a PDMS one. */
export const ORG = new OrgTree([
  { code: "DIR", parent: null },
  { code: "FRM", parent: "DIR" },
  { code: "BCD", parent: "DIR" },
  { code: "PDMS", parent: "DIR" },
  { code: "SCM", parent: "PDMS" },
  { code: "PMO", parent: "PDMS" },
]);

/** The unit a seat of each role sits in, unless a test says otherwise. */
const HOME: Record<Role, string> = {
  requestor: "SCM",
  default_owner: "SCM",
  division_owner: "PDMS",
  finance: "FRM",
  bfp: "FRM",
  cash_manager: "FRM",
  director: "DIR",
  auditor: "DIR",
  admin: "DIR",
};

export const actorOf = (role: Role, over: Partial<Actor> = {}): Actor => ({
  userId: `user-${role}`,
  role,
  orgUnit: HOME[role],
  entities: ["*"],
  ...over,
});

/** What the mocked session returns; set it with `signInAs`. */
export const session: { current: Actor } = { current: actorOf("requestor") };
export const signInAs = (role: Role, over: Partial<Actor> = {}) => {
  session.current = actorOf(role, over);
};

/** Rows a `select` returns; empty unless a test sets them. */
export const rows: { current: unknown[] } = { current: [] };

/** For an action whose queries must read differently: one entry per query, in order. Once used up, `rows` answers. */
export const queued: { current: unknown[][] } = { current: [] };

class DbWrite extends Error {
  constructor(what: string) {
    super(`database ${what} reached`);
  }
}

/**
 * A database that reads as empty (or as `rows`) and refuses every write. An action that is refused returns before it
 * writes; one that is allowed goes on to a write, which this turns into an error the test can recognise.
 */
export function fakeDb() {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit", "groupBy", "innerJoin", "leftJoin"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown[]) => unknown) => resolve(queued.current.shift() ?? rows.current);
  const refuse = (what: string) => () => {
    throw new DbWrite(what);
  };
  return {
    select: () => chain,
    insert: refuse("insert"),
    update: refuse("update"),
    delete: refuse("delete"),
    transaction: refuse("transaction"),
  };
}

/** Any table or column is just a name: the actions only hand them to the query builder. */
export function fakeSchema() {
  const table = new Proxy({}, { get: (_t, k) => (typeof k === "symbol" ? undefined : { name: String(k) }) });
  return new Proxy({}, { get: (_t, k) => (typeof k === "symbol" ? undefined : table) });
}

export const everyRole: readonly Role[] = ROLES;

/**
 * Runs an action and says how it ended: refused with a message, or "pastGate" when it went on and failed on something
 * the test does not provide (a write to the fake database, a cookie outside a request). A refused call never throws,
 * so a throw is proof that the action let the caller through.
 */
export async function outcome(run: () => Promise<{ ok: boolean; message: string }>): Promise<{ message: string } | { pastGate: string }> {
  try {
    const r = await run();
    return { message: r.message };
  } catch (e) {
    return { pastGate: e instanceof Error ? e.message : String(e) };
  }
}

export const noop = vi.fn();
