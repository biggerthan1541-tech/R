import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Briefcase, Building2, CornerDownLeft, FileText, MapPin, Search,
  Users, Wallet, Zap,
} from 'lucide-react';
import { Avatar, cx } from '@/components/ui';
import { useApp } from '@/lib/store';
import { NAV, QUICK_ACTIONS } from './nav';
import { currency } from '@/lib/format';
import { fmtDate } from '@/lib/dates';

interface Result {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  to: string;
  icon?: React.ComponentType<{ className?: string }>;
  avatar?: { first: string; last: string; seed: string };
}

export const CommandPalette = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { db, can, visibleIds } = useApp();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const peopleScope = useMemo(() => visibleIds('people'), [visibleIds]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Result[] = [];

    const pages = NAV.flatMap((g) => g.items)
      .filter((i) => can(...i.perms))
      .filter((i) => !q || i.label.toLowerCase().includes(q))
      .slice(0, q ? 5 : 6)
      .map<Result>((i) => ({ id: `page_${i.to}`, group: 'Navigate', title: i.label, to: i.to, icon: i.icon }));
    out.push(...pages);

    const actions = QUICK_ACTIONS
      .filter((a) => can(...a.perms))
      .filter((a) => !q || a.label.toLowerCase().includes(q))
      .slice(0, q ? 4 : 3)
      .map<Result>((a) => ({ id: `act_${a.label}`, group: 'Actions', title: a.label, to: a.to, icon: a.icon ?? Zap }));
    out.push(...actions);

    if (!q) return out;

    if (can('people.view.self', 'people.view.team', 'people.view.all')) {
      const people = db.employees
        .filter((e) => peopleScope.has(e.id))
        .filter((e) =>
          `${e.firstName} ${e.lastName} ${e.preferredName} ${e.employeeNumber} ${e.email}`.toLowerCase().includes(q))
        .slice(0, 6)
        .map<Result>((e) => {
          const job = db.jobTitles.find((j) => j.id === e.jobTitleId);
          const dept = db.departments.find((d) => d.id === e.departmentId);
          return {
            id: `emp_${e.id}`, group: 'People',
            title: `${e.firstName} ${e.lastName}`,
            subtitle: `${job?.name ?? ''} · ${dept?.name ?? ''} · ${e.employeeNumber}`,
            to: `/people/${e.id}`,
            avatar: { first: e.firstName, last: e.lastName, seed: e.avatarSeed },
          };
        });
      out.push(...people);
    }

    if (can('recruiting.view')) {
      const cands = db.candidates
        .filter((c) => `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(q))
        .slice(0, 4)
        .map<Result>((c) => ({
          id: `cand_${c.id}`, group: 'Candidates',
          title: `${c.firstName} ${c.lastName}`,
          subtitle: `${c.currentTitle} at ${c.currentCompany}`,
          to: `/recruiting?candidate=${c.id}`,
          icon: Briefcase,
        }));
      out.push(...cands);

      const reqs = db.requisitions
        .filter((r) => `${r.title} ${r.code}`.toLowerCase().includes(q))
        .slice(0, 3)
        .map<Result>((r) => ({
          id: `req_${r.id}`, group: 'Requisitions', title: `${r.code} — ${r.title}`,
          subtitle: `${r.openings} opening(s) · ${r.status.replace(/_/g, ' ')}`,
          to: `/recruiting?req=${r.id}`, icon: Briefcase,
        }));
      out.push(...reqs);
    }

    const docs = db.documents
      .filter((d) => (can('documents.view.all') || !d.employeeId || peopleScope.has(d.employeeId)))
      .filter((d) => d.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map<Result>((d) => ({
        id: `doc_${d.id}`, group: 'Documents', title: d.name,
        subtitle: `${d.category} · ${fmtDate(d.uploadedAt.slice(0, 10))}`,
        to: `/documents?doc=${d.id}`, icon: FileText,
      }));
    out.push(...docs);

    if (can('payroll.view.all', 'payroll.process')) {
      const runs = db.payrollRuns
        .filter((r) => r.runNumber.toLowerCase().includes(q) || r.status.includes(q))
        .slice(0, 3)
        .map<Result>((r) => ({
          id: `run_${r.id}`, group: 'Payroll', title: `Run ${r.runNumber}`,
          subtitle: `${r.status.replace(/_/g, ' ')} · ${currency(r.totals.grossPay, { cents: false })} gross`,
          to: `/payroll/runs/${r.id}`, icon: Wallet,
        }));
      out.push(...runs);
    }

    const depts = db.departments
      .filter((d) => d.name.toLowerCase().includes(q))
      .slice(0, 3)
      .map<Result>((d) => ({
        id: `dept_${d.id}`, group: 'Departments', title: d.name,
        subtitle: `${db.employees.filter((e) => e.departmentId === d.id && e.status === 'active').length} active employees`,
        to: `/people?department=${d.id}`, icon: Building2,
      }));
    out.push(...depts);

    const locs = db.locations
      .filter((l) => `${l.name} ${l.city} ${l.code}`.toLowerCase().includes(q))
      .slice(0, 3)
      .map<Result>((l) => ({
        id: `loc_${l.id}`, group: 'Locations', title: l.name,
        subtitle: `${l.city}, ${l.state}`, to: `/people?location=${l.id}`, icon: MapPin,
      }));
    out.push(...locs);

    return out;
  }, [query, db, can, peopleScope]);

  useEffect(() => { setCursor(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(results.length - 1, c + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      if (e.key === 'Enter') {
        const target = results[cursor];
        if (target) { navigate(target.to); onClose(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, results, cursor, navigate, onClose]);

  if (!open) return null;

  const grouped = results.reduce<Record<string, Result[]>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-3 pt-[8vh] sm:pt-[12vh]">
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-[74vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-pop animate-slide-up">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, documents, payroll, actions…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <kbd className="hidden rounded border border-line-strong px-1.5 py-0.5 text-[0.6rem] text-faint sm:block">ESC</kbd>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">
              No results for “{query}”. Try a name, employee number, document title or payroll run.
            </p>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="mb-1.5">
                <p className="px-4 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-faint">{group}</p>
                <ul>
                  {items.map((r) => {
                    flatIndex += 1;
                    const idx = flatIndex;
                    return (
                      <li key={r.id}>
                        <button
                          onMouseEnter={() => setCursor(idx)}
                          onClick={() => { navigate(r.to); onClose(); }}
                          className={cx('flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
                            cursor === idx ? 'bg-brand-50' : 'hover:bg-sunken')}
                        >
                          {r.avatar
                            ? <Avatar first={r.avatar.first} last={r.avatar.last} seed={r.avatar.seed} size={26} />
                            : r.icon
                              ? <span className="grid h-6.5 w-6.5 place-items-center rounded-md bg-sunken p-1 text-muted"><r.icon className="h-3.5 w-3.5" /></span>
                              : <Users className="h-4 w-4 text-muted" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink">{r.title}</span>
                            {r.subtitle ? <span className="block truncate text-xs text-muted">{r.subtitle}</span> : null}
                          </span>
                          {cursor === idx ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-brand-600" /> : <ArrowRight className="h-3.5 w-3.5 shrink-0 text-faint opacity-0" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-sunken/60 px-4 py-2 text-[0.65rem] text-faint">
          <span>Results respect your permissions — you only see what your role allows.</span>
          <span className="hidden sm:block">↑↓ navigate · ↵ open</span>
        </div>
      </div>
    </div>
  );
};
