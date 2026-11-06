export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="mx-auto mb-2 size-14" />
          <div className="text-primary text-xl font-semibold">ERP Estrada</div>
          <div className="text-muted-foreground text-sm">PT Elang Strategi Adidaya</div>
        </div>
        {children}
      </div>
    </main>
  );
}
