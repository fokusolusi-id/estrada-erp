"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Charts read plain numbers already scaled to the viewer's unit: they only draw, the rupiah are computed as
 * Decimal on the server. Colours come from the theme, so light and dark mode follow on their own.
 */

const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />;

export function figureFormatter(decimals: number) {
  const f = new Intl.NumberFormat("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (v: number) => (v < 0 ? `(${f.format(-v)})` : f.format(v));
}

/** Legend labels read in the text colour; the series colour stays on the marker, which only needs 3:1. */
export const legendText = (label: string) => <span className="text-foreground">{label}</span>;

export const TOOLTIP_ITEM = { color: "var(--popover-foreground)" } as const;

export function tooltipEntry(decimals: number, unitLabel: string) {
  const fmt = figureFormatter(decimals);
  return (v: unknown, name: unknown): [string, string] => [`${fmt(Number(v))} ${unitLabel}`, String(name)];
}

function ChartTooltip({ decimals, unitLabel }: { decimals: number; unitLabel: string }) {
  return (
    <Tooltip
      itemStyle={TOOLTIP_ITEM}
      cursor={{ fill: "var(--muted)", opacity: 0.5 }}
      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" }}
      labelStyle={{ fontWeight: 600, marginBottom: 4 }}
      formatter={tooltipEntry(decimals, unitLabel)}
    />
  );
}

/** Monthly revenue against total cost, with profit before tax as a line. */
export function PnlChart({ data, decimals, unitLabel }: { data: { month: string; revenue: number; cost: number; profit: number }[]; decimals: number; unitLabel: string }) {
  const fmt = figureFormatter(0);
  return (
    <div className="h-72 w-full" role="img" aria-label="Grafik pendapatan, biaya dan laba per bulan">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          {GRID}
          <XAxis dataKey="month" {...AXIS} />
          <YAxis {...AXIS} width={64} tickFormatter={(v) => fmt(Number(v))} />
          <ChartTooltip decimals={decimals} unitLabel={unitLabel} />
          <Legend formatter={legendText} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar dataKey="revenue" name="Pendapatan" fill="var(--cat-revenue)" radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey="cost" name="Total Biaya" fill="var(--cat-cogs)" radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Line dataKey="profit" name="Laba Sebelum Pajak" stroke="var(--primary)" strokeWidth={2} dot={{ r: 2.5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Groups ranked by a value, green above zero and red below (Kontribusi Divisi). */
export function RankedBars({ data, decimals, unitLabel, label }: { data: { name: string; value: number }[]; decimals: number; unitLabel: string; label: string }) {
  const fmt = figureFormatter(0);
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <div className="w-full" style={{ height: Math.max(120, sorted.length * 34 + 24) }} role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" {...AXIS} tickFormatter={(v) => fmt(Number(v))} />
          <YAxis type="category" dataKey="name" {...AXIS} width={72} />
          <ChartTooltip decimals={decimals} unitLabel={unitLabel} />
          <ReferenceLine x={0} stroke="var(--border)" />
          <Bar dataKey="value" name={label} radius={3} maxBarSize={18}>
            {sorted.map((d) => (
              <Cell key={d.name} fill={d.value < 0 ? "var(--destructive)" : "var(--cat-revenue)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Closing cash by month against the minimum: the band below the minimum is the funding gap. */
export function CashBalanceChart({ data, minimum, decimals, unitLabel }: { data: { month: string; closing: number }[]; minimum: number; decimals: number; unitLabel: string }) {
  const fmt = figureFormatter(0);
  const low = Math.min(0, minimum, ...data.map((d) => d.closing));
  return (
    <div className="h-64 w-full" role="img" aria-label="Grafik saldo kas akhir terhadap kas minimum">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          {GRID}
          <XAxis dataKey="month" {...AXIS} />
          <YAxis {...AXIS} width={64} tickFormatter={(v) => fmt(Number(v))} domain={[low < 0 ? "auto" : 0, "auto"]} />
          <ChartTooltip decimals={decimals} unitLabel={unitLabel} />
          <ReferenceArea y1={low} y2={minimum} fill="var(--destructive)" fillOpacity={0.07} ifOverflow="extendDomain" />
          <ReferenceLine y={minimum} stroke="var(--destructive)" strokeDasharray="4 4" label={{ value: "Kas minimum", position: "insideTopLeft", fontSize: 11, fill: "var(--destructive)" }} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Line dataKey="closing" name="Saldo kas akhir" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The year's cash bridge: each bar floats from where the last one ended; totals stand on zero. */
export function WaterfallChart({ steps, decimals, unitLabel }: { steps: { label: string; start: number; end: number; total?: boolean }[]; decimals: number; unitLabel: string }) {
  const fmt = figureFormatter(0);
  const full = figureFormatter(decimals);
  const data = steps.map((s) => ({ ...s, range: [Math.min(s.start, s.end), Math.max(s.start, s.end)] as [number, number], change: s.end - s.start }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Grafik jembatan arus kas setahun">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          {GRID}
          <XAxis dataKey="label" {...AXIS} interval={0} fontSize={10} />
          <YAxis {...AXIS} width={64} tickFormatter={(v) => fmt(Number(v))} />
          <Tooltip
            itemStyle={TOOLTIP_ITEM}
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            formatter={(_, __, item) => [`${full((item.payload as { total?: boolean; end: number; change: number }).total ? (item.payload as { end: number }).end : (item.payload as { change: number }).change)} ${unitLabel}`]}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar dataKey="range" radius={3} maxBarSize={36}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.total ? "var(--primary)" : d.change < 0 ? "var(--destructive)" : "var(--cat-revenue)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A small trend line for a number card. */
export function Sparkline({ values, tone = "var(--primary)", className = "h-8 w-24" }: { values: number[]; tone?: string; className?: string }) {
  return (
    <div className={className} aria-hidden>
      <ResponsiveContainer>
        <LineChart data={values.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line dataKey="v" stroke={tone} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Cash in, out, ending balance and EBITDA by month, as recorded (plan D3; W-11, W-12). */
export function TrendChart({ data, series, label, decimals, unitLabel }: { data: Record<string, string | number>[]; series: { key: string; name: string; tone: string; bar?: boolean }[]; label: string; decimals: number; unitLabel: string }) {
  const fmt = figureFormatter(0);
  return (
    <div className="h-64 w-full" role="img" aria-label={label}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          {GRID}
          <XAxis dataKey="month" {...AXIS} />
          <YAxis {...AXIS} width={64} tickFormatter={(v) => fmt(Number(v))} />
          <ChartTooltip decimals={decimals} unitLabel={unitLabel} />
          <Legend formatter={legendText} />
          <ReferenceLine y={0} stroke="var(--border)" />
          {series.map((s) => (s.bar ? <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.tone} /> : <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.tone} strokeWidth={2} dot={{ r: 2 }} />))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
