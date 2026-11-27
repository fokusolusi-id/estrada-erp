import { BAND_LABEL, HEALTH_INFO, formatAmount, type Band, type HealthKey, type Money, type Unit } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";

export const BAND_TONE: Record<Band, string> = { healthy: "bg-success text-white", watch: "bg-state-finance/80 text-black", critical: "bg-destructive text-white" };

export function BandBadge({ band }: { band: Band | null }) {
  return band ? <Badge className={`border-transparent ${BAND_TONE[band]}`}>{BAND_LABEL[band]}</Badge> : <Badge variant="outline">Belum ada data</Badge>;
}

export function healthFigure(key: HealthKey, v: Money, unit: Unit) {
  const kind = HEALTH_INFO[key].unit;
  const n = v.toString().replace(".", ",");
  return kind === "rupiah" ? formatAmount(v, unit) : kind === "percent" ? `${n}%` : kind === "months" ? `${n} bulan` : `${n}x`;
}
