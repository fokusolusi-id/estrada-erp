/** Ticked entities from the multi-select; "*" alone means all. */
export function entityList(form: FormData): string[] {
  const all = form.getAll("entities").map(String).filter(Boolean);
  return all.includes("*") ? ["*"] : [...new Set(all)];
}
