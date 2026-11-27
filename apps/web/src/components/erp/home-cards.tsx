import type { Unit } from "@estrada/domain";
import type { loadHome } from "@/lib/home";
import { CashCard, HeadcountCard, ObligoCard, PipelineCard, ProjectsCard, SpendingCard } from "./home-widgets";

/** The role's cards in the plan's order; `link` gives a detail address only for screens in the role's menu. */
export function HomeCards({ data, unit, link }: { data: NonNullable<Awaited<ReturnType<typeof loadHome>>>; unit: Unit; link: (href: string) => string | undefined }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 2xl:grid-cols-2">
      {data.widgets.map((w) => {
        switch (w) {
          case "rka":
            return <SpendingCard key={w} title="RKA per divisi" description={`Anggaran biaya terhadap pembayaran · ${data.budgetNote}`} rows={data.spending?.divisions ?? []} unit={unit} href={link("/summary")} />;
          case "costCenter":
            return <SpendingCard key={w} title="Cost center" description={`Per unit pemilik · ${data.budgetNote}`} rows={data.spending?.units ?? []} unit={unit} runRate />;
          case "cashflow":
            return data.cash ? <CashCard key={w} description={data.cash.note} cash={data.cash.flow} unit={unit} href={link("/cash")} /> : null;
          case "obligo":
            return data.cash ? <ObligoCard key={w} obligo={data.cash.obligo} unit={unit} href={link("/cash")} /> : null;
          case "pipeline":
            return data.pipeline ? <PipelineCard key={w} year={data.pipeline.year} rows={data.pipeline.rows} unit={unit} href={link("/pipeline")} /> : null;
          case "headcount":
            return <HeadcountCard key={w} rows={data.headcount ?? []} />;
          case "projects":
            return <ProjectsCard key={w} rows={data.projects ?? []} unit={unit} href={link("/implementasi")} />;
        }
      })}
    </div>
  );
}
