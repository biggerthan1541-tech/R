import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Plane, Plus, Settings2, X,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Column, DataTable, EmptyState, Field,
  Input, KeyValue, Modal, PermissionDenied, Progress, SectionHeader, Select, StatusBadge,
  Tabs, Textarea, cx,
} from '@/components/ui';
import { DonutChart } from '@/components/charts';
import { useApp, useLookups } from '@/lib/store';
import { useActions, ptoAvailable } from '@/lib/actions';
import { ptoSummary, whoIsOut } from '@/lib/selectors';
import { num } from '@/lib/format';
import {
  DOW, addDays, addMonths, dayOfWeek, diffDays, endOfMonth, fmtDate, fmtDateShort,
  fmtMonthYear, isWeekend, parseISO, rangeDays, startOfMonth, startOfWeek,
} from '@/lib/dates';
import type { PtoKind, PtoRequest } from '@/lib/types';

const KINDS: PtoKind[] = ['vacation', 'sick', 'personal', 'bereavement', 'jury_duty', 'parental', 'unpaid'];

export const TimeOffPage = () => {
  const { db, can, employee, visibleIds } = useApp();
  const [params, setParams] = useSearchParams();
  const { requestId } = useParams();
  const [composing, setComposing] = useState(params.get('compose') === '1');
  const tab = params.get('tab') ?? (requestId ? 'approvals' : 'mine');

  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    next.delete('compose');
    setParams(next, { replace: true });
  };

  if (!can('pto.request', 'pto.view.team', 'pto.view.all')) {
    return <PermissionDenied what="time off" />;
  }

  const scope = visibleIds('pto');
  const pending = db.ptoRequests.filter((r) => r.status === 'pending' && scope.has(r.employeeId) && r.employeeId !== employee?.id);

  const tabs = [
    { id: 'mine', label: 'My time off', icon: Plane },
    ...(can('pto.approve') ? [{ id: 'approvals', label: 'Approvals', count: pending.length, icon: Check }] : []),
    ...(can('pto.view.team', 'pto.view.all') ? [{ id: 'calendar', label: 'Team calendar', icon: CalendarDays }] : []),
    ...(can('pto.policy.manage') ? [{ id: 'policies', label: 'Policies', icon: Settings2 }] : []),
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Time Off"
        subtitle="Balances accrue automatically, approvals post to the timecard, and paid leave flows into payroll."
        actions={can('pto.request') ? <Button variant="primary" icon={Plus} onClick={() => setComposing(true)}>Request time off</Button> : null}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'mine' ? <MyTimeOff /> : null}
      {tab === 'approvals' ? <Approvals focusId={requestId} /> : null}
      {tab === 'calendar' ? <TeamCalendar /> : null}
      {tab === 'policies' ? <Policies /> : null}

      <RequestModal open={composing} onClose={() => setComposing(false)} />
    </div>
  );
};

/* ------------------------------------------------------------- my view */

