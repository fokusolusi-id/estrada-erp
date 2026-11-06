import type { LucideIcon } from "lucide-react";

/** What a page shows when there is nothing to list: an icon, what that means, and what to do next. */
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="bg-muted text-muted-foreground mb-1 flex size-11 items-center justify-center rounded-full">
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="text-muted-foreground max-w-md text-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
