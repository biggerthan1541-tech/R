import { useState } from 'react';
import {
  BookOpen, ChevronDown, LifeBuoy, Mail, MessageSquare, Phone, Shield, Zap,
} from 'lucide-react';
import { Alert, Badge, Card, CardHeader, SearchInput, SectionHeader, cx } from '@/components/ui';
import { useApp } from '@/lib/store';
import { ROLES } from '@/lib/permissions';

const TOPICS = [
  {
    q: 'How do I clock in and out?',
    a: 'Use the clock card at the top of your dashboard, or the Time & Attendance module. Every punch records the capture method, device, network address and — for on-site work — your location against the site geofence. If you forget a punch, request a correction from your timecard; your manager approves it and the change is written to the audit log.',
  },
  {
    q: 'When does my time off appear on my paycheck?',
    a: 'Approving a time-off request writes the hours onto your timecard for those dates. When payroll is calculated for that pay period, the paid-leave hours are picked up as an earning line automatically. Nothing needs to be re-entered.',
  },
  {
    q: 'Why was my time-off request flagged?',
    a: 'Requests are checked against your available balance, your policy\'s notice period, and any blackout windows for your department. A flag does not block the request — your manager still decides — but it is shown to them alongside team coverage for the same dates.',
  },
  {
    q: 'How is my paycheck calculated?',
    a: 'Gross pay comes from approved hours (or your salary divided by pay periods), plus bonuses, commissions and retro adjustments. Pre-tax deductions come off first, then federal, Social Security, Medicare and state taxes are computed on the reduced taxable wage, then post-tax deductions and garnishments. Approved expense reimbursements are added last as non-taxable earnings.',
  },
  {
    q: 'What stops a payroll error from reaching my bank?',
    a: 'Before a run can be approved, Meridian validates every check against eleven classes of rule — missing time, unapproved timecards, unusual hours, unexpected overtime, incomplete tax setup, missing direct deposit, missing benefit deductions, negative net pay, large variance against your prior check, duplicate earning lines and invalid employment status. Anything classified as an error blocks approval until it is resolved with a written note.',
  },
  {
    q: 'When can I change my benefits?',
    a: 'During open enrollment, within 30 days of your hire date, or within 30 days of a qualifying life event such as marriage, a birth or losing other coverage. Saved elections update your payroll deductions on the next run and are sent to carriers in the weekly enrollment feed.',
  },
  {
    q: 'Who can see my personal information?',
    a: 'Your address, date of birth, Social Security number and compensation are restricted. Managers see the job, department and time data they need to run their team but not sensitive personal fields. People Operations and Payroll see what their role requires. Every access to a restricted record is logged.',
  },
  {
    q: 'How do electronic signatures work?',
    a: 'A signature request records the exact document version you were shown. Typing your legal name creates the signature, and the timestamp plus your network address are stored in the request\'s audit trail. You can retrieve a signed copy from your documents at any time.',
  },
  {
    q: 'What is the assistant allowed to tell me?',
    a: 'Exactly what your role can already open. The assistant resolves your data scope — self, team or company — before it aggregates anything, so it declines out-of-scope questions rather than answering them partially.',
  },
];

export const HelpPage = () => {
  const { db, user } = useApp();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<number | null>(0);

  const topics = TOPICS.filter((t) => {
    const q = query.trim().toLowerCase();
    return !q || `${t.q} ${t.a}`.toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionHeader title="Help & support" subtitle="How Meridian works, and who to contact when something is wrong." />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: MessageSquare, title: 'People Operations', detail: 'Records, benefits, leave and policy', contact: 'people@cardinalpeak.com' },
          { icon: Zap, title: 'Payroll', detail: 'Pay, taxes, deductions and deposits', contact: 'payroll@cardinalpeak.com' },
          { icon: LifeBuoy, title: 'IT service desk', detail: 'Access, devices and sign-in problems', contact: 'help@cardinalpeak.com' },
        ].map((c) => (
          <Card key={c.title}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700"><c.icon className="h-4 w-4" /></span>
            <p className="mt-3 text-sm font-medium">{c.title}</p>
            <p className="mt-0.5 text-xs text-muted">{c.detail}</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-brand-700"><Mail className="h-3 w-3" />{c.contact}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Common questions" icon={BookOpen}
          actions={<SearchInput value={query} onChange={setQuery} placeholder="Search help…" className="w-48" />} />
        <ul className="divide-y divide-line">
          {topics.map((t, i) => (
            <li key={t.q}>
              <button onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left">
                <span className="text-sm font-medium">{t.q}</span>
                <ChevronDown className={cx('h-4 w-4 shrink-0 text-faint transition-transform', open === i && 'rotate-180')} />
              </button>
              {open === i ? <p className="pb-3 text-xs leading-relaxed text-muted">{t.a}</p> : null}
            </li>
          ))}
        </ul>
        {topics.length === 0 ? <p className="py-6 text-center text-sm text-muted">No help topics match “{query}”.</p> : null}
      </Card>

      <Card>
        <CardHeader title="Your access" icon={Shield} subtitle="What your current roles allow" />
        <div className="flex flex-wrap gap-2">
          {user?.roles.map((r) => {
            const meta = ROLES.find((x) => x.id === r);
            return (
              <span key={r} className="rounded-lg border border-line px-3 py-2">
                <span className="flex items-center gap-2">
                  <Badge tone="brand">{meta?.short}</Badge>
                  <span className="text-sm font-medium">{meta?.label}</span>
                </span>
                <span className="mt-1 block text-xs text-muted">{meta?.blurb}</span>
              </span>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-muted">
          Need different access? Ask a System Administrator to add the relevant permission group to your account.
          Role changes are recorded in the audit log.
        </p>
      </Card>

      <Alert tone="neutral" icon={Phone} title="This is a demonstration environment">
        {db.organization.legalName} is a fictional company. All employees, pay data, candidates and documents are
        generated locally in your browser and never leave this device.
      </Alert>
    </div>
  );
};
