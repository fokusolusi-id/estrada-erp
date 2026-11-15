import Image from "next/image";
import { APPROVAL_STATES } from "@estrada/domain";
import { STATE_LABEL } from "@/components/erp/status-badge";

/** The RKA's route from draft to lock, drawn as the sign-in page's one picture: a line with a stop for each approval state. */
function ApprovalRoute() {
  return (
    <ol aria-label="Tahapan persetujuan RKA" className="relative grid gap-5">
      <span aria-hidden className="absolute top-2 bottom-2 left-[5px] w-px bg-white/25" />
      {APPROVAL_STATES.map((state, i) => {
        const last = i === APPROVAL_STATES.length - 1;
        return (
          <li key={state} className="relative flex items-center gap-4 text-sm">
            <span aria-hidden className={last ? "size-[11px] rounded-full bg-white" : "bg-brand size-[11px] rounded-full border-2 border-white/60"} />
            <span className={last ? "font-semibold text-white" : "text-white/75"}>{STATE_LABEL[state]}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="bg-brand hidden flex-col justify-between gap-12 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-white">
            <Image src="/logo.png" alt="" width={32} height={32} priority />
          </span>
          <div className="leading-tight">
            <div className="font-semibold">ERP Estrada</div>
            <div className="text-sm text-white/70">PT Elang Strategi Adidaya</div>
          </div>
        </div>
        <div className="grid max-w-sm gap-8">
          <p className="text-page text-balance">Dari draft sampai terkunci, setiap RKA punya jalurnya.</p>
          <ApprovalRoute />
        </div>
        <p className="text-sm text-white/60">Perencanaan anggaran, realisasi dan arus kas Estrada Group.</p>
      </aside>
      <div className="bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image src="/logo.png" alt="" width={40} height={40} priority />
            <div className="leading-tight">
              <div className="text-primary font-semibold">ERP Estrada</div>
              <div className="text-muted-foreground text-sm">PT Elang Strategi Adidaya</div>
            </div>
          </div>
          {/* The forms are cards; on this page they sit directly on the page instead. */}
          <div className="[&_[data-slot=card]]:border-0 [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:shadow-none [&_[data-slot=card-content]]:px-0 [&_[data-slot=card-header]]:px-0 [&_[data-slot=card]]:py-0">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
