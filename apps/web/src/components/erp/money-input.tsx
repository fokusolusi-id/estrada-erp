import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** An amount field: "Rp" inside on the left, the number right-aligned in tabular figures. */
export function MoneyInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span aria-hidden className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm">
        Rp
      </span>
      <Input inputMode="decimal" className={cn("tabular pl-9 text-right", className)} {...props} />
    </div>
  );
}
