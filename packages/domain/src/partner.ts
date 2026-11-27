/** Master Mitra and Master Produk Mitra rules (BR-MD-005, BR-SCM-004). */
import { isEmail } from "./customer";

export const PARTNER_CATEGORIES = ["Distributor", "Principle"] as const;
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];

export interface PartnerRecord {
  id: string;
  npwp: string | null;
  email: string | null;
  picEmail: string | null;
}

export type PartnerIssueCode = "npwp_missing" | "same_npwp" | "email_invalid" | "email_shared";

export interface PartnerIssue {
  id: string;
  code: PartnerIssueCode;
  message: string;
}

/** Warnings for a data steward, on import and on save. Nothing is corrected here: the client owns the values. */
export function partnerIssues(partners: readonly PartnerRecord[]): PartnerIssue[] {
  return partners.flatMap((p) => {
    const found: PartnerIssue[] = [];
    const add = (code: PartnerIssueCode, message: string) => found.push({ id: p.id, code, message });
    const others = (same: (o: PartnerRecord) => boolean) => partners.filter((o) => o.id !== p.id && same(o)).map((o) => o.id);

    if (!p.npwp) add("npwp_missing", "NPWP kosong: wajib sebelum bertransaksi");
    const npwpTwins = p.npwp ? others((o) => o.npwp === p.npwp) : [];
    if (npwpTwins.length) add("same_npwp", `NPWP sama dengan ${npwpTwins.join(", ")}`);
    for (const email of [p.email, p.picEmail]) {
      if (email && !isEmail(email)) add("email_invalid", `Email tidak valid: ${email}`);
    }
    const key = p.email?.toLowerCase();
    const emailTwins = key && isEmail(key) ? others((o) => o.email?.toLowerCase() === key) : [];
    if (emailTwins.length) add("email_shared", `Email ${p.email} juga dipakai ${emailTwins.join(", ")}`);
    return found;
  });
}

/** The next ID in a master's numbering, e.g. Cust-013 after Cust-012. */
export function nextMasterId(prefix: string, used: readonly string[]): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const highest = Math.max(0, ...used.map((id) => Number(pattern.exec(id)?.[1] ?? 0)));
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

export const nextProductId = (used: readonly string[]) => nextMasterId("Produk", used);
