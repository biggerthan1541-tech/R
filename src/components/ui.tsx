import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown,
  Inbox, Lock, RefreshCw, Search, X,
} from 'lucide-react';
import { avatarColor, initials } from '@/lib/format';

/* ------------------------------------------------------------------ util */

export const cx = (...parts: (string | number | false | null | undefined)[]): string =>
  parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');

/* ---------------------------------------------------------------- button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'accent';
type ButtonSize = 'xs' | 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 border border-transparent shadow-sm',
  accent: 'bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800 border border-transparent shadow-sm',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken active:bg-line/60',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-sunken hover:text-ink',
  subtle: 'bg-brand-50 text-brand-700 border border-brand-100 hover:bg-brand-100',
  danger: 'bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-700 border border-transparent shadow-sm',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2 text-2xs gap-1 rounded-md',
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ComponentType<{ className?: string }>;
  iconRight?: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  block?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', icon: Icon, iconRight: IconRight, loading, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors',
        'disabled:opacity-45 disabled:pointer-events-none select-none',
        BUTTON_VARIANTS[variant], BUTTON_SIZES[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : Icon ? <Icon className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} /> : null}
      {children}
      {IconRight ? <IconRight className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} /> : null}
    </button>
  );
});

export const IconButton = ({
  label, icon: Icon, onClick, className, active, size = 'md',
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  className?: string;
  active?: boolean;
  size?: 'sm' | 'md';
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className={cx(
      'inline-grid place-items-center rounded-lg transition-colors',
      size === 'md' ? 'h-9 w-9' : 'h-7 w-7',
      active ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-sunken hover:text-ink',
      className,
    )}
  >
    <Icon className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
  </button>
);

/* ------------------------------------------------------------------ card */

export const Card = ({
  className, children, padded = true, ...rest
}: React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }) => (
  <div className={cx('card', padded && 'p-4 sm:p-5', className)} {...rest}>{children}</div>
);

