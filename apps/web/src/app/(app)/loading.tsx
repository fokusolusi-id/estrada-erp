/** Shown inside the app shell while the next page's data loads, so a click answers at once. */
export default function Loading() {
  const bar = "bg-muted animate-pulse rounded-md motion-reduce:animate-none";
  return (
    <div role="status" aria-busy="true" aria-label="Memuat halaman" className="grid gap-6">
      <div className="grid gap-2">
        <div className={`${bar} h-7 w-56`} />
        <div className={`${bar} h-4 w-96 max-w-full`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${bar} h-24`} />
        ))}
      </div>
      <div className="grid gap-2 rounded-lg border p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`${bar} h-9`} />
        ))}
      </div>
    </div>
  );
}
