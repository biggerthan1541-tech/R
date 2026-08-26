import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cx } from './ui';

/**
 * Chart primitives.
 *
 * Series colors come from `--chart-1…6`, a fixed categorical order validated
 * for colorblind separation against both the light and dark chart surfaces.
 * Colors are never cycled: a seventh series folds into "Other".
 */

export const SERIES_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'] as const;
export const seriesColor = (i: number): string => `var(${SERIES_VARS[Math.min(i, SERIES_VARS.length - 1)]})`;
export const STATUS_COLORS = { good: 'var(--chart-good)', warn: 'var(--chart-warn)', bad: 'var(--chart-bad)' };

const GRID = 'rgb(var(--chart-grid))';
const AXIS = 'rgb(var(--chart-axis))';

/* ------------------------------------------------------------- measuring */

const useMeasure = <T extends HTMLElement>(): [React.RefObject<T>, number] => {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && Math.abs(w - width) > 1) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || 560);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, width];
};

/* ---------------------------------------------------------------- legend */

export const ChartLegend = ({
  items, className,
}: { items: { label: string; color: string; value?: string }[]; className?: string }) => (
  <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
    {items.map((it) => (
      <li key={it.label} className="flex items-center gap-1.5 text-xs text-muted">
        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: it.color }} />
        <span className="text-ink">{it.label}</span>
        {it.value ? <span className="tnum text-faint">{it.value}</span> : null}
      </li>
    ))}
  </ul>
);

/* --------------------------------------------------------------- tooltip */

interface TipState { x: number; y: number; title: string; rows: { label: string; value: string; color?: string }[] }

