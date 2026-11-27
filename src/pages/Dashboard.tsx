import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, Bell, CalendarClock, CheckCircle2, ClipboardCheck, Clock,
  Coffee, FileSignature, GraduationCap, LogIn, LogOut, Megaphone, Plane, Target,
  TrendingUp, Users, Wallet, Zap,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, Progress, StatTile,
  StatusBadge, cx,
} from '@/components/ui';
import { BarChart, HBarList, LineChart, Sparkline } from '@/components/charts';
import { useApp } from '@/lib/store';
import { useActions, openPunchState } from '@/lib/actions';
import {
  activeRunFor, departmentHeadcount, goalsFor, headcountStats, hoursThisWeek, hoursToday,
  latestPaycheck, openTasksFor, payrollHistory, pendingSignaturesFor, ptoSummary,
  recruitingFunnel, trainingFor, upcomingShifts, whoIsOut,
} from '@/lib/selectors';
import { issueCounts } from '@/lib/validation';
import { currency, num, pluralize } from '@/lib/format';
import { DOW_LONG, diffDays, fmtClockSeconds, fmtDate, fmtDateShort, fmtTime, parseISO, timeAgo } from '@/lib/dates';

export const DashboardPage = () => {
  const { db, employee, user, can, today } = useApp();
  if (!employee || !user) return null;

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">
            {DOW_LONG[parseISO(today).getDay()]}, {fmtDate(today)}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.015em] sm:text-2xl">
            {greeting}, {employee.preferredName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="brand">{db.organization.dba}</Badge>
          <Badge tone="neutral">{employee.employeeNumber}</Badge>
        </div>
      </header>

      {can('time.punch') ? <TimeClockCard /> : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {can('payroll.process') ? <PayrollStatusCard /> : null}
          {can('time.approve', 'pto.approve', 'expense.approve.team') ? <ApprovalQueue /> : null}
          {can('people.view.all') ? <WorkforcePulse /> : null}
          {can('analytics.view') ? <LaborTrend /> : null}
          <MyTasks />
          <Announcements />
        </div>

        <div className="space-y-5">
          <MySchedule />
          <PtoCard />
          <PayCard />
          {can('recruiting.view') ? <PipelineCard /> : null}
          <ActionItems />
          <GoalsCard />
        </div>
      </div>
    </div>
  );
};

/* --------------------------------------------------------------- clock */

