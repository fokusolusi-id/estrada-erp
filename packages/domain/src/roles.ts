export const ROLES = [
  "requestor",
  "default_owner",
  "division_owner",
  "finance",
  "director",
  "auditor",
  "admin",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  requestor: "Requestor",
  default_owner: "Default Owner",
  division_owner: "Division Owner",
  finance: "Finance Reviewer",
  director: "Direktur",
  auditor: "Auditor",
  admin: "Admin",
};