const Tooltip = ({ tip, width }: { tip: TipState | null; width: number }) => {
  if (!tip) return null;
  const flip = tip.x > width - 150;
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[9rem] rounded-lg border border-line bg-raised px-2.5 py-2 shadow-pop"
      style={{ left: flip ? undefined : tip.x + 12, right: flip ? width - tip.x + 12 : undefined, top: Math.max(4, tip.y - 12) }}
    >
      <p className="text-2xs font-semibold uppercase tracking-wider text-faint">{tip.title}</p>
      <ul className="mt-1 space-y-0.5">
        {tip.rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              {r.color ? <span className="h-2 w-2 rounded-[2px]" style={{ background: r.color }} /> : null}
              {r.label}
            </span>
            <span className="tnum font-medium text-ink">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ------------------------------------------------------------- bar chart */

export interface BarSeries { key: string; label: string; values: number[] }

export const BarChart = ({
  categories, series, height = 220, stacked, format = (n) => String(Math.round(n)),
  yTicks = 4, className, labelEvery,
}: {
  categories: string[];
  series: BarSeries[];
  height?: number;
  stacked?: boolean;
  format?: (n: number) => string;
  yTicks?: number;
  className?: string;
  labelEvery?: number;
}) => {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TipState | null>(null);
  const pad = { top: 12, right: 8, bottom: 30, left: 48 };
  const plotW = Math.max(40, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;

  const max = useMemo(() => {
    const totals = categories.map((_, i) =>
      stacked ? series.reduce((s, sr) => s + (sr.values[i] ?? 0), 0) : Math.max(...series.map((sr) => sr.values[i] ?? 0)));
    return Math.max(1, ...totals);
  }, [categories, series, stacked]);

  const niceMax = useMemo(() => {
    const raw = max * 1.08;
    const mag = 10 ** Math.floor(Math.log10(raw));
    return Math.ceil(raw / mag) * mag;
  }, [max]);

  const bandW = plotW / Math.max(1, categories.length);
  const groupGap = Math.min(14, bandW * 0.28);
  const innerW = bandW - groupGap;
  const barW = stacked ? innerW : Math.max(3, (innerW - (series.length - 1) * 2) / series.length);
  const step = labelEvery ?? Math.ceil(categories.length / Math.max(3, Math.floor(plotW / 62)));

  return (
    <div className={cx('relative', className)} ref={ref}>
      <svg width="100%" height={height} role="img" aria-label="Bar chart" onMouseLeave={() => setTip(null)}>
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const v = (niceMax / yTicks) * i;
          const y = pad.top + plotH - (v / niceMax) * plotH;
          return (
            <g key={i}>
              <line x1={pad.left} x2={pad.left + plotW} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
              <text x={pad.left - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill={AXIS}>{format(v)}</text>
            </g>
          );
        })}

        {categories.map((cat, ci) => {
          const x0 = pad.left + ci * bandW + groupGap / 2;
          let stackAcc = 0;
          return (
            <g key={cat}>
              {series.map((sr, si) => {
                const v = sr.values[ci] ?? 0;
                const h = Math.max(0, (v / niceMax) * plotH);
                const x = stacked ? x0 : x0 + si * (barW + 2);
                const y = stacked ? pad.top + plotH - stackAcc - h : pad.top + plotH - h;
                if (stacked) stackAcc += h + (h > 0 ? 2 : 0);
                if (h <= 0) return null;
                return (
                  <rect
                    key={sr.key}
                    x={x} y={y} width={barW} height={Math.max(1, h - (stacked ? 2 : 0))}
                    rx={Math.min(4, barW / 2)}
                    fill={seriesColor(si)}
                    onMouseMove={(e) => {
                      const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                      setTip({
                        x: e.clientX - r.left, y: e.clientY - r.top, title: cat,
                        rows: series.map((s2, i2) => ({ label: s2.label, value: format(s2.values[ci] ?? 0), color: seriesColor(i2) })),
                      });
                    }}
                  />
                );
              })}
              {ci % step === 0 ? (
                <text x={x0 + innerW / 2} y={height - 10} textAnchor="middle" fontSize={10} fill={AXIS}>{cat}</text>
              ) : null}
            </g>
          );
        })}
        <line x1={pad.left} x2={pad.left + plotW} y1={pad.top + plotH} y2={pad.top + plotH} stroke={GRID} strokeWidth={1} />
      </svg>
      <Tooltip tip={tip} width={width} />
      {series.length > 1 ? (
        <ChartLegend className="mt-2 pl-10" items={series.map((s, i) => ({ label: s.label, color: seriesColor(i) }))} />
      ) : null}
    </div>
  );
};

/* ------------------------------------------------------------ line chart */

export const LineChart = ({
  categories, series, height = 220, area, format = (n) => String(Math.round(n)),
  yTicks = 4, className, labelEvery,
}: {
  categories: string[];
  series: BarSeries[];
  height?: number;
  area?: boolean;
  format?: (n: number) => string;
  yTicks?: number;
  className?: string;
  labelEvery?: number;
}) => {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const pad = { top: 12, right: 12, bottom: 28, left: 50 };
  const plotW = Math.max(40, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;

  const all = series.flatMap((s) => s.values);
  const rawMax = Math.max(1, ...all);
  const rawMin = Math.min(0, ...all);
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, rawMax)));
  const niceMax = Math.ceil((rawMax * 1.08) / mag) * mag;
  const niceMin = rawMin < 0 ? -Math.ceil((Math.abs(rawMin) * 1.1) / mag) * mag : 0;
  const span = niceMax - niceMin || 1;

  const xAt = (i: number) => pad.left + (categories.length === 1 ? plotW / 2 : (i / (categories.length - 1)) * plotW);
  const yAt = (v: number) => pad.top + plotH - ((v - niceMin) / span) * plotH;
  const step = labelEvery ?? Math.ceil(categories.length / Math.max(3, Math.floor(plotW / 66)));

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const idx = Math.round(((x - pad.left) / plotW) * (categories.length - 1));
    const clamped = Math.max(0, Math.min(categories.length - 1, idx));
    setHover(clamped);
    setTip({
      x, y: e.clientY - r.top, title: categories[clamped],
      rows: series.map((s, i) => ({ label: s.label, value: format(s.values[clamped] ?? 0), color: seriesColor(i) })),
    });
  }, [categories, plotW, pad.left, series, format]);

  return (
    <div className={cx('relative', className)} ref={ref}>
      <svg
        width="100%" height={height} role="img" aria-label="Line chart"
        onMouseMove={onMove} onMouseLeave={() => { setHover(null); setTip(null); }}
      >
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const v = niceMin + (span / yTicks) * i;
          const y = yAt(v);
          return (
            <g key={i}>
              <line x1={pad.left} x2={pad.left + plotW} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
              <text x={pad.left - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill={AXIS}>{format(v)}</text>
            </g>
          );
        })}

        {categories.map((c, i) => (i % step === 0 ? (
          <text key={c + i} x={xAt(i)} y={height - 8} textAnchor="middle" fontSize={10} fill={AXIS}>{c}</text>
        ) : null))}

        {hover !== null ? (
          <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={pad.top + plotH} stroke={AXIS} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
        ) : null}

        {series.map((s, si) => {
          const pts = s.values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
          const color = seriesColor(si);
          return (
            <g key={s.key}>
              {area ? (
                <polygon
                  points={`${pad.left},${pad.top + plotH} ${pts} ${pad.left + plotW},${pad.top + plotH}`}
                  fill={color} opacity={0.10}
                />
              ) : null}
              <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {hover !== null ? (
                <circle cx={xAt(hover)} cy={yAt(s.values[hover] ?? 0)} r={4.5} fill={color} stroke="rgb(var(--c-surface))" strokeWidth={2} />
              ) : null}
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} width={width} />
      {series.length > 1 ? (
        <ChartLegend className="mt-2 pl-12" items={series.map((s, i) => ({ label: s.label, color: seriesColor(i) }))} />
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------- donut chart */

export const DonutChart = ({
  data, size = 168, thickness = 22, centerLabel, centerValue, className, format = (n) => String(n),
}: {
  data: { label: string; value: number }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
  format?: (n: number) => string;
}) => {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className={cx('flex flex-wrap items-center gap-5', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label="Donut chart" className="-rotate-90">
          <circle cx={c} cy={c} r={r} fill="none" stroke={GRID} strokeWidth={thickness} />
          {data.map((d, i) => {
            const frac = d.value / total;
            const len = Math.max(0, frac * circumference - 2);
            const el = (
              <circle
                key={d.label}
                cx={c} cy={c} r={r} fill="none"
                stroke={seriesColor(i)}
                strokeWidth={active === i ? thickness + 4 : thickness}
                strokeDasharray={`${len} ${circumference - len}`}
                strokeDashoffset={-offset}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                style={{ transition: 'stroke-width 120ms' }}
              />
            );
            offset += frac * circumference;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <p className="tnum text-lg font-semibold">{active !== null ? format(data[active].value) : centerValue}</p>
          <p className="mt-0.5 max-w-[6.5rem] text-2xs text-muted">{active !== null ? data[active].label : centerLabel}</p>
        </div>
      </div>
      <ul className="min-w-[9rem] flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li
            key={d.label}
            className="flex items-center justify-between gap-3 text-xs"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: seriesColor(i) }} />
              <span className="truncate text-ink">{d.label}</span>
            </span>
            <span className="tnum shrink-0 text-muted">
              {format(d.value)} <span className="text-faint">· {Math.round((d.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* -------------------------------------------------------- horizontal bar */

export const HBarList = ({
  data, format = (n) => String(n), max, className, colorBy = 'single', onSelect,
}: {
  data: { label: string; value: number; hint?: string }[];
  format?: (n: number) => string;
  max?: number;
  className?: string;
  colorBy?: 'single' | 'series';
  onSelect?: (label: string) => void;
}) => {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className={cx('space-y-2.5', className)}>
      {data.map((d, i) => (
        <li key={d.label}>
          <button
            type="button"
            onClick={onSelect ? () => onSelect(d.label) : undefined}
            className={cx('w-full text-left', onSelect && 'cursor-pointer')}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-xs text-ink">{d.label}</span>
              <span className="tnum shrink-0 text-xs font-medium text-muted">
                {format(d.value)}
                {d.hint ? <span className="ml-1.5 text-faint">{d.hint}</span> : null}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.max(2, (d.value / top) * 100)}%`, background: colorBy === 'series' ? seriesColor(i) : 'var(--chart-1)' }}
              />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
};

/* ------------------------------------------------------------- sparkline */

export const Sparkline = ({
  values, width = 96, height = 28, tone = 'var(--chart-1)', area = true,
}: { values: number[]; width?: number; height?: number; tone?: string; area?: boolean }) => {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max - min < Math.abs(max) * 0.005) return null;
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / span) * (height - 4) - 2}`);
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      {area ? <polygon points={`0,${height} ${pts.join(' ')} ${width},${height}`} fill={tone} opacity={0.12} /> : null}
      <polyline points={pts.join(' ')} fill="none" stroke={tone} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={height - ((values[values.length - 1] - min) / span) * (height - 4) - 2} r={2.5} fill={tone} />
    </svg>
  );
};

/* ------------------------------------------------------------ gauge ring */

export const GaugeRing = ({
  value, size = 92, thickness = 9, label, tone = 'var(--chart-1)',
}: { value: number; size?: number; thickness?: number; label?: string; tone?: string }) => {
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke={GRID} strokeWidth={thickness} />
        <circle
          cx={c} cy={c} r={r} fill="none" stroke={tone} strokeWidth={thickness} strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circ} ${circ}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <p className="tnum text-sm font-semibold">{Math.round(pct)}%</p>
        {label ? <p className="text-2xs text-muted">{label}</p> : null}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------- heat grid */

export const HeatGrid = ({
  rows, columns, values, format = (n) => String(n), className,
}: {
  rows: string[];
  columns: string[];
  values: number[][];
  format?: (n: number) => string;
  className?: string;
}) => {
  const flat = values.flat();
  const max = Math.max(1, ...flat);
  return (
    <div className={cx('scroll-x', className)}>
      <table className="min-w-max border-separate border-spacing-0.5">
        <thead>
          <tr>
            <th className="px-2 py-1" />
            {columns.map((c) => (
              <th key={c} className="px-2 py-1 text-2xs font-medium text-faint">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r}>
              <td className="whitespace-nowrap py-1 pr-3 text-xs text-muted">{r}</td>
              {columns.map((c, ci) => {
                const v = values[ri]?.[ci] ?? 0;
                return (
                  <td key={c} className="p-0">
                    <div
                      title={`${r} · ${c}: ${format(v)}`}
                      className="grid h-8 w-12 place-items-center rounded text-2xs font-medium"
                      style={{
                        background: `color-mix(in srgb, var(--chart-1) ${Math.round((v / max) * 82)}%, rgb(var(--c-sunken)))`,
                        color: v / max > 0.55 ? '#fff' : 'rgb(var(--c-muted))',
                      }}
                    >
                      {format(v)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
