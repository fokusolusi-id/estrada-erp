import Link from "next/link";
import { Plus, UserRound, UserRoundPlus, UserRoundX } from "lucide-react";
import { ROLE_LABEL, seatStatus, type ChartNode, type ChartSeat } from "@estrada/domain";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<ChartNode["type"], string> = { company: "Perusahaan", division: "Divisi", department: "Departemen", unit: "Unit" };

/** Who sits in a seat, in words: the account, the pjs, the name from the document, or Kosong. */
function who(seat: ChartSeat, nameOf: ReadonlyMap<string, string>): string {
  const status = seatStatus(seat);
  return status === "filled" ? (nameOf.get(seat.holder!) ?? "") : status === "acting" ? `pjs ${nameOf.get(seat.acting!) ?? ""}` : status === "named" ? seat.holderName! : "Kosong";
}

function Seat({ seat, nameOf }: { seat: ChartSeat; nameOf: ReadonlyMap<string, string> }) {
  const status = seatStatus(seat);
  return (
    <li>
      <Link
        href={`/admin/positions/${seat.id}`}
        data-testid={`seat-${seat.id}`}
        title={status === "named" ? "Nama dari dokumen struktur, belum punya akun. Klik untuk memilih akunnya." : undefined}
        className={cn(
          "hover:bg-accent grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-2 rounded-md px-2 py-1.5 text-left",
          status === "vacant" && "bg-warning/10",
        )}
      >
        {status === "vacant" ? (
          <UserRoundX aria-hidden className="text-warning mt-0.5 size-4" />
        ) : status === "named" ? (
          <UserRoundPlus aria-label="Belum punya akun" className="text-info mt-0.5 size-4" />
        ) : (
          <UserRound aria-hidden className="text-muted-foreground mt-0.5 size-4" />
        )}
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate text-sm font-medium">
            {who(seat, nameOf)}

          </span>
          <span className="text-muted-foreground truncate text-xs">
            {seat.title} · {ROLE_LABEL[seat.role]}
          </span>
        </span>
      </Link>
    </li>
  );
}

