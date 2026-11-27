/** Master Customer rules (M Customer, BR-MD-004). */

/** The number the sheet types for customers whose NPWP is not known yet; it may repeat. */
export const PLACEHOLDER_NPWP = "010611200093000";

export interface CustomerRecord {
  id: string;
  nickname: string;
  legalName: string;
  segment: string;
  npwp: string | null;
  email: string | null;
  picEmail: string | null;
}

/** Digits only: the sheets carry punctuation and hidden Unicode. */
export function cleanNpwp(value: string): string | null {
  return value.replace(/\D/g, "") || null;
}

export interface RejectedCustomer {
  id: string;
  npwp: string;
  takenBy: string;
}

/** No duplicate customer by NPWP: the first holder keeps it, a later one is reported and not loaded. */
export function splitDuplicateNpwp<T extends { id: string; npwp: string | null }>(
  incoming: readonly T[],
  existing: readonly { id: string; npwp: string | null }[] = [],
): { accepted: T[]; rejected: RejectedCustomer[] } {
  const holder = new Map<string, string>();
  for (const c of existing) if (c.npwp) holder.set(c.npwp, c.id);

  const accepted: T[] = [];
  const rejected: RejectedCustomer[] = [];
  for (const c of incoming) {
    if (c.npwp && c.npwp !== PLACEHOLDER_NPWP) {
      const takenBy = holder.get(c.npwp);
      if (takenBy && takenBy !== c.id) {
        rejected.push({ id: c.id, npwp: c.npwp, takenBy });
        continue;
      }
      holder.set(c.npwp, c.id);
    }
    accepted.push(c);
  }
  return { accepted, rejected };
}

export type CustomerIssueCode = "npwp_placeholder" | "npwp_missing" | "same_name" | "segment_suspect" | "email_invalid";

export interface CustomerIssue {
  id: string;
  code: CustomerIssueCode;
  message: string;
}

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
export const isEmail = (value: string) => EMAIL.test(value);
const GOVERNMENT = /^(kementerian|direktorat jenderal)\b/i;

/** What a data steward should check. Nothing is corrected here: the client owns the values. */
export function customerIssues(customers: readonly CustomerRecord[]): CustomerIssue[] {
  const byName = new Map<string, string[]>();
  for (const c of customers) {
    const key = c.legalName.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), c.id]);
  }

  return customers.flatMap((c) => {
    const found: CustomerIssue[] = [];
    const add = (code: CustomerIssueCode, message: string) => found.push({ id: c.id, code, message });

    if (!c.npwp) add("npwp_missing", "NPWP kosong");
    else if (c.npwp === PLACEHOLDER_NPWP) add("npwp_placeholder", "NPWP masih nomor sementara");
    const twins = byName.get(c.legalName.toLowerCase())!.filter((id) => id !== c.id);
    if (twins.length) add("same_name", `Nama sama dengan ${twins.join(", ")}`);
    if (c.segment.toLowerCase() === "telco" && GOVERNMENT.test(c.legalName)) add("segment_suspect", "Instansi pemerintah bersegmen Telco");
    for (const email of [c.email, c.picEmail]) {
      if (email && !isEmail(email)) add("email_invalid", `Email tidak valid: ${email}`);
    }
    return found;
  });
}

const nameKey = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * The master customer a typed name stands for (BR-SP-002): its nickname or legal name, ignoring case and spacing.
 * No customer, or more than one, is null: BCD picks it.
 */
export function matchCustomer(name: string, customers: readonly { id: string; nickname: string; legalName: string }[]): string | null {
  const key = nameKey(name);
  const found = customers.filter((c) => nameKey(c.nickname) === key || nameKey(c.legalName) === key);
  return key && found.length === 1 ? found[0]!.id : null;
}
