/** Company master review list (sheet M Perusahaan). Nothing is corrected: the client owns the values. */
export function companyIssues(companies: readonly { code: string; npwp: string | null; nib: string | null }[]): { code: string; message: string }[] {
  return companies.flatMap((c) => {
    const found: { code: string; message: string }[] = [];
    if (c.npwp && /^0+$/.test(c.npwp.replace(/\D/g, ""))) found.push({ code: c.code, message: "NPWP masih nomor sementara" });
    const twins = c.nib ? companies.filter((o) => o.code !== c.code && o.nib === c.nib).map((o) => o.code) : [];
    if (twins.length) found.push({ code: c.code, message: `NIB sama dengan ${twins.join(", ")}` });
    return found;
  });
}
