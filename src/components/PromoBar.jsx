export default function PromoBar() {
  return (
    <div className="bg-ink text-paper">
      <p className="mx-auto flex max-w-[1600px] items-center justify-center gap-2 px-4 py-2 text-center text-[11px] font-medium tracking-[0.18em] uppercase sm:text-xs">
        Free shipping over $75
        <span aria-hidden="true" className="text-signal">
          /
        </span>
        <span className="hidden sm:inline">60-day wear test on every pair</span>
        <span className="sm:hidden">60-day returns</span>
      </p>
    </div>
  );
}
