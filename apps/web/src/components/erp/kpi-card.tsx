import type { Money, Unit } from "@estrada/domain";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { MoneyCell } from "./money-cell";

/** One number, its label and a short note. */
export function KpiCard({ label, value, unit = "juta", note }: { label: string; value: Money; unit?: Unit; note?: string }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <MoneyCell value={value} unit={unit} className="text-xl font-semibold" />
        {note ? <p className="text-muted-foreground mt-1 text-xs">{note}</p> : null}
      </CardContent>
    </Card>
  );
}