export const CardHeader = ({
  title, subtitle, actions, icon: Icon, className, dense,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  dense?: boolean;
}) => (
  <div className={cx('flex items-start justify-between gap-3 flex-wrap', dense ? 'mb-3' : 'mb-4', className)}>
    <div className="flex items-start gap-2.5 min-w-0">
      {Icon ? (
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-5 truncate">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
      </div>
    </div>
    {actions ? <div className="flex items-center gap-1.5 shrink-0">{actions}</div> : null}
  </div>
);

export const SectionHeader = ({
  title, subtitle, actions, className,
}: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) => (
  <div className={cx('flex flex-wrap items-end justify-between gap-3', className)}>
    <div>
      <h1 className="text-lg sm:text-xl font-semibold tracking-[-0.015em]">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted max-w-2xl">{subtitle}</p> : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>
);

/* ----------------------------------------------------------------- badge */

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'teal' | 'accent';

const TONES: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted border-line-strong',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  success: 'bg-success-50 text-success-700 border-success-100',
  warning: 'bg-warning-50 text-warning-700 border-warning-100',
  danger: 'bg-danger-50 text-danger-700 border-danger-100',
  info: 'bg-info-50 text-info-700 border-info-100',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  accent: 'bg-accent-50 text-accent-700 border-accent-200',
};

export const Badge = ({
  tone = 'neutral', children, className, dot, icon: Icon,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) => (
  <span className={cx(
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap',
    TONES[tone], className,
  )}>
    {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
    {Icon ? <Icon className="h-3 w-3" /> : null}
    {children}
  </span>
);

const STATUS_TONES: Record<string, Tone> = {
  active: 'success', approved: 'success', completed: 'success', paid: 'success', hired: 'success',
  issued: 'success', signed: 'success', connected: 'success', healthy: 'success', on_track: 'success',
  reimbursed: 'success', accepted: 'success', filled: 'success', current: 'success',
  pending: 'warning', submitted: 'warning', in_progress: 'warning', pending_approval: 'warning',
  pending_manager: 'warning', pending_employee: 'warning', screening: 'warning', sent: 'warning',
  viewed: 'warning', at_risk: 'warning', degraded: 'warning', validation: 'warning', on_leave: 'warning',
  manager_approved: 'warning', finance_review: 'warning', calculated: 'warning', employee_review: 'warning',
  overdue: 'danger', denied: 'danger', rejected: 'danger', terminated: 'danger', error: 'danger',
  failing: 'danger', behind: 'danger', suspended: 'danger', declined: 'danger', voided: 'danger',
  cancelled: 'neutral', draft: 'neutral', not_started: 'neutral', assigned: 'neutral', open: 'info',
  waived: 'neutral', closed: 'neutral', archived: 'neutral', withdrawn: 'neutral', disabled: 'neutral',
  future: 'neutral', available: 'neutral', locked: 'info', published: 'info', scheduled: 'info',
  interview: 'info', final_interview: 'info', offer: 'brand', applied: 'neutral', invited: 'info',
  finalized: 'brand', gathering: 'info', on_hold: 'warning', review: 'warning', ready: 'success',
};

export const StatusBadge = ({ status, className }: { status: string; className?: string }) => (
  <Badge tone={STATUS_TONES[status] ?? 'neutral'} dot className={className}>
    {status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
  </Badge>
);

/* ---------------------------------------------------------------- avatar */

export const Avatar = ({
  first, last, seed, size = 32, className, ring,
}: { first: string; last: string; seed?: string; size?: number; className?: string; ring?: boolean }) => {
  const bg = avatarColor(seed ?? `${first}${last}`);
  return (
    <span
      className={cx('inline-grid place-items-center rounded-full font-semibold text-white shrink-0',
        ring && 'ring-2 ring-surface', className)}
      style={{ background: bg, width: size, height: size, fontSize: Math.max(9, size * 0.38) }}
      aria-hidden
    >
      {initials(first, last)}
    </span>
  );
};

export const PersonCell = ({
  first, last, secondary, size = 30, seed, href, onClick,
}: {
  first: string; last: string; secondary?: string; size?: number; seed?: string;
  href?: string; onClick?: () => void;
}) => {
  const content = (
    <span className="flex items-center gap-2.5 min-w-0 text-left">
      <Avatar first={first} last={last} seed={seed} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink leading-tight">{first} {last}</span>
        {secondary ? <span className="block truncate text-xs text-muted leading-tight mt-0.5">{secondary}</span> : null}
      </span>
    </span>
  );
  if (onClick || href) {
    return (
      <button type="button" onClick={onClick} className="group max-w-full hover:[&_span.text-ink]:text-brand-700">
        {content}
      </button>
    );
  }
  return content;
};

/* ----------------------------------------------------------------- forms */

export const Field = ({
  label, hint, error, required, children, className, htmlFor,
}: {
  label?: React.ReactNode; hint?: React.ReactNode; error?: string; required?: boolean;
  children: React.ReactNode; className?: string; htmlFor?: string;
}) => (
  <div className={cx('min-w-0', className)}>
    {label ? (
      <label htmlFor={htmlFor} className="mb-1 flex items-center gap-1 text-xs font-medium text-muted">
        {label}
        {required ? <span className="text-danger-500">*</span> : null}
      </label>
    ) : null}
    {children}
    {error ? <p className="mt-1 text-xs text-danger-600">{error}</p> : hint ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
  </div>
);

const controlBase =
  'w-full rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink placeholder:text-faint ' +
  'transition-shadow focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 ' +
  'disabled:bg-sunken disabled:text-faint';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(controlBase, 'h-9', className)} {...rest} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cx(controlBase, 'py-2 leading-relaxed', className)} {...rest} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cx(controlBase, 'h-9 appearance-none pr-8', className)} {...rest}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
      </div>
    );
  },
);

