import type { Role } from "@estrada/domain";

/** Test-only accounts, created fresh in the throwaway estrada_e2e database on every run. */
export const E2E_USERS = {
  requestor: { email: "e2e.requestor@estrada.test", name: "Rina (SCM)", title: "Staff SCM", orgUnit: "SCM", role: "requestor", entities: ["ESTRADA"] },
  default_owner: { email: "e2e.head.scm@estrada.test", name: "Bayu (Head SCM)", title: "Head of SCM", orgUnit: "SCM", role: "default_owner", entities: ["ESTRADA"] },
  division_owner: { email: "e2e.head.pdms@estrada.test", name: "Sari (Head PDMS)", title: "Head of PDMS", orgUnit: "PDMS", role: "division_owner", entities: ["ESTRADA"] },
  sales: { email: "e2e.sales@estrada.test", name: "Andi (BCD)", title: "Account Manager", orgUnit: "BCD", role: "requestor", entities: ["*"] },
  sales_head: { email: "e2e.head.bcd@estrada.test", name: "Yoga (Head BCD)", title: "Head of BCD", orgUnit: "BCD", role: "division_owner", entities: ["*"] },
  finance: { email: "e2e.finance@estrada.test", name: "Dewi (Finance)", title: "Business Finance", orgUnit: "FRM", role: "finance", entities: ["*"] },
  bfp: { email: "e2e.bfp@estrada.test", name: "Lina (BFP)", title: "Business Finance & Precalc", orgUnit: "FRM", role: "bfp", entities: ["*"] },
  cash_manager: { email: "e2e.cm@estrada.test", name: "Tari (Cash Management)", title: "Treasury & Cash Management", orgUnit: "FRM", role: "cash_manager", entities: ["*"] },
  director: { email: "e2e.direktur@estrada.test", name: "Direktur", title: "Direktur", orgUnit: "DIR", role: "director", entities: ["*"] },
} satisfies Record<string, { email: string; name: string; title: string; orgUnit: string; role: Role; entities: string[] }>;

export type E2eRole = keyof typeof E2E_USERS;
export const E2E_PASSWORD = "e2e-password-not-secret";
export const authFile = (role: E2eRole) => `e2e/.auth/${role}.json`;
