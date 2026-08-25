export function Wordmark({ eyebrow }: { eyebrow?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="h-3 w-3 shrink-0 bg-accent" aria-hidden />
      <span className="text-[18px] font-extrabold tracking-[-0.02em]">LAPSE</span>
      {eyebrow && (
        <span className="ml-1 border-l border-[var(--divider)] pl-2.5 text-[11px] uppercase tracking-[0.1em] text-neutral-600">
          {eyebrow}
        </span>
      )}
    </span>
  );
}