const TimeClockCard = () => {
  const { db, employee, today } = useApp();
  const { punch } = useActions();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const todayPunches = useMemo(
    () => db.punches.filter((p) => p.employeeId === employee?.id && p.at.slice(0, 10) === today)
      .sort((a, b) => a.at.localeCompare(b.at)),
    [db.punches, employee, today],
  );
  const state = openPunchState(todayPunches);
  const worked = employee ? hoursToday(db, employee.id, today) : 0;
  const week = employee ? hoursThisWeek(db, employee.id, today) : 0;
  const shiftToday = db.shifts.find((s) => s.employeeId === employee?.id && s.date === today);

  const stateLabel = state === 'in' ? 'On the clock' : state === 'break' ? 'On break' : 'Clocked out';

  return (
    <Card className="overflow-hidden" padded={false}>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 p-5">
          <div>
            <div className="flex items-center gap-2">
              <span className={cx('h-2 w-2 rounded-full',
                state === 'in' ? 'bg-success-500 animate-pulse' : state === 'break' ? 'bg-warning-500' : 'bg-line-strong')} />
              <p className="text-xs font-medium text-muted">{stateLabel}</p>
            </div>
            <p className="tnum mt-1 text-3xl font-semibold tracking-[-0.02em]">{fmtClockSeconds(now)}</p>
            <p className="mt-1 text-xs text-faint">
              {shiftToday
                ? `Scheduled ${fmtTime(shiftToday.start)} – ${fmtTime(shiftToday.end)} · ${shiftToday.role}`
                : 'No shift scheduled today'}
            </p>
          </div>

          <dl className="flex gap-8">
            <div>
              <dt className="text-xs text-faint">Today</dt>
              <dd className="tnum mt-0.5 text-xl font-semibold">{num(worked, 2)}<span className="ml-0.5 text-sm font-normal text-muted">h</span></dd>
            </div>
            <div>
              <dt className="text-xs text-faint">This week</dt>
              <dd className="tnum mt-0.5 text-xl font-semibold">
                {num(week, 2)}<span className="ml-0.5 text-sm font-normal text-muted">h</span>
              </dd>
              <dd className="mt-1"><Progress value={Math.min(100, (week / 40) * 100)} tone={week > 40 ? 'warning' : 'brand'} size="sm" className="w-24" /></dd>
            </div>
            <div className="hidden sm:block">
              <dt className="text-xs text-faint">Punches today</dt>
              <dd className="tnum mt-0.5 text-xl font-semibold">{todayPunches.length}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-sunken/60 p-5 lg:border-l lg:border-t-0">
          {state === 'out' ? (
            <Button variant="primary" size="md" icon={LogIn} onClick={() => punch('in')}>Clock in</Button>
          ) : (
            <>
              <Button variant="danger" size="md" icon={LogOut} onClick={() => punch('out')}>Clock out</Button>
              {state === 'in' ? (
                <Button size="md" icon={Coffee} onClick={() => punch('break_start')}>Start break</Button>
              ) : (
                <Button variant="accent" size="md" icon={Coffee} onClick={() => punch('break_end')}>End break</Button>
              )}
            </>
          )}
          <Button size="md" variant="ghost" icon={Clock} onClick={() => window.location.assign('/time')}>Timecard</Button>
        </div>
      </div>

      {todayPunches.length ? (
        <div className="scroll-x border-t border-line px-5 py-2.5">
          <ol className="flex min-w-max items-center gap-2 text-2xs">
            {todayPunches.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-1">
                <span className={cx('h-1.5 w-1.5 rounded-full',
                  p.type === 'in' ? 'bg-success-500' : p.type === 'out' ? 'bg-danger-500' : 'bg-warning-500')} />
                <span className="font-medium text-ink">{p.type.replace('_', ' ')}</span>
                <span className="tnum text-faint">{new Date(p.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                <span className="text-faint">· {p.source}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Card>
  );
};

/* ------------------------------------------------------------- payroll */

const PayrollStatusCard = () => {
  const { db } = useApp();
  const navigate = useNavigate();
  const run = activeRunFor(db);
  if (!run) {
    return (
      <Card>
        <CardHeader title="Payroll" subtitle="No run in progress" icon={Wallet} />
        <EmptyState
          compact icon={Wallet} title="No open payroll run"
          body="Start the next run when the pay period closes."
          action={<Button variant="primary" onClick={() => navigate('/payroll?tab=runs')}>Go to payroll</Button>}
        />
      </Card>
    );
  }
  const issues = db.payrollIssues.filter((i) => i.payrollRunId === run.id);
  const counts = issueCounts(issues);
  const period = db.payPeriods.find((p) => p.id === run.payPeriodId);
  const group = db.payGroups.find((p) => p.id === run.payGroupId);

  const STAGES = ['gathering', 'calculated', 'validation', 'employee_review', 'pending_approval', 'approved', 'finalized', 'paid'];
  const stageIdx = STAGES.indexOf(run.status);

  return (
    <Card>
      <CardHeader
        title={`Payroll ${run.runNumber}`}
        subtitle={`${group?.name} · ${period ? `${fmtDateShort(period.start)} – ${fmtDateShort(period.end)}` : ''} · check date ${period ? fmtDate(period.checkDate) : '—'}`}
        icon={Wallet}
        actions={<Button variant="primary" onClick={() => navigate(`/payroll/runs/${run.id}`)} iconRight={ArrowUpRight}>Open run</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Metric label="Gross" value={currency(run.totals.grossPay, { cents: false })} />
        <Metric label="Net" value={currency(run.totals.netPay, { cents: false })} />
        <Metric label="Employer cost" value={currency(run.totals.totalCost, { cents: false })} />
        <Metric label="Employees" value={num(run.employeeCount)} />
      </div>

      <div className="mt-4 flex items-center gap-1">
        {STAGES.map((s, i) => (
          <div key={s} className="flex-1" title={s.replace(/_/g, ' ')}>
            <div className={cx('h-1.5 rounded-full',
              i < stageIdx ? 'bg-success-500' : i === stageIdx ? 'bg-brand-600' : 'bg-line')} />
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Stage {stageIdx + 1} of {STAGES.length}: <span className="font-medium text-ink">{run.status.replace(/_/g, ' ')}</span>
      </p>

      {counts.total ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <IssuePill label="Errors" count={counts.error} tone="danger" />
          <IssuePill label="Warnings" count={counts.warning} tone="warning" />
          <IssuePill label="Review" count={counts.review} tone="info" />
          <IssuePill label="Resolved" count={counts.resolved} tone="success" />
        </div>
      ) : (
        <Alert tone="success" icon={CheckCircle2} title="Validation clean" className="mt-4">
          No blocking errors detected in this run.
        </Alert>
      )}
    </Card>
  );
};

const IssuePill = ({ label, count, tone }: { label: string; count: number; tone: 'danger' | 'warning' | 'info' | 'success' }) => {
  const styles = {
    danger: 'border-danger-100 bg-danger-50 text-danger-700',
    warning: 'border-warning-100 bg-warning-50 text-warning-700',
    info: 'border-info-100 bg-info-50 text-info-700',
    success: 'border-success-100 bg-success-50 text-success-700',
  }[tone];
  return (
    <div className={cx('rounded-lg border px-3 py-2', styles)}>
      <p className="tnum text-lg font-semibold leading-none">{count}</p>
      <p className="mt-1 text-2xs font-medium uppercase tracking-wide">{label}</p>
    </div>
  );
};

const Metric = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div>
    <p className="text-xs text-faint">{label}</p>
    <p className="tnum mt-0.5 text-lg font-semibold">{value}</p>
    {hint ? <p className="mt-0.5 text-2xs text-faint">{hint}</p> : null}
  </div>
);

/* ------------------------------------------------------------ approvals */

const ApprovalQueue = () => {
  const { db, employee, can } = useApp();
  const navigate = useNavigate();
  const { decideTimeOff, decideTimecard } = useActions();

  const teamIds = useMemo(() => {
    const ids = new Set<string>();
    const walk = (id: string) => {
      for (const e of db.employees.filter((x) => x.managerId === id)) {
        if (ids.has(e.id)) continue;
        ids.add(e.id);
        walk(e.id);
      }
    };
    if (employee) walk(employee.id);
    return ids;
  }, [db.employees, employee]);

  const scopeAll = can('pto.view.all');
  const inScope = (id: string) => scopeAll || teamIds.has(id);

  const ptoPending = db.ptoRequests.filter((r) => r.status === 'pending' && inScope(r.employeeId)).slice(0, 4);
  const tcPending = db.timecards.filter((t) => t.status === 'submitted' && inScope(t.employeeId)).slice(0, 4);
  const expPending = db.expenseReports.filter((r) => r.status === 'submitted' && (scopeAll || r.managerId === employee?.id)).slice(0, 3);
  const total = ptoPending.length + tcPending.length + expPending.length;

  const nameOf = (id: string) => {
    const e = db.employees.find((x) => x.id === id);
    return e ? `${e.preferredName} ${e.lastName}` : 'Unknown';
  };

  return (
    <Card>
      <CardHeader
        title="Waiting on you"
        subtitle={total ? `${pluralize(total, 'item')} need a decision` : 'Nothing is waiting for your approval'}
        icon={ClipboardCheck}
        actions={<Badge tone={total ? 'warning' : 'success'}>{total}</Badge>}
      />
      {total === 0 ? (
        <EmptyState compact icon={CheckCircle2} title="Queue is clear" body="Approvals you owe your team will appear here." />
      ) : (
        <ul className="divide-y divide-line">
          {tcPending.map((tc) => {
            const emp = db.employees.find((e) => e.id === tc.employeeId);
            return (
              <li key={tc.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                {emp ? <Avatar first={emp.firstName} last={emp.lastName} seed={emp.avatarSeed} size={32} /> : null}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Timecard · {nameOf(tc.employeeId)}</p>
                  <p className="text-xs text-muted">
                    {fmtDateShort(tc.periodStart)} – {fmtDateShort(tc.periodEnd)} · {num(tc.totalRegular + tc.totalOvertime, 2)}h
                    {tc.totalOvertime > 0 ? <span className="text-warning-600"> · {num(tc.totalOvertime, 2)}h OT</span> : null}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="xs" onClick={() => decideTimecard(tc.id, false, 'Please review your punches.')}>Return</Button>
                  <Button size="xs" variant="primary" onClick={() => decideTimecard(tc.id, true)}>Approve</Button>
                </div>
              </li>
            );
          })}
          {ptoPending.map((r) => {
            const emp = db.employees.find((e) => e.id === r.employeeId);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                {emp ? <Avatar first={emp.firstName} last={emp.lastName} seed={emp.avatarSeed} size={32} /> : null}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    Time off · {nameOf(r.employeeId)}
                    {r.flags.length ? <Badge tone="warning" className="ml-2">{r.flags[0]}</Badge> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {num(r.hours)}h {r.kind.replace(/_/g, ' ')} · {fmtDateShort(r.startDate)} – {fmtDateShort(r.endDate)}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="xs" onClick={() => decideTimeOff(r.id, false, 'Coverage conflict.')}>Deny</Button>
                  <Button size="xs" variant="primary" onClick={() => decideTimeOff(r.id, true)}>Approve</Button>
                </div>
              </li>
            );
          })}
          {expPending.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50 text-teal-700"><Wallet className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Expenses · {nameOf(r.employeeId)}</p>
                <p className="text-xs text-muted">{r.title} · {currency(r.total)}</p>
              </div>
              <Button size="xs" variant="primary" onClick={() => navigate(`/expenses/${r.id}`)}>Review</Button>
            </li>
          ))}
        </ul>
      )}
      {total > 0 ? (
        <div className="mt-3 flex gap-2 border-t border-line pt-3">
          <Button size="xs" variant="ghost" onClick={() => navigate('/time?tab=approvals')}>All timecards</Button>
          <Button size="xs" variant="ghost" onClick={() => navigate('/time-off?tab=approvals')}>All time off</Button>
          <Button size="xs" variant="ghost" onClick={() => navigate('/expenses?tab=approvals')}>All expenses</Button>
        </div>
      ) : null}
    </Card>
  );
};

/* -------------------------------------------------------------- people */

const WorkforcePulse = () => {
  const { db, today } = useApp();
  const navigate = useNavigate();
  const stats = headcountStats(db, today);
  const out = whoIsOut(db, today);
  const depts = departmentHeadcount(db).slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active employees" value={num(stats.active)} icon={Users} hint={`${stats.onLeave} on leave · ${stats.pending} pre-start`} onClick={() => navigate('/people')} />
        <StatTile label="Hires this year" value={num(stats.hiresYtd)} icon={TrendingUp} tone="teal" hint={`${stats.newHires90} in the last 90 days`} />
        <StatTile label="12-month turnover" value={`${stats.turnover.toFixed(1)}%`} icon={ArrowUpRight} tone={stats.turnover > 18 ? 'warning' : 'success'} hint={`${stats.voluntary} voluntary · ${stats.involuntary} involuntary`} />
        <StatTile label="Out today" value={num(out.length)} icon={Plane} tone="accent" hint={out.length ? out.slice(0, 2).map((r) => db.employees.find((e) => e.id === r.employeeId)?.lastName).join(', ') : 'Full attendance'} />
      </div>

      <Card>
        <CardHeader title="Headcount by department" subtitle="Active employees" icon={Users}
          actions={<Button size="xs" variant="ghost" onClick={() => navigate('/analytics')}>Analytics</Button>} />
        <HBarList data={depts} format={(n) => num(n)} onSelect={() => navigate('/people')} />
      </Card>
    </div>
  );
};

const LaborTrend = () => {
  const { db } = useApp();
  const history = payrollHistory(db, 8);
  if (history.length < 2) return null;
  return (
    <Card>
      <CardHeader title="Labor cost trend" subtitle="Gross pay and fully-loaded employer cost by month" icon={TrendingUp} />
      <LineChart
        area
        categories={history.map((h) => h.month.slice(5) + '/' + h.month.slice(2, 4))}
        series={[
          { key: 'gross', label: 'Gross pay', values: history.map((h) => h.gross) },
          { key: 'cost', label: 'Employer cost', values: history.map((h) => h.cost) },
        ]}
        format={(n) => currency(n, { compact: true, cents: false })}
        height={230}
      />
    </Card>
  );
};

/* --------------------------------------------------------------- tasks */

const MyTasks = () => {
  const { db, user, today } = useApp();
  const navigate = useNavigate();
  const tasks = user ? openTasksFor(db, user.id).slice(0, 6) : [];

  return (
    <Card>
      <CardHeader
        title="My tasks" subtitle={tasks.length ? `${pluralize(tasks.length, 'open task')}` : 'No open tasks'}
        icon={ClipboardCheck}
        actions={tasks.length ? <Badge tone="brand">{tasks.length}</Badge> : null}
      />
      {tasks.length === 0 ? (
        <EmptyState compact icon={CheckCircle2} title="Nothing on your plate" body="Assigned work, approvals and reminders land here." />
      ) : (
        <ul className="divide-y divide-line">
          {tasks.map((t) => {
            const overdue = t.dueDate < today;
            return (
              <li key={t.id}>
                <button
                  onClick={() => t.actionPath && navigate(t.actionPath)}
                  className="flex w-full items-start gap-3 py-3 text-left transition-colors hover:bg-sunken/60"
                >
                  <span className={cx('mt-1 h-2 w-2 shrink-0 rounded-full',
                    t.priority === 'urgent' ? 'bg-danger-500' : t.priority === 'high' ? 'bg-warning-500' : 'bg-brand-500')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted">{t.detail}</span>
                  </span>
                  <span className={cx('shrink-0 text-xs', overdue ? 'font-medium text-danger-600' : 'text-faint')}>
                    {overdue ? `${Math.abs(diffDays(today, t.dueDate))}d overdue` : `due ${fmtDateShort(t.dueDate)}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

const Announcements = () => {
  const { db } = useApp();
  const items = [...db.announcements].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt)).slice(0, 3);
  return (
    <Card>
      <CardHeader title="Company announcements" icon={Megaphone} />
      <ul className="space-y-4">
        {items.map((a) => {
          const author = db.employees.find((e) => e.id === a.authorId);
          return (
            <li key={a.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-medium">{a.title}</h4>
                {a.pinned ? <Badge tone="accent">Pinned</Badge> : null}
                <Badge tone={a.category === 'urgent' ? 'danger' : 'neutral'}>{a.category}</Badge>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{a.body}</p>
              <p className="mt-2 text-2xs text-faint">
                {author ? `${author.preferredName} ${author.lastName}` : 'People Operations'} · {timeAgo(a.publishedAt)}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

/* ------------------------------------------------------------ side rail */

const MySchedule = () => {
  const { db, employee, today } = useApp();
  const navigate = useNavigate();
  const shifts = employee ? upcomingShifts(db, employee.id, today, 10).slice(0, 4) : [];

  return (
    <Card>
      <CardHeader title="My schedule" subtitle="Next shifts" icon={CalendarClock}
        actions={<Button size="xs" variant="ghost" onClick={() => navigate('/scheduling')}>View all</Button>} />
      {shifts.length === 0 ? (
        <EmptyState compact icon={CalendarClock} title="No upcoming shifts" body="Your published schedule will appear here." />
      ) : (
        <ul className="space-y-2.5">
          {shifts.map((s) => {
            const isToday = s.date === today;
            const loc = db.locations.find((l) => l.id === s.locationId);
            return (
              <li key={s.id} className={cx('flex items-center gap-3 rounded-lg border p-2.5',
                isToday ? 'border-brand-200 bg-brand-50/60' : 'border-line')}>
                <div className="w-11 shrink-0 text-center">
                  <p className="text-2xs font-medium uppercase text-faint">{fmtDateShort(s.date).split(' ')[0]}</p>
                  <p className="tnum text-base font-semibold leading-tight">{parseISO(s.date).getDate()}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{fmtTime(s.start)} – {fmtTime(s.end)}</p>
                  <p className="truncate text-xs text-muted">{s.role} · {loc?.code}</p>
                </div>
                {isToday ? <Badge tone="brand">Today</Badge> : <StatusBadge status={s.status} />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

const PtoCard = () => {
  const { db, employee } = useApp();
  const navigate = useNavigate();
  const summary = employee ? ptoSummary(db, employee.id) : [];
  const upcoming = db.ptoRequests
    .filter((r) => r.employeeId === employee?.id && r.status !== 'cancelled' && r.endDate >= db.meta.today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  return (
    <Card>
      <CardHeader title="Time off" icon={Plane}
        actions={<Button size="xs" variant="primary" onClick={() => navigate('/time-off?compose=1')}>Request</Button>} />
      <ul className="space-y-3">
        {summary.map((s) => (
          <li key={s.kind}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs capitalize text-muted">{s.kind}</span>
              {s.unlimited ? (
                <span className="text-sm font-semibold text-teal-700">Flexible</span>
              ) : (
                <span className="tnum text-sm font-semibold">{num(s.available, 1)}<span className="text-xs font-normal text-faint">h available</span></span>
              )}
            </div>
            {s.unlimited ? null : (
              <Progress className="mt-1" value={s.accrued ? ((s.accrued - s.available) / s.accrued) * 100 : 0} tone={s.available < 8 ? 'warning' : 'teal'} size="sm" />
            )}
            <p className="mt-1 text-2xs text-faint">
              {s.unlimited
                ? `${num(s.used, 1)}h taken this year · no fixed accrual`
                : `${num(s.accrued, 1)}h accrued · ${num(s.used, 1)}h used${s.pending ? ` · ${num(s.pending, 1)}h pending` : ''}`}
            </p>
          </li>
        ))}
      </ul>
      {upcoming ? (
        <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-2.5">
          <p className="text-xs font-medium text-teal-800">
            Upcoming: {fmtDateShort(upcoming.startDate)} – {fmtDateShort(upcoming.endDate)}
          </p>
          <p className="mt-0.5 text-2xs text-teal-700">
            {num(upcoming.hours)}h {upcoming.kind.replace(/_/g, ' ')} · {upcoming.status}
          </p>
        </div>
      ) : null}
    </Card>
  );
};

const PayCard = () => {
  const { db, employee } = useApp();
  const navigate = useNavigate();
  const check = employee ? latestPaycheck(db, employee.id) : undefined;
  const history = useMemo(
    () => db.paychecks
      .filter((c) => c.employeeId === employee?.id && c.status !== 'voided')
      .sort((a, b) => a.checkDate.localeCompare(b.checkDate))
      .slice(-8)
      .map((c) => c.netPay),
    [db.paychecks, employee],
  );

  return (
    <Card>
      <CardHeader title="My pay" icon={Wallet}
        actions={<Button size="xs" variant="ghost" onClick={() => navigate('/payroll')}>History</Button>} />
      {!check ? (
        <EmptyState compact icon={Wallet} title="No pay statements yet" body="Your first statement appears after your first pay date." />
      ) : (
        <>
          <p className="text-xs text-faint">Most recent net pay · {fmtDate(check.checkDate)}</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="tnum text-2xl font-semibold tracking-[-0.02em]">{currency(check.netPay)}</p>
            {history.length > 2 ? <Sparkline values={history} /> : null}
          </div>
          <dl className="mt-4 space-y-2 border-t border-line pt-3 text-xs">
            <div className="flex justify-between"><dt className="text-muted">Gross</dt><dd className="tnum font-medium">{currency(check.grossPay)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Taxes</dt><dd className="tnum font-medium text-danger-600">−{currency(check.taxes.reduce((s, t) => s + t.amount, 0))}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Deductions</dt><dd className="tnum font-medium text-danger-600">−{currency(check.deductions.reduce((s, d) => s + d.amount, 0))}</dd></div>
            <div className="flex justify-between border-t border-line pt-2"><dt className="text-muted">YTD gross</dt><dd className="tnum font-medium">{currency(check.ytdGross, { cents: false })}</dd></div>
          </dl>
        </>
      )}
    </Card>
  );
};

const PipelineCard = () => {
  const { db } = useApp();
  const navigate = useNavigate();
  const funnel = recruitingFunnel(db);
  const openReqs = db.requisitions.filter((r) => r.status === 'open');
  return (
    <Card>
      <CardHeader title="Hiring pipeline" subtitle={`${openReqs.length} open requisitions`} icon={Target}
        actions={<Button size="xs" variant="ghost" onClick={() => navigate('/recruiting')}>Open</Button>} />
      <BarChart
        categories={funnel.map((f) => f.label)}
        series={[{ key: 'count', label: 'Candidates', values: funnel.map((f) => f.value) }]}
        height={150}
        labelEvery={1}
      />
    </Card>
  );
};

const ActionItems = () => {
  const { db, employee, today } = useApp();
  const navigate = useNavigate();
  const sigs = employee ? pendingSignaturesFor(db, employee.id) : [];
  const training = employee ? trainingFor(db, employee.id).filter((t) => t.status !== 'completed' && t.status !== 'waived') : [];
  const packet = employee?.onboardingPacketId
    ? db.onboardingTasks.filter((t) => t.packetId === employee.onboardingPacketId && t.owner === 'employee' && t.status !== 'completed')
    : [];

  if (!sigs.length && !training.length && !packet.length) return null;

  return (
    <Card>
      <CardHeader title="Action required" icon={Bell} />
      <ul className="space-y-2.5">
        {packet.length ? (
          <li>
            <button onClick={() => navigate('/onboarding')} className="flex w-full items-center gap-3 rounded-lg border border-brand-200 bg-brand-50/50 p-2.5 text-left transition-colors hover:bg-brand-50">
              <Zap className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Finish onboarding</span>
                <span className="block text-xs text-muted">{pluralize(packet.length, 'step')} remaining</span>
              </span>
            </button>
          </li>
        ) : null}
        {sigs.slice(0, 2).map((s) => (
          <li key={s.id}>
            <button onClick={() => navigate(`/documents/sign/${s.id}`)} className="flex w-full items-center gap-3 rounded-lg border border-line p-2.5 text-left transition-colors hover:bg-sunken">
              <FileSignature className={cx('h-4 w-4 shrink-0', s.dueDate < today ? 'text-danger-500' : 'text-brand-600')} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.documentName}</span>
                <span className="block text-xs text-muted">
                  {s.dueDate < today ? `Overdue since ${fmtDateShort(s.dueDate)}` : `Signature due ${fmtDateShort(s.dueDate)}`}
                </span>
              </span>
            </button>
          </li>
        ))}
        {training.slice(0, 2).map((t) => {
          const course = db.courses.find((c) => c.id === t.courseId);
          return (
            <li key={t.id}>
              <button onClick={() => navigate('/learning')} className="flex w-full items-center gap-3 rounded-lg border border-line p-2.5 text-left transition-colors hover:bg-sunken">
                <GraduationCap className={cx('h-4 w-4 shrink-0', t.status === 'overdue' ? 'text-danger-500' : 'text-teal-600')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{course?.title}</span>
                  <span className="block text-xs text-muted">
                    {t.status === 'overdue' ? 'Overdue' : `Due ${fmtDateShort(t.dueDate)}`} · {t.progressPercent}% complete
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

const GoalsCard = () => {
  const { db, employee } = useApp();
  const navigate = useNavigate();
  const goals = employee ? goalsFor(db, employee.id).slice(0, 3) : [];
  if (!goals.length) return null;
  return (
    <Card>
      <CardHeader title="My goals" icon={Target}
        actions={<Button size="xs" variant="ghost" onClick={() => navigate('/performance')}>Open</Button>} />
      <ul className="space-y-3.5">
        {goals.map((g) => (
          <li key={g.id}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium leading-snug">{g.title}</p>
              <StatusBadge status={g.status} />
            </div>
            <Progress
              className="mt-1.5"
              value={g.target ? (g.current / g.target) * 100 : 0}
              tone={g.status === 'completed' ? 'success' : g.status === 'behind' ? 'danger' : g.status === 'at_risk' ? 'warning' : 'brand'}
              showValue
            />
            <p className="mt-1 text-2xs text-faint">{num(g.current, 1)} of {num(g.target, 1)} {g.unit}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
};
