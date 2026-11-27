/** CSV a spreadsheet opens safely: every field quoted, and text that would run as a formula is prefixed with an apostrophe. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const field = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  return `\ufeff${rows.map((r) => r.map(field).join(",")).join("\r\n")}\r\n`;
}
