"use client";

import { Input } from "@/components/ui/input";

/** Today in Jakarta, as a date input takes it. */
export const todayInput = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

/** Reason and effective date, asked of every change that needs approval. Controlled when `value` is given. */
export function ChangeFields({ value, onChange }: { value?: { reason: string; effectiveOn: string }; onChange?: (v: { reason: string; effectiveOn: string }) => void }) {
  const field = (name: "reason" | "effectiveOn") =>
    value && onChange ? { value: value[name], onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [name]: e.target.value }) } : { defaultValue: name === "effectiveOn" ? todayInput() : "" };
  return (
    <>
      <label className="grid min-w-56 flex-1 gap-1 text-sm">
        <span className="text-muted-foreground text-xs">Alasan perubahan</span>
        <Input aria-label="Alasan perubahan" name="reason" required {...field("reason")} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted-foreground text-xs">Tanggal berlaku</span>
        <Input aria-label="Tanggal berlaku" name="effectiveOn" type="date" required suppressHydrationWarning {...field("effectiveOn")} />
      </label>
    </>
  );
}
