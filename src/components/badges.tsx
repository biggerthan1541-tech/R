import type { ExceptionStatus, RiskLevel } from "@/lib/enums";
import { STATUS_LABELS } from "@/lib/status";
import { RISK_LEVEL_LABELS } from "@/lib/labels";

type StatusStyle = {
  glyph: string;
  label: string;
  chip: string;
  /** Left rule colour for the register row and callout bands. */
  edge: string;
  text: string;
};

export const STATUS_STYLES: Record<ExceptionStatus, StatusStyle> = {
  expired: {
    glyph: "■",
    label: "Expired · open",
    chip: "bg-accent text-bg",
    edge: "var(--color-accent)",
    text: "var(--color-accent-700)",
  },
  expiring: {
    glyph: "▲",
    label: "Expiring",
    chip: "bg-warn-bg text-warn",
    edge: "var(--color-warn-edge)",
    text: "var(--color-warn)",
  },
  open: {
    glyph: "●",
    label: "Open",
    chip: "bg-neutral-200 text-neutral-800",
    edge: "var(--color-neutral-400)",
    text: "var(--color-neutral-800)",
  },
  renewed: {
    glyph: "↻",
    label: "Renewed",
    chip: "bg-accent-200 text-accent-800",
    edge: "var(--color-accent-400)",
    text: "var(--color-accent-800)",
  },
  closed: {
    glyph: "✓",
    label: "Closed",
    chip: "bg-good-bg text-good",
    edge: "transparent",
    text: "var(--color-good)",
  },
};

export function StatusChip({
  status,
  full = false,
}: {
  status: ExceptionStatus;
  full?: boolean;
}) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`chip ${s.chip}`}>
      <span aria-hidden>{s.glyph}</span>
      {full ? s.label : STATUS_LABELS[status]}
    </span>
  );
}

const RISK_COLORS: Record<RiskLevel, string> = {
  critical: "text-accent-700",
  high: "text-accent-700",
  medium: "text-neutral-800",
  low: "text-neutral-600",
};

export function RiskLabel({ level }: { level: RiskLevel }) {
  return (
    <span className={`text-[11px] font-extrabold uppercase tracking-[0.06em] ${RISK_COLORS[level]}`}>
      {RISK_LEVEL_LABELS[level]}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="tag">{children}</span>;
}