function UnitCard({ node, nameOf, className }: { node: ChartNode; nameOf: ReadonlyMap<string, string>; className?: string }) {
  return (
    <div data-testid={`unit-${node.code}`} className={cn("bg-card relative z-10 w-48 rounded-lg border shadow-xs", node.type === "company" && "border-primary/40", className)}>
      <div className={cn("flex items-start justify-between gap-2 rounded-t-lg border-b px-3 py-2", node.type === "company" ? "bg-primary/8" : node.type === "division" ? "bg-muted/60" : "")}>
        <div className="grid min-w-0">
          <span className="truncate text-sm font-semibold">{node.code}</span>
          <span className="text-muted-foreground truncate text-xs">
            {TYPE_LABEL[node.type]} · {node.name}
          </span>
        </div>
        {node.vacant ? (
          <span title="Posisi kosong di unit ini dan di bawahnya" className="bg-warning/20 text-foreground shrink-0 rounded-full px-1.5 text-xs font-medium">
            {node.vacant} kosong
          </span>
        ) : null}
      </div>
      <ul className="grid gap-0.5 p-1.5">
        {node.positions.map((s) => (
          <Seat key={s.id} seat={s} nameOf={nameOf} />
        ))}
        {sections(node).length ? (
          <li className="mt-1 border-t pt-1.5">
            <ul aria-label={`Bagian ${node.code}`} className="grid gap-0.5">
              {sections(node).map((sec) => (
                <li key={sec.code} data-testid={`unit-${sec.code}`}>
                  <Link
                    href={sec.positions[0] ? `/admin/positions/${sec.positions[0].id}` : `/admin/positions?tampilan=daftar&unit=${encodeURIComponent(sec.code)}#buat`}
                    className="hover:bg-accent grid grid-cols-[0.75rem_minmax(0,1fr)] items-baseline gap-1.5 rounded-md px-2 py-1 text-xs"
                  >
                    <span aria-hidden className="bg-muted-foreground/40 size-1.5 rounded-full" />
                    <span className="min-w-0">
                      <span className="block truncate">{sec.name}</span>
                      {sec.positions.length ? (
                        <span className={cn("block truncate", sec.positions.some((p) => seatStatus(p) === "vacant") ? "text-warning" : "text-muted-foreground")}>
                          {sec.positions.map((p) => who(p, nameOf)).join(", ")}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ) : null}
        <li>
          <Link
            href={`/admin/positions?tampilan=daftar&unit=${encodeURIComponent(node.code)}#buat`}
            className="text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1 text-xs"
          >
            <Plus aria-hidden className="size-3.5" />
            Tambah posisi
          </Link>
        </li>
      </ul>
    </div>
  );
}

/** Sections (unit type "unit") sit inside their parent's card, as the org chart document draws them. */
const sections = (n: ChartNode) => n.children.filter((c) => c.type === "unit");
const subUnits = (n: ChartNode) => n.children.filter((c) => c.type !== "unit");
/** Under the top: divisions form the row; anything else (a department such as SGV) is a staff unit on the trunk. */
const lines = (n: ChartNode) => subUnits(n).filter((c) => c.type === "division" || n.type !== "company");
const staff = (n: ChartNode) => (n.type === "company" ? subUnits(n).filter((c) => c.type !== "division") : []);

/** Departments and units below a division, stacked on a rail so the chart stays as wide as the divisions. */
function Stack({ nodes, nameOf }: { nodes: ChartNode[]; nameOf: ReadonlyMap<string, string> }) {
  if (!nodes.length) return null;
  return (
    <ul className="ml-4 grid gap-3 border-l pt-3 pl-4">
      {nodes.map((n) => (
        <li key={n.code} className="relative before:absolute before:top-5 before:-left-4 before:w-4 before:border-t before:border-border">
          <UnitCard node={n} nameOf={nameOf} className="w-44" />
          <Stack nodes={subUnits(n)} nameOf={nameOf} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Struktur Organisasi: the company on top, its divisions in a row, departments stacked under each division.
 * Every position links to its page, where Admin assigns the holder or a pjs; each unit can take a new position.
 */
export function OrgChart({ roots, nameOf }: { roots: ChartNode[]; nameOf: ReadonlyMap<string, string> }) {
  if (!roots.length) return <p className="text-muted-foreground py-6 text-center text-sm">Belum ada unit. Tambahkan di Unit & Entitas.</p>;
  return (
    <div className="overflow-x-auto pb-2" data-testid="org-chart">
      <div className="grid w-max min-w-full justify-items-center gap-0">
        {roots.map((root) => (
          <div key={root.code} className="grid justify-items-center">
            <UnitCard node={root} nameOf={nameOf} className="w-60" />
            {staff(root).length ? (
              // Staff units report to the top directly: on the trunk, before the divisions, as the document draws them.
              <div data-testid="org-staff" className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <span />
                <span aria-hidden className="border-l" />
                <ul className="grid justify-items-start gap-3 py-3">
                  {staff(root).map((n) => (
                    <li key={n.code} className="before:border-border relative pl-6 before:absolute before:top-5 before:left-0 before:w-6 before:border-t">
                      <UnitCard node={n} nameOf={nameOf} />
                      <Stack nodes={subUnits(n)} nameOf={nameOf} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {lines(root).length ? (
              <>
                <span aria-hidden className="h-6 border-l" />
                <ul className="flex items-start">
                  {lines(root).map((d) => (
                    <li
                      key={d.code}
                      className="relative px-2 pt-6 before:absolute before:inset-x-0 before:top-0 before:border-t before:border-border after:absolute after:top-0 after:left-1/2 after:h-6 after:border-l after:border-border first:before:left-1/2 last:before:right-1/2 only:before:hidden"
                    >
                      <UnitCard node={d} nameOf={nameOf} />
                      <Stack nodes={subUnits(d)} nameOf={nameOf} />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
