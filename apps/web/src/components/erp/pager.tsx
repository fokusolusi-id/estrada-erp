import Link from "next/link";

/** Previous / next links under a long list; the page number travels in `?hal=`. Shows nothing when one page holds everything. */
export function Pager({ page, pages, total, from, to }: { page: number; pages: number; total: number; from: number; to: number }) {
  if (pages <= 1) return null;
  const link = "text-primary text-sm underline-offset-2 hover:underline";
  return (
    <nav aria-label="Halaman" className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">{`Baris ${from}–${to} dari ${total}`}</p>
      <div className="flex items-center gap-4">
        {page > 1 ? (
          <Link href={`?hal=${page - 1}`} className={link}>
            Sebelumnya
          </Link>
        ) : null}
        <span className="text-sm">{`Halaman ${page} dari ${pages}`}</span>
        {page < pages ? (
          <Link href={`?hal=${page + 1}`} className={link}>
            Berikutnya
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
