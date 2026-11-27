import Link from "next/link";

/** Previous / next links under a long list; the page number travels in `?hal=`. Shows nothing when one page holds everything. */
export function Pager({
  page,
  pages,
  total,
  from,
  to,
  query = {},
}: {
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
  /** Other search parameters the page links must keep. */
  query?: Record<string, string>;
}) {
  if (pages <= 1) return null;
  const href = (hal: number) => `?${new URLSearchParams({ ...query, hal: String(hal) })}`;
  const link = "text-primary text-sm underline-offset-2 hover:underline";
  return (
    <nav aria-label="Halaman" className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">{`Baris ${from}–${to} dari ${total}`}</p>
      <div className="flex items-center gap-4">
        {page > 1 ? (
          <Link href={href(page - 1)} className={link}>
            Sebelumnya
          </Link>
        ) : null}
        <span className="text-sm">{`Halaman ${page} dari ${pages}`}</span>
        {page < pages ? (
          <Link href={href(page + 1)} className={link}>
            Berikutnya
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
