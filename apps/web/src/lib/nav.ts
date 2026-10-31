import type { Role } from "@estrada/domain";

export interface NavItem {
  href: string;
  label: string;
  roles: readonly Role[] | "all";
  phase?: number;
}

/** Navigation filtered by role. Items marked with a phase are placeholders until that phase ships. */
export const NAV: readonly NavItem[] = [
  { href: "/", label: "Beranda", roles: "all" },
  { href: "/rka", label: "RKA Saya", roles: ["requestor", "default_owner"] },
  { href: "/rka/queue", label: "Antrean Konsolidasi", roles: ["default_owner"] },
  { href: "/rka/division", label: "RKA Divisi", roles: ["division_owner"] },
  { href: "/rka/review", label: "Status Board Finance", roles: ["finance"] },
  { href: "/rka/lock", label: "Kunci RKA", roles: ["finance", "director"] },
  { href: "/summary", label: "Management Summary", roles: ["division_owner", "finance", "director", "auditor"] },
  { href: "/pipeline", label: "Pipeline", roles: ["finance", "director", "division_owner"], phase: 2 },
  { href: "/cash", label: "Arus Kas", roles: ["finance", "director"], phase: 3 },
  { href: "/admin/users", label: "Pengguna", roles: ["admin"] },
  { href: "/admin/positions", label: "Posisi & pjs", roles: ["admin"] },
  { href: "/admin/coa", label: "COA Master", roles: ["admin"], phase: 0 },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles === "all" || n.roles.includes(role));
}
