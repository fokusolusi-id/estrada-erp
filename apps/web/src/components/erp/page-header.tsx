/**
 * The top of every report page: title and a one-line summary on the left, the page's actions on the right,
 * and its filters in one bar underneath, so filters look and sit the same everywhere.
 */
export function PageHeader({
  title,
  description,
  actions,
  filters,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {filters ? <div className="bg-muted/40 flex flex-wrap items-end gap-3 rounded-lg border px-4 py-3">{filters}</div> : null}
    </div>
  );
}