export const Checkbox = ({
  label, checked, onChange, disabled, description, className,
}: {
  label: React.ReactNode; checked: boolean; onChange: (v: boolean) => void;
  disabled?: boolean; description?: React.ReactNode; className?: string;
}) => {
  const id = useId();
  return (
    <label htmlFor={id} className={cx('flex items-start gap-2.5 cursor-pointer', disabled && 'opacity-50 cursor-not-allowed', className)}>
      <span className="relative mt-0.5 flex h-4 w-4 shrink-0">
        <input
          id={id} type="checkbox" checked={checked} disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-4 w-4 appearance-none rounded border border-line-strong bg-surface checked:border-brand-600 checked:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
        <Check className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-white opacity-0 peer-checked:opacity-100" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm leading-tight">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-muted">{description}</span> : null}
      </span>
    </label>
  );
};

export const Radio = ({
  label, checked, onChange, description, className,
}: { label: React.ReactNode; checked: boolean; onChange: () => void; description?: React.ReactNode; className?: string }) => (
  <label className={cx(
    'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors',
    checked ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30' : 'border-line hover:border-line-strong hover:bg-sunken',
    className,
  )}>
    <span className={cx('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border',
      checked ? 'border-brand-600' : 'border-line-strong')}>
      {checked ? <span className="h-2 w-2 rounded-full bg-brand-600" /> : null}
    </span>
    <input type="radio" checked={checked} onChange={onChange} className="sr-only" />
    <span className="min-w-0">
      <span className="block text-sm font-medium leading-tight">{label}</span>
      {description ? <span className="mt-1 block text-xs text-muted">{description}</span> : null}
    </span>
  </label>
);

export const Toggle = ({
  checked, onChange, label, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; disabled?: boolean }) => (
  <label className={cx('inline-flex items-center gap-2.5', disabled ? 'opacity-50' : 'cursor-pointer')}>
    <button
      type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors',
        checked ? 'bg-brand-600' : 'bg-line-strong')}
    >
      <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5')} />
    </button>
    {label ? <span className="text-sm">{label}</span> : null}
  </label>
);

export const SearchInput = ({
  value, onChange, placeholder = 'Search…', className, autoFocus,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) => (
  <div className={cx('relative', className)}>
    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
    <input
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cx(controlBase, 'h-9 pl-8', value && 'pr-8')}
    />
    {value ? (
      <button
        type="button" onClick={() => onChange('')} aria-label="Clear search"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    ) : null}
  </div>
);

/* ------------------------------------------------------------------ tabs */

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ComponentType<{ className?: string }>;
}

