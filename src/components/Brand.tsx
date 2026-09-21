export const MeridianMark = ({ size = 32, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
    <rect width="32" height="32" rx="8" className="fill-brand-950" />
    <path
      d="M8 23V9.6c0-.5.63-.72.94-.33L16 18.2l7.06-8.93c.31-.39.94-.17.94.33V23"
      className="stroke-brand-400" strokeWidth="2.6" strokeLinecap="round"
    />
    <circle cx="16" cy="24.2" r="2.2" className="fill-accent-500" />
  </svg>
);

export const MeridianWordmark = ({
  size = 30, className, tone = 'shell',
}: { size?: number; className?: string; tone?: 'shell' | 'ink' }) => (
  <span className={`flex items-center gap-2.5 ${className ?? ''}`}>
    <MeridianMark size={size} />
    <span className="leading-none">
      <span className={`block text-[0.95rem] font-semibold tracking-[0.16em] ${tone === 'shell' ? 'text-shell-ink' : 'text-ink'}`}>
        MERIDIAN
      </span>
      <span className={`mt-0.5 block text-[0.5rem] font-medium uppercase tracking-[0.3em] ${tone === 'shell' ? 'text-shell-muted' : 'text-faint'}`}>
        Human Capital
      </span>
    </span>
  </span>
);