const MyTimeOff = () => {
  const { db, employee, today } = useApp();
  const { cancelTimeOff } = useActions();
  if (!employee) return null;

  const summary = ptoSummary(db, employee.id);
  const requests = db.ptoRequests.filter((r) => r.employeeId === employee.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const policy = db.ptoPolicies.find((p) => p.id === employee.ptoPolicyId);
  const upcoming = requests.filter((r) => r.status === 'approved' && r.endDate >= today);
  const holidays = db.holidays.filter((h) => h.date >= today).slice(0, 4);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <div className="grid gap-4 sm:grid-cols-3">
          {summary.map((s) => (
            <Card key={s.kind}>
              <p className="text-xs capitalize text-faint">{s.kind}</p>
              <p className="tnum mt-1 text-2xl font-semibold">{num(s.available, 1)}<span className="text-sm font-normal text-muted">h</span></p>
              <Progress className="mt-2" size="sm" tone={s.available < 8 ? 'warning' : 'teal'}
                value={s.accrued ? ((s.accrued - s.available) / s.accrued) * 100 : 0} />
              <p className="mt-1.5 text-2xs text-faint">
                {num(s.accrued, 1)}h accrued · {num(s.used, 1)}h used{s.pending ? ` · ${num(s.pending, 1)}h pending` : ''}
              </p>
            </Card>
          ))}
        </div>

        <Card padded={false}>
          <div className="p-4 sm:p-5"><CardHeader title="My requests" dense icon={Plane} /></div>
          {requests.length === 0 ? (
            <EmptyState icon={Plane} title="No time-off requests yet" body="Submit a request and it routes to your manager for approval." />
          ) : (
            <ul className="divide-y divide-line">
              {requests.slice(0, 15).map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{fmtDate(r.startDate)}{r.startDate !== r.endDate ? ` – ${fmtDate(r.endDate)}` : ''}</p>
                      <Badge tone="neutral" className="capitalize">{r.kind.replace(/_/g, ' ')}</Badge>
                      <span className="tnum text-xs text-muted">{num(r.hours, 1)}h</span>
                    </div>
                    {r.note ? <p className="mt-1 text-xs text-muted">{r.note}</p> : null}
                    {r.flags.map((f) => <p key={f} className="mt-1 text-xs text-warning-700">⚠ {f}</p>)}
                    {r.decisionNote ? <p className="mt-1 text-xs text-faint">Manager: {r.decisionNote}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    {(r.status === 'pending' || (r.status === 'approved' && r.startDate > today)) ? (
                      <Button size="xs" onClick={() => cancelTimeOff(r.id)}>Cancel</Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-5">
        {upcoming.length ? (
          <Card>
            <CardHeader title="Approved and upcoming" dense icon={Check} />
            <ul className="space-y-2">
              {upcoming.map((r) => (
                <li key={r.id} className="rounded-lg border border-teal-200 bg-teal-50 p-2.5">
                  <p className="text-sm font-medium text-teal-900">{fmtDateShort(r.startDate)} – {fmtDateShort(r.endDate)}</p>
                  <p className="text-xs capitalize text-teal-700">{r.kind.replace(/_/g, ' ')} · {num(r.hours, 1)}h · in {diffDays(today, r.startDate)} days</p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Upcoming company holidays" dense icon={CalendarDays} />
          <ul className="space-y-2">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-ink">{h.name}</span>
                <span className="text-muted">{fmtDateShort(h.date)}</span>
              </li>
            ))}
          </ul>
        </Card>

        {policy ? (
          <Card>
            <CardHeader title="Your policy" dense icon={Settings2} />
            <p className="text-sm font-medium">{policy.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{policy.description}</p>
            <KeyValue className="mt-3" columns={1} items={[
              { label: 'Accrual method', value: policy.accrualMethod.replace(/_/g, ' ') },
              { label: 'Annual grant', value: policy.hoursPerYear ? `${policy.hoursPerYear} hours` : 'Unlimited' },
              { label: 'Carryover cap', value: `${policy.maxCarryoverHours} hours` },
              { label: 'Notice required', value: `${policy.minNoticeDays} days` },
              { label: 'Approval', value: policy.requiresApproval ? 'Manager approval required' : 'Notification only' },
            ]} />
          </Card>
        ) : null}
      </div>
    </div>
  );
};

/* ----------------------------------------------------------- approvals */

const Approvals = ({ focusId }: { focusId?: string }) => {
  const { db, visibleIds, employee } = useApp();
  const { decideTimeOff } = useActions();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PtoRequest | null>(
    () => (focusId ? db.ptoRequests.find((r) => r.id === focusId) ?? null : null),
  );
  const [note, setNote] = useState('');
  const [denying, setDenying] = useState<PtoRequest | null>(null);

  const scope = visibleIds('pto');
  const rows = db.ptoRequests
    .filter((r) => scope.has(r.employeeId) && r.employeeId !== employee?.id)
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const columns: Column<PtoRequest>[] = [
    {
      key: 'employee', header: 'Employee', sortValue: (r) => lookups.employee.get(r.employeeId)?.lastName ?? '',
      render: (r) => {
        const e = lookups.employee.get(r.employeeId);
        return e ? (
          <button className="flex items-center gap-2.5 text-left" onClick={() => navigate(`/people/${e.id}`)}>
            <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={28} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{e.preferredName} {e.lastName}</span>
              <span className="block truncate text-xs text-muted">{lookups.jobTitle.get(e.jobTitleId)?.name}</span>
            </span>
          </button>
        ) : '—';
      },
    },
    { key: 'dates', header: 'Dates', sortValue: (r) => r.startDate, render: (r) => <span className="text-sm">{fmtDateShort(r.startDate)} – {fmtDateShort(r.endDate)}</span> },
    { key: 'kind', header: 'Type', hideBelow: 'sm', sortValue: (r) => r.kind, render: (r) => <span className="text-sm capitalize">{r.kind.replace(/_/g, ' ')}</span> },
    { key: 'hours', header: 'Hours', align: 'right', sortValue: (r) => r.hours, render: (r) => num(r.hours, 1) },
    {
      key: 'balance', header: 'Balance after', align: 'right', hideBelow: 'md',
      render: (r) => {
        const avail = ptoAvailable(db, r.employeeId, r.kind);
        const after = avail;
        return <span className={cx('text-sm', after < 0 && 'font-medium text-danger-600')}>{num(after, 1)}h</span>;
      },
    },
    {
      key: 'flags', header: 'Flags', hideBelow: 'md',
      render: (r) => r.flags.length
        ? <div className="flex flex-wrap gap-1">{r.flags.map((f) => <Badge key={f} tone="warning">{f}</Badge>)}</div>
        : <Badge tone="success">Clean</Badge>,
    },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <span className="flex justify-end gap-1.5">
          <Button size="xs" onClick={() => setDetail(r)}>Details</Button>
          <Button size="xs" variant="ghost" icon={X} onClick={() => setDenying(r)} aria-label="Deny" />
          <Button size="xs" variant="primary" icon={Check} onClick={() => decideTimeOff(r.id, true)} aria-label="Approve" />
        </span>
      ),
    },
  ];

  return (
    <>
      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader title="Requests awaiting your decision" dense icon={Check}
            subtitle={rows.length ? `${rows.length} pending` : 'Nothing pending'} />
        </div>
        <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} pageSize={12}
          empty={<EmptyState icon={Check} title="No pending requests" body="Time-off requests from your team appear here." />} />
      </Card>

      <Modal
        open={Boolean(detail)} onClose={() => setDetail(null)} title="Time-off request" icon={Plane}
        subtitle={detail ? `${fmtDate(detail.startDate)} – ${fmtDate(detail.endDate)}` : ''}
        footer={detail ? (
          <>
            <Button onClick={() => { setDenying(detail); setDetail(null); }}>Deny</Button>
            <Button variant="primary" onClick={() => { decideTimeOff(detail.id, true); setDetail(null); }}>Approve</Button>
          </>
        ) : null}
      >
        {detail ? <RequestDetail request={detail} /> : null}
      </Modal>

      <Modal
        open={Boolean(denying)} onClose={() => setDenying(null)} title="Deny time-off request" icon={X}
        footer={
          <>
            <Button onClick={() => setDenying(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (denying) decideTimeOff(denying.id, false, note); setDenying(null); setNote(''); }}>
              Deny request
            </Button>
          </>
        }
      >
        <Field label="Reason (shared with the employee)" required>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Two team members are already out that week." />
        </Field>
      </Modal>
    </>
  );
};

const RequestDetail = ({ request }: { request: PtoRequest }) => {
  const { db, today } = useApp();
  const lookups = useLookups();
  const emp = lookups.employee.get(request.employeeId);
  const balance = ptoAvailable(db, request.employeeId, request.kind);
  const overlapping = db.ptoRequests.filter(
    (r) => r.id !== request.id && r.status === 'approved' &&
      lookups.employee.get(r.employeeId)?.departmentId === emp?.departmentId &&
      r.startDate <= request.endDate && r.endDate >= request.startDate,
  );

  return (
    <div className="space-y-4">
      {emp ? (
        <div className="flex items-center gap-3">
          <Avatar first={emp.firstName} last={emp.lastName} seed={emp.avatarSeed} size={40} />
          <div>
            <p className="text-sm font-medium">{emp.firstName} {emp.lastName}</p>
            <p className="text-xs text-muted">{lookups.jobTitle.get(emp.jobTitleId)?.name} · {lookups.department.get(emp.departmentId)?.name}</p>
          </div>
        </div>
      ) : null}

      <KeyValue items={[
        { label: 'Type', value: <span className="capitalize">{request.kind.replace(/_/g, ' ')}</span> },
        { label: 'Hours requested', value: `${num(request.hours, 1)}h` },
        { label: 'Available balance', value: <span className={balance < request.hours ? 'text-danger-600 font-medium' : ''}>{num(balance, 1)}h</span> },
        { label: 'Notice given', value: `${diffDays(request.createdAt.slice(0, 10), request.startDate)} days` },
        { label: 'Submitted', value: fmtDate(request.createdAt.slice(0, 10)) },
        { label: 'Starts in', value: `${diffDays(today, request.startDate)} days` },
      ]} />

      {request.note ? (
        <div className="well p-3">
          <p className="text-2xs font-medium uppercase tracking-wide text-faint">Employee note</p>
          <p className="mt-1 text-sm">{request.note}</p>
        </div>
      ) : null}

      {request.flags.length ? (
        <Alert tone="warning" icon={AlertTriangle} title="Policy flags">
          <ul className="list-disc pl-4">{request.flags.map((f) => <li key={f}>{f}</li>)}</ul>
        </Alert>
      ) : null}

      {overlapping.length ? (
        <Alert tone="info" title={`${overlapping.length} teammate(s) already off during this window`}>
          {overlapping.slice(0, 4).map((r) => {
            const e = lookups.employee.get(r.employeeId);
            return <p key={r.id}>{e?.preferredName} {e?.lastName} · {fmtDateShort(r.startDate)} – {fmtDateShort(r.endDate)}</p>;
          })}
        </Alert>
      ) : (
        <Alert tone="success" title="No coverage conflicts">Nobody else in the department is scheduled off during this window.</Alert>
      )}
    </div>
  );
};

/* ------------------------------------------------------ team calendar */

const TeamCalendar = () => {
  const { db, visibleIds, today } = useApp();
  const lookups = useLookups();
  const [month, setMonth] = useState(startOfMonth(today));
  const scope = visibleIds('pto');

  const days = rangeDays(startOfWeek(startOfMonth(month), 0), addDays(startOfWeek(endOfMonth(month), 0), 6));
  const holidays = new Map(db.holidays.map((h) => [h.date, h.name] as const));

  const requestsOn = (date: string) =>
    db.ptoRequests.filter((r) => r.status === 'approved' && scope.has(r.employeeId) && r.startDate <= date && r.endDate >= date);

  const monthRequests = db.ptoRequests.filter(
    (r) => scope.has(r.employeeId) && r.status === 'approved' &&
      r.startDate <= endOfMonth(month) && r.endDate >= startOfMonth(month),
  );

  const byKind = KINDS
    .map((k) => ({ label: k.replace(/_/g, ' '), value: monthRequests.filter((r) => r.kind === k).reduce((s, r) => s + r.hours, 0) }))
    .filter((k) => k.value > 0);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
      <Card padded={false}>
        <div className="flex items-center justify-between gap-2 border-b border-line p-3">
          <Button size="sm" icon={ChevronLeft} onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month" />
          <p className="text-sm font-semibold">{fmtMonthYear(month)}</p>
          <Button size="sm" iconRight={ChevronRight} onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month" />
        </div>
        <div className="grid grid-cols-7 gap-px bg-line p-px">
          {DOW.map((d) => (
            <div key={d} className="bg-sunken px-2 py-1.5 text-center text-2xs font-semibold uppercase tracking-wider text-faint">{d}</div>
          ))}
          {days.map((d) => {
            const outside = d.slice(0, 7) !== month.slice(0, 7);
            const off = requestsOn(d);
            const holiday = holidays.get(d);
            return (
              <div key={d} className={cx('min-h-[5.5rem] bg-surface p-1.5',
                outside && 'opacity-40', d === today && 'ring-1 ring-inset ring-brand-400', isWeekend(d) && 'bg-sunken/40')}>
                <div className="flex items-center justify-between">
                  <span className={cx('tnum text-xs', d === today ? 'font-semibold text-brand-700' : 'text-muted')}>{parseISO(d).getDate()}</span>
                  {off.length > 2 ? <span className="text-2xs text-faint">{off.length}</span> : null}
                </div>
                {holiday ? <p className="mt-0.5 truncate rounded bg-accent-50 px-1 text-2xs text-accent-800">{holiday}</p> : null}
                <ul className="mt-1 space-y-0.5">
                  {off.slice(0, 3).map((r) => {
                    const e = lookups.employee.get(r.employeeId);
                    return (
                      <li key={r.id} className="truncate rounded bg-teal-50 px-1 text-2xs text-teal-800" title={`${e?.firstName} ${e?.lastName} · ${r.kind}`}>
                        {e?.preferredName} {e?.lastName?.[0]}.
                      </li>
                    );
                  })}
                  {off.length > 3 ? <li className="px-1 text-2xs text-faint">+{off.length - 3} more</li> : null}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Out today" dense icon={Plane} />
          {whoIsOut(db, today, scope).length === 0 ? (
            <p className="text-xs text-muted">Everyone is scheduled in today.</p>
          ) : (
            <ul className="space-y-2">
              {whoIsOut(db, today, scope).map((r) => {
                const e = lookups.employee.get(r.employeeId);
                return e ? (
                  <li key={r.id} className="flex items-center gap-2.5">
                    <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={26} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{e.preferredName} {e.lastName}</p>
                      <p className="truncate text-2xs capitalize text-muted">{r.kind.replace(/_/g, ' ')} · back {fmtDateShort(addDays(r.endDate, 1))}</p>
                    </div>
                  </li>
                ) : null;
              })}
            </ul>
          )}
        </Card>

        {byKind.length ? (
          <Card>
            <CardHeader title="Leave mix this month" dense />
            <DonutChart data={byKind} centerLabel="hours" centerValue={num(byKind.reduce((s, k) => s + k.value, 0), 0)} format={(n) => `${num(n, 0)}h`} size={140} />
          </Card>
        ) : null}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------ policies */

const Policies = () => {
  const { db } = useApp();
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {db.ptoPolicies.map((p) => (
          <Card key={p.id}>
            <CardHeader title={p.name} subtitle={p.description} icon={Settings2}
              actions={<Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Active' : 'Inactive'}</Badge>} />
            <KeyValue items={[
              { label: 'Accrual method', value: p.accrualMethod.replace(/_/g, ' ') },
              { label: 'Annual hours', value: p.hoursPerYear ? `${p.hoursPerYear}h` : 'Unlimited' },
              { label: 'Carryover cap', value: `${p.maxCarryoverHours}h` },
              { label: 'Maximum balance', value: p.maxBalanceHours ? `${p.maxBalanceHours}h` : '—' },
              { label: 'Waiting period', value: `${p.waitingPeriodDays} days` },
              { label: 'Minimum notice', value: `${p.minNoticeDays} days` },
              { label: 'Negative balances', value: p.allowNegative ? 'Allowed' : 'Not allowed' },
              { label: 'Employees', value: num(db.employees.filter((e) => e.ptoPolicyId === p.id && e.status === 'active').length) },
            ]} />
            <div className="mt-3 flex flex-wrap gap-1">
              {p.kinds.map((k) => <Badge key={k} tone="neutral" className="capitalize">{k.replace(/_/g, ' ')}</Badge>)}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card padded={false}>
          <div className="p-4 sm:p-5"><CardHeader title="Holiday calendar" dense icon={CalendarDays} /></div>
          <ul className="divide-y divide-line">
            {db.holidays.filter((h) => h.date.slice(0, 4) === db.meta.today.slice(0, 4)).map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                <span className="text-sm">{h.name}</span>
                <span className="text-xs text-muted">{fmtDate(h.date)} · {DOW[dayOfWeek(h.date)]}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card padded={false}>
          <div className="p-4 sm:p-5"><CardHeader title="Blackout periods" dense icon={AlertTriangle} subtitle="Requests overlapping these windows are flagged" /></div>
          <ul className="divide-y divide-line">
            {db.blackouts.map((b) => (
              <li key={b.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{b.name}</p>
                  <span className="text-xs text-muted">{fmtDateShort(b.startDate)} – {fmtDateShort(b.endDate)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{b.reason}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {b.departmentIds.map((d) => (
                    <Badge key={d} tone="neutral">{db.departments.find((x) => x.id === d)?.name}</Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
};

/* --------------------------------------------------------- request UI */

const RequestModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { db, employee, today } = useApp();
  const { requestTimeOff } = useActions();
  const [kind, setKind] = useState<PtoKind>('vacation');
  const [startDate, setStartDate] = useState(addDays(today, 7));
  const [endDate, setEndDate] = useState(addDays(today, 7));
  const [partial, setPartial] = useState(false);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [note, setNote] = useState('');

  const holidays = useMemo(() => new Set(db.holidays.map((h) => h.date)), [db.holidays]);
  const workdays = useMemo(
    () => (endDate >= startDate ? rangeDays(startDate, endDate).filter((d) => !isWeekend(d) && !holidays.has(d)) : []),
    [startDate, endDate, holidays],
  );
  const hours = partial ? hoursPerDay : workdays.length * 8;
  const available = employee ? ptoAvailable(db, employee.id, kind) : 0;
  const policy = db.ptoPolicies.find((p) => p.id === employee?.ptoPolicyId);
  const unlimited = policy?.accrualMethod === 'unlimited';
  const overBalance = !unlimited && hours > available && KINDS.slice(0, 3).includes(kind);
  const notice = diffDays(today, startDate);
  const shortNotice = policy ? notice < policy.minNoticeDays : false;

  const submit = () => {
    requestTimeOff({ kind, startDate, endDate: partial ? startDate : endDate, hours, note, partialDay: partial });
    onClose();
    setNote('');
  };

  return (
    <Modal
      open={open} onClose={onClose} title="Request time off" icon={Plane} size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={hours <= 0} onClick={submit}>Submit request</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type of leave" required>
            <Select value={kind} onChange={(e) => setKind(e.target.value as PtoKind)}>
              {KINDS.map((k) => <option key={k} value={k} className="capitalize">{k.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
          <Field label="Available balance">
            <div className="flex h-9 items-center rounded-lg border border-line bg-sunken px-2.5 text-sm">
              {unlimited ? 'Flexible (no fixed balance)' : `${num(available, 1)} hours`}
            </div>
          </Field>
          <Field label="Start date" required>
            <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} />
          </Field>
          <Field label="End date" required>
            <Input type="date" value={partial ? startDate : endDate} disabled={partial} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-sunken p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} className="h-4 w-4 accent-[#5B3FD6]" />
            Partial day
          </label>
          {partial ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Hours</span>
              <Input type="number" min="1" max="8" step="0.5" value={hoursPerDay} className="w-20"
                onChange={(e) => setHoursPerDay(Number(e.target.value))} />
            </div>
          ) : (
            <p className="text-xs text-muted">
              {workdays.length} working day{workdays.length === 1 ? '' : 's'} · weekends and company holidays are excluded automatically
            </p>
          )}
          <div className="ml-auto text-right">
            <p className="text-2xs uppercase tracking-wide text-faint">Total</p>
            <p className="tnum text-lg font-semibold">{num(hours, 1)}h</p>
          </div>
        </div>

        <Field label="Note for your manager">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional context that helps with coverage planning." />
        </Field>

        {overBalance ? (
          <Alert tone="warning" icon={AlertTriangle} title="This exceeds your available balance">
            You are requesting {num(hours, 1)} hours but have {num(available, 1)} available. The request will be
            flagged for your manager, who can still approve it.
          </Alert>
        ) : null}
        {shortNotice ? (
          <Alert tone="warning" icon={AlertTriangle} title={`Less than the ${policy?.minNoticeDays}-day notice period`}>
            Your manager will see this flagged as short notice.
          </Alert>
        ) : null}
        {!overBalance && !shortNotice && hours > 0 ? (
          <Alert tone="success" icon={Check} title="Ready to submit">
            Balance after approval: {unlimited ? 'flexible' : `${num(available - hours, 1)} hours`}. Your manager is notified immediately.
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
};