export const Tabs = ({
  tabs, active, onChange, className, size = 'md',
}: { tabs: TabItem[]; active: string; onChange: (id: string) => void; className?: string; size?: 'sm' | 'md' }) => (
  <div className={cx('scroll-x -mx-1 px-1', className)}>
    <div role="tablist" className="flex min-w-max items-center gap-1 border-b border-line">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cx(
              'relative -mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 font-medium transition-colors',
              size === 'md' ? 'py-2.5 text-sm' : 'py-2 text-xs',
              on ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:border-line-strong hover:text-ink',
            )}
          >
            {t.icon ? <t.icon className="h-3.5 w-3.5" /> : null}
            {t.label}
            {t.count !== undefined ? (
              <span className={cx('rounded-full px-1.5 py-0.5 text-2xs tabular-nums',
                on ? 'bg-brand-100 text-brand-700' : 'bg-sunken text-faint')}>
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  </div>
);

export const SegmentedControl = <T extends string>({
  options, value, onChange, className,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string }) => (
  <div className={cx('inline-flex rounded-lg border border-line-strong bg-sunken p-0.5', className)}>
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={cx('rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
          o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/* ----------------------------------------------------------------- modal */

export const Modal = ({
  open, onClose, title, subtitle, children, footer, size = 'md', icon: Icon,
}: {
  open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: React.ComponentType<{ className?: string }>;
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-raised shadow-pop animate-slide-up sm:rounded-xl',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <div className="flex items-start gap-2.5 min-w-0">
            {Icon ? (
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                <Icon className="h-4 w-4" />
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold sm:text-base">{title}</h2>
              {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
            </div>
          </div>
          <IconButton label="Close" icon={X} onClick={onClose} size="sm" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-sunken/60 px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const Drawer = ({
  open, onClose, title, subtitle, children, footer, width = 'md',
}: {
  open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode; width?: 'sm' | 'md' | 'lg';
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const w = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' }[width];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={cx('relative flex h-full w-full flex-col bg-raised shadow-pop animate-slide-left', w)}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
          </div>
          <IconButton label="Close" icon={X} onClick={onClose} size="sm" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-sunken/60 px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const ConfirmDialog = ({
  open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', tone = 'primary',
}: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string;
  body: React.ReactNode; confirmLabel?: string; tone?: 'primary' | 'danger';
}) => (
  <Modal
    open={open} onClose={onClose} title={title} size="sm"
    icon={tone === 'danger' ? AlertTriangle : undefined}
    footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <div className="text-sm text-muted leading-relaxed">{body}</div>
  </Modal>
);

/* -------------------------------------------------------------- feedback */

export const EmptyState = ({
  title, body, action, icon: Icon = Inbox, compact,
}: {
  title: string; body?: React.ReactNode; action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>; compact?: boolean;
}) => (
  <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'py-8' : 'py-14')}>
    <span className="grid h-11 w-11 place-items-center rounded-xl bg-sunken text-faint">
      <Icon className="h-5 w-5" />
    </span>
    <p className="mt-3 text-sm font-medium text-ink">{title}</p>
    {body ? <p className="mt-1 max-w-sm text-xs text-muted leading-relaxed">{body}</p> : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);

export const PermissionDenied = ({ what = 'this area' }: { what?: string }) => (
  <Card className="mx-auto max-w-lg">
    <EmptyState
      icon={Lock}
      title="You don't have access to this"
      body={`Your current role doesn't include permission to view ${what}. If you need access, ask a system administrator to add the relevant permission group to your account.`}
    />
  </Card>
);

export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <Card>
    <EmptyState
      icon={AlertTriangle}
      title="Something went wrong"
      body={message}
      action={onRetry ? <Button icon={RefreshCw} onClick={onRetry}>Try again</Button> : undefined}
    />
  </Card>
);

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cx('skeleton', className)} />
);

export const TableSkeleton = ({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) => (
  <div className="space-y-2 p-4">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-3">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className={cx('h-4', c === 0 ? 'w-1/4' : 'flex-1')} />
        ))}
      </div>
    ))}
  </div>
);

/* -------------------------------------------------------------- progress */

export const Progress = ({
  value, max = 100, tone = 'brand', size = 'md', className, showValue,
}: {
  value: number; max?: number; tone?: Tone; size?: 'sm' | 'md' | 'lg';
  className?: string; showValue?: boolean;
}) => {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const bar: Record<Tone, string> = {
    neutral: 'bg-faint', brand: 'bg-brand-600', success: 'bg-success-500', warning: 'bg-warning-500',
    danger: 'bg-danger-500', info: 'bg-info-500', teal: 'bg-teal-600', accent: 'bg-accent-500',
  };
  const h = { sm: 'h-1', md: 'h-1.5', lg: 'h-2.5' }[size];
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <div className={cx('flex-1 overflow-hidden rounded-full bg-line', h)}>
        <div className={cx('h-full rounded-full transition-[width] duration-500', bar[tone])} style={{ width: `${pct}%` }} />
      </div>
      {showValue ? <span className="tnum text-xs font-medium text-muted w-9 text-right">{Math.round(pct)}%</span> : null}
    </div>
  );
};

export const ProgressBlocks = ({ value, max = 10 }: { value: number; max?: number }) => {
  const filled = Math.round((value / 100) * max);
  return (
    <span className="font-mono text-xs tracking-tight text-brand-600">
      {'█'.repeat(filled)}
      <span className="text-line-strong">{'░'.repeat(Math.max(0, max - filled))}</span>
      <span className="ml-2 tnum text-muted">{Math.round(value)}%</span>
    </span>
  );
};

/* ------------------------------------------------------------ stat tiles */

