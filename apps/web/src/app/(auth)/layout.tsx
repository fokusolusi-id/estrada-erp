import Image from "next/image";

const MODULES = [
  { name: "RKA", about: "Anggaran, persetujuan dan realisasi" },
  { name: "Pipeline", about: "Peluang penjualan dan termin" },
  { name: "Implementasi", about: "Proyek, serah terima dan garansi" },
  { name: "Pembayaran", about: "Permintaan sampai bukti bayar" },
  { name: "Arus Kas", about: "Proyeksi kas dan fasilitas pinjaman" },
  { name: "COA Master", about: "Daftar akun perusahaan" },
];

/** What the ERP covers today, as the sign-in page's one picture. */
function ModuleList() {
  return (
    <ul aria-label="Modul ERP" className="grid gap-4">
      {MODULES.map((m, i) => (
        <li key={m.name} className="relative flex items-start gap-4 text-sm">
          {/* From under this dot to the top of the next one, across the list's gap. */}
          {i < MODULES.length - 1 ? <span aria-hidden data-connector className="absolute top-[15.5px] -bottom-[20.5px] left-[5px] w-px bg-white/30" /> : null}
          <span aria-hidden className="bg-brand mt-[4.5px] size-[11px] shrink-0 rounded-full border-2 border-white/60" />
          <span className="grid">
            <span className="font-semibold text-white">{m.name}</span>
            <span className="text-white/70">{m.about}</span>
          </span>
        </li>
      ))}
    </ul>
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
          <p className="text-page text-balance">Satu ERP untuk seluruh Estrada Group.</p>
          <ModuleList />
        </div>
        <p className="text-sm text-white/60">Anggaran, penjualan, proyek dan keuangan dalam satu aplikasi.</p>
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
