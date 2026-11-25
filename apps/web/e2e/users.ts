import type { Role } from "@estrada/domain";

/** Test-only accounts, created fresh in the throwaway estrada_e2e database on every run. */
export const E2E_USERS = {
  requestor: { email: "e2e.requestor@estrada.test", name: "Rina (SCM)", title: "Staff SCM", orgUnit: "SCM", role: "requestor", entities: ["ESTRADA"] },
  default_owner: { email: "e2e.head.scm@estrada.test", name: "Bayu (Head SCM)", title: "Head of SCM", orgUnit: "SCM", role: "default_owner", entities: ["ESTRADA"] },
  division_owner: { email: "e2e.head.pdms@estrada.test", name: "Sari (Head PDMS)", title: "Head of PDMS", orgUnit: "PDMS", role: "division_owner", entities: ["ESTRADA"] },
  sales: { email: "e2e.sales@estrada.test", name: "Andi (BCD)", title: "Account Manager", orgUnit: "BCD", role: "requestor", entities: ["*"] },
  sales_head: { email: "e2e.head.bcd@estrada.test", name: "Yoga (Head BCD)", title: "Head of BCD", orgUnit: "BCD", role: "division_owner", entities: ["*"] },
  // A BCD person whose entities do not include ESTRADA, for the Pipeline's entity scope.
  sales_matrik: { email: "e2e.sales.matrik@estrada.test", name: "Mira (BCD Matrik)", title: "Account Manager Matrik", orgUnit: "BCD", role: "requestor", entities: ["MATRIK"] },
  finance: { email: "e2e.finance@estrada.test", name: "Dewi (Finance)", title: "Business Finance", orgUnit: "FRM", role: "finance", entities: ["*"] },
  bfp: { email: "e2e.bfp@estrada.test", name: "Lina (BFP)", title: "Business Finance & Precalc", orgUnit: "FRM", role: "bfp", entities: ["*"] },
  cash_manager: { email: "e2e.cm@estrada.test", name: "Tari (Cash Management)", title: "Treasury & Cash Management", orgUnit: "FRM", role: "cash_manager", entities: ["*"] },
  // Implementasi: the Head PMO and the PMO, MSO and ISO people the delivery journey needs.
  head_pmo: { email: "e2e.head.pmo@estrada.test", name: "Hadi (Head PMO)", title: "Head of PMO", orgUnit: "PMO", role: "default_owner", entities: ["ESTRADA"] },
  pm: { email: "e2e.pm@estrada.test", name: "Pandu (Project Manager)", title: "Project Manager", orgUnit: "PMO-PM", role: "requestor", entities: ["ESTRADA"] },
  delivery_control: { email: "e2e.dc@estrada.test", name: "Dika (Delivery Control)", title: "Staff Delivery Control", orgUnit: "PMO-DCA", role: "requestor", entities: ["ESTRADA"] },
  project_admin: { email: "e2e.pa@estrada.test", name: "Puri (Project Admin)", title: "Staff Project Admin", orgUnit: "PMO-DCA", role: "requestor", entities: ["ESTRADA"] },
  head_mso: { email: "e2e.head.mso@estrada.test", name: "Maya (Head MSO)", title: "Head of MSO", orgUnit: "MSO", role: "default_owner", entities: ["ESTRADA"] },
  eos: { email: "e2e.eos@estrada.test", name: "Eko (Operational EOS)", title: "Staff Operational EOS", orgUnit: "MSO-EOS", role: "requestor", entities: ["ESTRADA"] },
  head_iso: { email: "e2e.head.iso@estrada.test", name: "Indra (Head ISO)", title: "Head of ISO", orgUnit: "ISO", role: "default_owner", entities: ["ESTRADA"] },
  admin: { email: "e2e.admin@estrada.test", name: "Admin Uji", title: "Admin", orgUnit: "DIR", role: "admin", entities: ["*"] },
  director: { email: "e2e.direktur@estrada.test", name: "Direktur", title: "Direktur", orgUnit: "DIR", role: "director", entities: ["*"] },
} satisfies Record<string, { email: string; name: string; title: string; orgUnit: string; role: Role; entities: string[] }>;

export type E2eRole = keyof typeof E2E_USERS;
export const E2E_PASSWORD = "e2e-password-not-secret";
export const authFile = (role: E2eRole) => `e2e/.auth/${role}.json`;