export const StatTile = ({
  label, value, delta, deltaTone, hint, icon: Icon, tone = 'brand', onClick, footer,
}: {
  label: string; value: React.ReactNode; delta?: string; deltaTone?: 'up' | 'down' | 'flat';
  hint?: string; icon?: React.ComponentType<{ className?: string }>; tone?: Tone;
  onClick?: () => void; footer?: React.ReactNode;
}) => {
  const iconTone: Record<Tone, string> = {
    neutral: 'bg-sunken text-muted', brand: 'bg-brand-50 text-brand-700', success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600', danger: 'bg-danger-50 text-danger-600', info: 'bg-info-50 text-info-600',
    teal: 'bg-teal-50 text-teal-700', accent: 'bg-accent-50 text-accent-700',
  };
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={cx('card p-4 text-left transition-shadow', onClick && 'hover:shadow-raised cursor-pointer')}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {Icon ? <span className={cx('grid h-7 w-7 place-items-center rounded-lg', iconTone[tone])}><Icon className="h-3.5 w-3.5" /></span> : null}
      </div>
      <p className="tnum mt-2 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {delta ? (
          <span className={cx('tnum text-xs font-medium',
            deltaTone === 'up' ? 'text-success-600' : deltaTone === 'down' ? 'text-danger-600' : 'text-muted')}>
            {delta}
          </span>
        ) : null}
        {hint ? <span className="text-xs text-faint truncate">{hint}</span> : null}
      </div>
      {footer ? <div className="mt-3 border-t border-line pt-3">{footer}</div> : null}
    </Wrapper>
  );
};

/* ------------------------------------------------------------ data table */

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  width?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function DataTable<T>({
  rows, columns, getRowId, onRowClick, empty, pageSize = 15, dense, initialSort, footer, maxHeight,
}: {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  pageSize?: number;
  dense?: boolean;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  footer?: React.ReactNode;
  maxHeight?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const r = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === 'asc' ? r : -r;
    });
    return copy;
  }, [rows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const view = pageSize > 0 ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted;

  useEffect(() => { setPage(0); }, [rows.length]);

  const hideClass = (h?: 'sm' | 'md' | 'lg') =>
    h === 'sm' ? 'hidden sm:table-cell' : h === 'md' ? 'hidden md:table-cell' : h === 'lg' ? 'hidden lg:table-cell' : '';

  if (!rows.length) {
    return <div className="p-2">{empty ?? <EmptyState title="Nothing to show" body="No records match the current filters." />}</div>;
  }

  return (
    <div>
      <div className="scroll-x" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        <table className="dt">
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = Boolean(c.sortValue);
                const on = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={cx(
                      hideClass(c.hideBelow),
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center',
                      sortable && 'cursor-pointer select-none hover:text-ink',
                      c.className,
                    )}
                    onClick={sortable ? () => setSort((s) =>
                      s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' },
                    ) : undefined}
                  >
                    <span className={cx('inline-flex items-center gap-1', c.align === 'right' && 'flex-row-reverse')}>
                      {c.header}
                      {sortable ? (
                        on
                          ? <ChevronDown className={cx('h-3 w-3 transition-transform', sort!.dir === 'asc' && 'rotate-180')} />
                          : <ChevronsUpDown className="h-3 w-3 opacity-35" />
                      ) : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((row) => (
              <tr
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cx(onRowClick && 'cursor-pointer')}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx(
                      hideClass(c.hideBelow),
                      dense && 'py-1.5',
                      c.align === 'right' && 'text-right tnum',
                      c.align === 'center' && 'text-center',
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(pageCount > 1 || footer) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2.5">
          <p className="text-xs text-muted tnum">
            {sorted.length ? `${safePage * pageSize + 1}–${Math.min(sorted.length, (safePage + 1) * pageSize)} of ${sorted.length}` : '0 results'}
          </p>
          <div className="flex items-center gap-2">
            {footer}
            {pageCount > 1 ? (
              <div className="flex items-center gap-1">
                <IconButton label="Previous page" icon={ChevronLeft} size="sm" onClick={() => setPage(Math.max(0, safePage - 1))} />
                <span className="tnum px-1 text-xs text-muted">{safePage + 1} / {pageCount}</span>
                <IconButton label="Next page" icon={ChevronRight} size="sm" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ misc parts */

export const KeyValue = ({
  items, columns = 2, className,
}: { items: { label: string; value: React.ReactNode; span?: boolean }[]; columns?: 1 | 2 | 3; className?: string }) => (
  <dl className={cx('grid gap-x-6 gap-y-3.5',
    columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2',
    className)}>
    {items.map((it, i) => (
      <div key={i} className={cx('min-w-0', it.span && 'sm:col-span-full')}>
        <dt className="text-xs text-faint">{it.label}</dt>
        <dd className="mt-0.5 text-sm text-ink break-words">{it.value}</dd>
      </div>
    ))}
  </dl>
);

export const Timeline = ({
  items,
}: {
  items: { id: string; title: React.ReactNode; meta?: React.ReactNode; body?: React.ReactNode; tone?: Tone; icon?: React.ComponentType<{ className?: string }> }[];
}) => (
  <ol className="relative space-y-4 border-l border-line pl-5">
    {items.map((it) => {
      const dot: Record<Tone, string> = {
        neutral: 'bg-line-strong', brand: 'bg-brand-600', success: 'bg-success-500', warning: 'bg-warning-500',
        danger: 'bg-danger-500', info: 'bg-info-500', teal: 'bg-teal-600', accent: 'bg-accent-500',
      };
      return (
        <li key={it.id} className="relative">
          <span className={cx('absolute -left-[1.6rem] top-1.5 grid h-3 w-3 place-items-center rounded-full ring-4 ring-surface',
            dot[it.tone ?? 'neutral'])}>
            {it.icon ? <it.icon className="h-2 w-2 text-white" /> : null}
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">{it.title}</p>
            {it.meta ? <p className="text-xs text-faint">{it.meta}</p> : null}
          </div>
          {it.body ? <div className="mt-1 text-xs text-muted leading-relaxed">{it.body}</div> : null}
        </li>
      );
    })}
  </ol>
);

export const StageStepper = ({
  stages, current, className,
}: { stages: { id: string; label: string }[]; current: string; className?: string }) => {
  const idx = stages.findIndex((s) => s.id === current);
  return (
    <div className={cx('scroll-x', className)}>
      <ol className="flex min-w-max items-center gap-1">
        {stages.map((s, i) => {
          const done = i < idx;
          const on = i === idx;
          return (
            <li key={s.id} className="flex items-center gap-1">
              <div className={cx(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
                on ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : done ? 'border-success-100 bg-success-50 text-success-700'
                  : 'border-line bg-surface text-faint',
              )}>
                <span className={cx('grid h-4 w-4 place-items-center rounded-full text-[10px] font-semibold',
                  on ? 'bg-brand-600 text-white' : done ? 'bg-success-500 text-white' : 'bg-sunken text-faint')}>
                  {done ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                {s.label}
              </div>
              {i < stages.length - 1 ? <ChevronRight className="h-3 w-3 text-line-strong" /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export const Alert = ({
  tone = 'info', title, children, action, icon: Icon, className,
}: {
  tone?: Tone; title?: React.ReactNode; children?: React.ReactNode;
  action?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; className?: string;
}) => (
  <div className={cx('flex items-start gap-3 rounded-lg border p-3.5', TONES[tone], className)}>
    {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" /> : null}
    <div className="min-w-0 flex-1">
      {title ? <p className="text-sm font-medium">{title}</p> : null}
      {children ? <div className={cx('text-xs leading-relaxed', title ? 'mt-1' : '')}>{children}</div> : null}
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>
);

export const FilterBar = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cx('flex flex-wrap items-center gap-2', className)}>{children}</div>
);

export const useClickOutside = <T extends HTMLElement>(onOutside: () => void) => {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOutside]);
  return ref;
};

export const Popover = ({
  trigger, children, align = 'right', width = 'w-72',
}: { trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode; children: React.ReactNode | ((close: () => void) => React.ReactNode); align?: 'left' | 'right'; width?: string }) => {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open ? (
        <div className={cx(
          'absolute z-40 mt-2 rounded-xl border border-line bg-raised shadow-pop animate-slide-up',
          align === 'right' ? 'right-0' : 'left-0', width,
        )}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      ) : null}
    </div>
  );
};
