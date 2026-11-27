import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Coffee, Fingerprint,
  LogIn, LogOut, MapPin, Monitor, Pencil, Send, Smartphone, X,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Checkbox, Column, DataTable, Drawer,
  EmptyState, Field, Input, Modal, PermissionDenied, SearchInput, SectionHeader, Select,
  StatusBadge, Tabs, Textarea, cx,
} from '@/components/ui';
import { useApp, useLookups } from '@/lib/store';
import { useActions, openPunchState } from '@/lib/actions';
import { num } from '@/lib/format';
import { DOW, addDays, fmtDate, fmtDateShort, isWeekend, parseISO } from '@/lib/dates';
import type { Punch, Timecard, TimecardDay } from '@/lib/types';

export const TimePage = () => {
  const { db, can, employee, visibleIds } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'mine';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  if (!can('time.view.self', 'time.view.team', 'time.view.all')) {
    return <PermissionDenied what="time and attendance" />;
  }

  const scope = visibleIds('time');
  const pendingApprovals = db.timecards.filter((t) => t.status === 'submitted' && scope.has(t.employeeId) && t.employeeId !== employee?.id);
  const exceptions = db.timecards
    .filter((t) => scope.has(t.employeeId))
    .flatMap((t) => t.days.filter((d) => d.exceptions.some((x) => !x.resolved && x.severity !== 'info')).map((d) => ({ tc: t, day: d })));
  const corrections = db.punchCorrections.filter((c) => scope.has(c.employeeId) && c.status === 'pending');

  const tabs = [
    { id: 'mine', label: 'My timecard', icon: Clock },
    ...(can('time.approve') ? [{ id: 'approvals', label: 'Approvals', count: pendingApprovals.length, icon: CheckCircle2 }] : []),
    ...(can('time.view.team', 'time.view.all') ? [{ id: 'team', label: 'Team time', icon: Clock }] : []),
    ...(can('time.approve') ? [{ id: 'exceptions', label: 'Exceptions', count: exceptions.length + corrections.length, icon: AlertTriangle }] : []),
    { id: 'kiosk', label: 'Clock terminals', icon: Monitor },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Time & Attendance"
        subtitle="Punches, timecards and exceptions. Approved time flows straight into the next payroll run."
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'mine' ? <MyTimecard /> : null}
      {tab === 'approvals' ? <Approvals /> : null}
      {tab === 'team' ? <TeamTime /> : null}
      {tab === 'exceptions' ? <Exceptions /> : null}
      {tab === 'kiosk' ? <ClockTerminals /> : null}
    </div>
  );
};

/* --------------------------------------------------------- my timecard */

const MyTimecard = () => {
  const { db, employee, today } = useApp();
  const { punch, submitTimecard, requestPunchCorrection } = useActions();
  const [offset, setOffset] = useState(0);
  const [correctionFor, setCorrectionFor] = useState<TimecardDay | null>(null);

  if (!employee) return null;

  const periods = db.payPeriods
    .filter((p) => p.payGroupId === employee.payGroupId && p.start <= today)
    .sort((a, b) => a.start.localeCompare(b.start));
  const idx = Math.max(0, periods.length - 1 + offset);
  const period = periods[idx];
  const tc = period ? db.timecards.find((t) => t.employeeId === employee.id && t.payPeriodId === period.id) : undefined;

  const allDays = period
    ? Array.from({ length: 40 }, (_, i) => addDays(period.start, i)).filter((d) => d <= period.end)
    : [];

  const dayFor = (date: string): TimecardDay =>
    tc?.days.find((d) => d.date === date) ?? {
      date, regularHours: 0, overtimeHours: 0, doubleTimeHours: 0, breakMinutes: 0,
      ptoHours: 0, holidayHours: 0, exceptions: [], jobCode: '—',
    };

  const punchesFor = (date: string) =>
    db.punches.filter((p) => p.employeeId === employee.id && p.at.slice(0, 10) === date)
      .sort((a, b) => a.at.localeCompare(b.at));

  const totals = {
    regular: tc?.totalRegular ?? 0,
    overtime: tc?.totalOvertime ?? 0,
    double: tc?.totalDoubleTime ?? 0,
    pto: tc?.totalPto ?? 0,
    holiday: tc?.totalHoliday ?? 0,
  };
  const grand = totals.regular + totals.overtime + totals.double + totals.pto + totals.holiday;
  const state = openPunchState(punchesFor(today));

  return (
    <div className="space-y-5">
      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex items-center gap-2">
            <Button size="sm" icon={ChevronLeft} onClick={() => setOffset((o) => Math.max(-(periods.length - 1), o - 1))} disabled={idx === 0}>Previous</Button>
            <div className="text-center">
              <p className="text-sm font-semibold">
                {period ? `${fmtDateShort(period.start)} – ${fmtDateShort(period.end)}` : '—'}
              </p>
              <p className="text-xs text-muted">Check date {period ? fmtDate(period.checkDate) : '—'}</p>
            </div>
            <Button size="sm" iconRight={ChevronRight} onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset === 0}>Next</Button>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={tc?.status ?? 'open'} />
            {tc && tc.status === 'open' ? (
              <Button variant="primary" icon={Send} onClick={() => submitTimecard(tc.id)}>Submit for approval</Button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
          {[
            ['Regular', totals.regular], ['Overtime', totals.overtime], ['Double time', totals.double],
            ['Paid leave', totals.pto + totals.holiday], ['Total', grand],
          ].map(([label, value], i) => (
            <div key={label as string} className={cx('bg-surface p-4', i === 4 && 'col-span-2 sm:col-span-1')}>
              <p className="text-xs text-faint">{label}</p>
              <p className={cx('tnum mt-0.5 text-xl font-semibold',
                label === 'Overtime' && (value as number) > 0 && 'text-warning-600',
                i === 4 && 'text-brand-700')}>
                {num(value as number, 2)}
              </p>
            </div>
          ))}
        </div>

        <div className="scroll-x">
          <table className="dt">
            <thead>
              <tr>
                <th className="w-28">Day</th>
                <th>Punches</th>
                <th className="text-right">Reg</th>
                <th className="text-right">OT</th>
                <th className="text-right">Leave</th>
                <th className="text-right">Break</th>
                <th>Exceptions</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {allDays.map((date) => {
                const d = dayFor(date);
                const punches = punchesFor(date);
                const isToday = date === today;
                const worked = d.regularHours + d.overtimeHours + d.doubleTimeHours;
                return (
                  <tr key={date} className={cx(isToday && 'bg-brand-50/40', isWeekend(date) && !worked && 'opacity-60')}>
                    <td>
                      <p className={cx('text-sm', isToday && 'font-semibold text-brand-700')}>
                        {DOW[parseISO(date).getDay()]} {parseISO(date).getDate()}
                      </p>
                      <p className="text-2xs text-faint">{fmtDateShort(date)}</p>
                    </td>
                    <td>
                      {punches.length ? (
                        <div className="flex flex-wrap gap-1">
                          {punches.map((p) => <PunchChip key={p.id} punch={p} />)}
                        </div>
                      ) : worked > 0 ? (
                        <span className="text-xs text-faint">Recorded without punch detail</span>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </td>
                    <td className="text-right tnum text-sm">{d.regularHours ? num(d.regularHours, 2) : '—'}</td>
                    <td className={cx('text-right tnum text-sm', d.overtimeHours > 0 && 'font-medium text-warning-600')}>
                      {d.overtimeHours ? num(d.overtimeHours, 2) : '—'}
                    </td>
                    <td className="text-right tnum text-sm">{d.ptoHours + d.holidayHours ? num(d.ptoHours + d.holidayHours, 2) : '—'}</td>
                    <td className="text-right tnum text-sm">{d.breakMinutes ? `${d.breakMinutes}m` : '—'}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {d.exceptions.map((x, i) => (
                          <Badge key={i} tone={x.severity === 'error' ? 'danger' : x.severity === 'warning' ? 'warning' : 'neutral'}>
                            {x.message}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="text-right">
                      {tc && tc.status === 'open' ? (
                        <Button size="xs" variant="ghost" icon={Pencil} onClick={() => setCorrectionFor(d)} aria-label="Request correction">
                          <span className="sr-only">Request correction</span>
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {offset === 0 ? (
        <Card>
          <CardHeader title="Quick punch" subtitle="Web clock — geofence and IP are recorded with every punch" icon={Clock} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={LogIn} onClick={() => punch('in')} disabled={state !== 'out'}>Clock in</Button>
            <Button variant="danger" icon={LogOut} onClick={() => punch('out')} disabled={state === 'out'}>Clock out</Button>
            <Button icon={Coffee} onClick={() => punch('break_start')} disabled={state !== 'in'}>Start break</Button>
            <Button variant="accent" icon={Coffee} onClick={() => punch('break_end')} disabled={state !== 'break'}>End break</Button>
          </div>
        </Card>
      ) : null}

      <CorrectionModal
        day={correctionFor}
        timecardId={tc?.id ?? ''}
        onClose={() => setCorrectionFor(null)}
        onSubmit={(change, reason) => {
          if (!tc || !correctionFor) return;
          requestPunchCorrection({ timecardId: tc.id, date: correctionFor.date, requestedChange: change, reason });
          setCorrectionFor(null);
        }}
      />
    </div>
  );
};

const PunchChip = ({ punch }: { punch: Punch }) => {
  const Icon = punch.source === 'mobile' ? Smartphone : punch.source === 'kiosk' ? Monitor
    : punch.source === 'badge' || punch.source === 'biometric' ? Fingerprint : Clock;
  const tone = punch.type === 'in' ? 'text-success-600' : punch.type === 'out' ? 'text-danger-500' : 'text-warning-600';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-0.5 text-2xs"
      title={`${punch.type.replace('_', ' ')} · ${punch.source} · ${punch.device}${punch.withinGeofence ? '' : ' · outside geofence'}`}
    >
      <Icon className={cx('h-2.5 w-2.5', tone)} />
      <span className="tnum">{new Date(punch.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      {!punch.withinGeofence ? <MapPin className="h-2.5 w-2.5 text-danger-500" /> : null}
    </span>
  );
};

const CorrectionModal = ({
  day, timecardId, onClose, onSubmit,
}: { day: TimecardDay | null; timecardId: string; onClose: () => void; onSubmit: (change: string, reason: string) => void }) => {
  const [change, setChange] = useState('');
  const [reason, setReason] = useState('');
  void timecardId;
  return (
    <Modal
      open={Boolean(day)} onClose={onClose} title="Request a punch correction" icon={Pencil}
      subtitle={day ? fmtDate(day.date) : ''}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!change || !reason} onClick={() => { onSubmit(change, reason); setChange(''); setReason(''); }}>
            Send to manager
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What should change?" required hint="For example: add a clock-out at 5:15 PM.">
          <Input value={change} onChange={(e) => setChange(e.target.value)} placeholder="Add clock-out at 5:15 PM" />
        </Field>
        <Field label="Why?" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Left directly from a customer site and forgot to punch out." />
        </Field>
        <Alert tone="info" title="Your manager reviews every correction">
          Edits to recorded time always require approval, and both the request and the decision are written to the audit log.
        </Alert>
      </div>
    </Modal>
  );
};

/* ----------------------------------------------------------- approvals */

const Approvals = () => {
  const { db, visibleIds, employee } = useApp();
  const { decideTimecard } = useActions();
  const lookups = useLookups();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Timecard | null>(null);
  const [rejectFor, setRejectFor] = useState<Timecard | null>(null);
  const [note, setNote] = useState('');

  const scope = visibleIds('time');
  const rows = db.timecards
    .filter((t) => t.status === 'submitted' && scope.has(t.employeeId) && t.employeeId !== employee?.id)
    .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const columns: Column<Timecard>[] = [
    {
      key: 'select', header: '', width: '2.5rem',
      render: (t) => <Checkbox label="" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />,
    },
    {
      key: 'employee', header: 'Employee', sortValue: (t) => lookups.employee.get(t.employeeId)?.lastName ?? '',
      render: (t) => {
        const e = lookups.employee.get(t.employeeId);
        return e ? (
          <span className="flex items-center gap-2.5">
            <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={28} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{e.preferredName} {e.lastName}</span>
              <span className="block truncate text-xs text-muted">{lookups.jobTitle.get(e.jobTitleId)?.name}</span>
            </span>
          </span>
        ) : '—';
      },
    },
    { key: 'period', header: 'Pay period', hideBelow: 'sm', sortValue: (t) => t.periodStart, render: (t) => <span className="text-sm">{fmtDateShort(t.periodStart)} – {fmtDateShort(t.periodEnd)}</span> },
    { key: 'regular', header: 'Regular', align: 'right', sortValue: (t) => t.totalRegular, render: (t) => num(t.totalRegular, 2) },
    { key: 'ot', header: 'Overtime', align: 'right', sortValue: (t) => t.totalOvertime, render: (t) => <span className={t.totalOvertime > 0 ? 'font-medium text-warning-600' : ''}>{num(t.totalOvertime, 2)}</span> },
    { key: 'leave', header: 'Leave', align: 'right', hideBelow: 'md', sortValue: (t) => t.totalPto, render: (t) => num(t.totalPto + t.totalHoliday, 2) },
    {
      key: 'exceptions', header: 'Exceptions', hideBelow: 'md',
      render: (t) => {
        const errs = t.days.flatMap((d) => d.exceptions).filter((x) => !x.resolved);
        if (!errs.length) return <Badge tone="success">Clean</Badge>;
        const worst = errs.some((e) => e.severity === 'error') ? 'danger' : 'warning';
        return <Badge tone={worst}>{errs.length} to review</Badge>;
      },
    },
    {
      key: 'actions', header: '', align: 'right',
      render: (t) => (
        <span className="flex justify-end gap-1.5">
          <Button size="xs" onClick={() => setDetail(t)}>Review</Button>
          <Button size="xs" variant="ghost" icon={X} onClick={() => setRejectFor(t)} aria-label="Return" />
          <Button size="xs" variant="primary" icon={Check} onClick={() => decideTimecard(t.id, true)} aria-label="Approve" />
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {selected.size ? (
        <Alert tone="brand" title={`${selected.size} timecard(s) selected`}
          action={
            <Button variant="primary" size="sm" icon={Check} onClick={() => {
              selected.forEach((id) => decideTimecard(id, true));
              setSelected(new Set());
            }}>
              Approve selected
            </Button>
          }
        >
          Bulk approval records an individual audit entry for each timecard.
        </Alert>
      ) : null}

      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader
            title="Timecards awaiting your approval" dense
            subtitle={rows.length ? `${rows.length} submitted timecard(s)` : 'Nothing pending'}
            icon={CheckCircle2}
          />
        </div>
        <DataTable
          rows={rows} columns={columns} getRowId={(t) => t.id} pageSize={12}
          empty={<EmptyState icon={CheckCircle2} title="No timecards waiting" body="Submitted timecards from your team appear here." />}
        />
      </Card>

      <TimecardDrawer timecard={detail} onClose={() => setDetail(null)} />

      <Modal
        open={Boolean(rejectFor)} onClose={() => setRejectFor(null)} title="Return timecard for correction" icon={X}
        footer={
          <>
            <Button onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (rejectFor) decideTimecard(rejectFor.id, false, note); setRejectFor(null); setNote(''); }}>
              Return to employee
            </Button>
          </>
        }
      >
        <Field label="What needs to change?" required>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thursday is missing a clock-out — please add it and resubmit." />
        </Field>
      </Modal>
    </div>
  );
};

const TimecardDrawer = ({ timecard, onClose }: { timecard: Timecard | null; onClose: () => void }) => {
  const { db, can } = useApp();
  const { decideTimecard, editTimecardDay } = useActions();
  const lookups = useLookups();
  const [editing, setEditing] = useState<TimecardDay | null>(null);
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');

  if (!timecard) return null;
  const emp = lookups.employee.get(timecard.employeeId);

  return (
    <Drawer
      open width="lg" onClose={onClose}
      title={emp ? `${emp.firstName} ${emp.lastName}` : 'Timecard'}
      subtitle={`${fmtDate(timecard.periodStart)} – ${fmtDate(timecard.periodEnd)}`}
      footer={
        <>
          <Button onClick={() => { decideTimecard(timecard.id, false, 'Please review and resubmit.'); onClose(); }}>Return</Button>
          <Button variant="primary" icon={Check} onClick={() => { decideTimecard(timecard.id, true); onClose(); }}>Approve timecard</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[['Regular', timecard.totalRegular], ['Overtime', timecard.totalOvertime], ['Paid leave', timecard.totalPto + timecard.totalHoliday]].map(([l, v]) => (
            <div key={l as string} className="well p-3">
              <p className="text-xs text-faint">{l}</p>
              <p className="tnum mt-0.5 text-lg font-semibold">{num(v as number, 2)}</p>
            </div>
          ))}
        </div>

        <div className="scroll-x">
          <table className="dt">
            <thead><tr><th>Date</th><th className="text-right">Reg</th><th className="text-right">OT</th><th className="text-right">Leave</th><th>Exceptions</th><th /></tr></thead>
            <tbody>
              {timecard.days.map((d) => (
                <tr key={d.date}>
                  <td className="text-sm">{DOW[parseISO(d.date).getDay()]} {fmtDateShort(d.date)}</td>
                  <td className="text-right tnum text-sm">{num(d.regularHours, 2)}</td>
                  <td className={cx('text-right tnum text-sm', d.overtimeHours > 0 && 'text-warning-600')}>{num(d.overtimeHours, 2)}</td>
                  <td className="text-right tnum text-sm">{num(d.ptoHours + d.holidayHours, 2)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {d.exceptions.filter((x) => !x.resolved).map((x, i) => (
                        <Badge key={i} tone={x.severity === 'error' ? 'danger' : 'warning'}>{x.kind.replace(/_/g, ' ')}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="text-right">
                    {can('time.edit') ? (
                      <Button size="xs" variant="ghost" onClick={() => { setEditing(d); setHours(String(d.regularHours)); }}>Edit</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Alert tone="info" title="Approved time is payroll-ready">
          Once approved, these hours are locked to the {fmtDate(db.payPeriods.find((p) => p.id === timecard.payPeriodId)?.checkDate ?? '')} pay date and
          appear in the next payroll calculation.
        </Alert>
      </div>

      <Modal
        open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit recorded hours" icon={Pencil}
        subtitle={editing ? fmtDate(editing.date) : ''}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" disabled={!reason} onClick={() => {
              if (editing) editTimecardDay(timecard.id, editing.date, { regularHours: Number(hours) || 0 }, reason);
              setEditing(null); setReason('');
            }}>Save edit</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Worked hours" required>
            <Input type="number" step="0.25" min="0" max="24" value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
          <Field label="Reason for the edit" required hint="Required — the reason is stored in the audit trail.">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Employee confirmed 5:15 PM departure" />
          </Field>
        </div>
      </Modal>
    </Drawer>
  );
};

/* ----------------------------------------------------------- team time */

const TeamTime = () => {
  const { db, visibleIds, today } = useApp();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [periodId, setPeriodId] = useState('current');

  const scope = visibleIds('time');
  const periods = useMemo(
    () => [...new Set(db.timecards.filter((t) => scope.has(t.employeeId)).map((t) => t.payPeriodId))]
      .map((id) => db.payPeriods.find((p) => p.id === id)!)
      .filter(Boolean)
      .sort((a, b) => b.start.localeCompare(a.start)),
    [db.timecards, db.payPeriods, scope],
  );
  const activePeriod = periodId === 'current' ? periods[0] : periods.find((p) => p.id === periodId);

  const rows = db.timecards
    .filter((t) => scope.has(t.employeeId) && (!activePeriod || t.payPeriodId === activePeriod.id))
    .filter((t) => {
      const e = lookups.employee.get(t.employeeId);
      const q = query.trim().toLowerCase();
      return !q || !e || `${e.firstName} ${e.lastName}`.toLowerCase().includes(q);
    });

  const totals = rows.reduce(
    (acc, t) => ({
      regular: acc.regular + t.totalRegular,
      ot: acc.ot + t.totalOvertime + t.totalDoubleTime,
      leave: acc.leave + t.totalPto + t.totalHoliday,
    }),
    { regular: 0, ot: 0, leave: 0 },
  );

  const columns: Column<Timecard>[] = [
    {
      key: 'employee', header: 'Employee', sortValue: (t) => lookups.employee.get(t.employeeId)?.lastName ?? '',
      render: (t) => {
        const e = lookups.employee.get(t.employeeId);
        return e ? (
          <button className="flex items-center gap-2.5 text-left" onClick={() => navigate(`/people/${e.id}`)}>
            <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={28} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{e.preferredName} {e.lastName}</span>
              <span className="block truncate text-xs text-muted">{lookups.department.get(e.departmentId)?.name}</span>
            </span>
          </button>
        ) : '—';
      },
    },
    { key: 'regular', header: 'Regular', align: 'right', sortValue: (t) => t.totalRegular, render: (t) => num(t.totalRegular, 2) },
    { key: 'ot', header: 'Overtime', align: 'right', sortValue: (t) => t.totalOvertime, render: (t) => <span className={t.totalOvertime > 0 ? 'font-medium text-warning-600' : ''}>{num(t.totalOvertime, 2)}</span> },
    { key: 'leave', header: 'Leave', align: 'right', hideBelow: 'sm', sortValue: (t) => t.totalPto, render: (t) => num(t.totalPto + t.totalHoliday, 2) },
    { key: 'total', header: 'Total', align: 'right', sortValue: (t) => t.totalRegular + t.totalOvertime, render: (t) => <span className="font-medium">{num(t.totalRegular + t.totalOvertime + t.totalDoubleTime + t.totalPto + t.totalHoliday, 2)}</span> },
    { key: 'status', header: 'Status', align: 'center', sortValue: (t) => t.status, render: (t) => <StatusBadge status={t.status} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-xs text-faint">Regular hours</p><p className="tnum mt-1 text-2xl font-semibold">{num(totals.regular, 1)}</p></Card>
        <Card><p className="text-xs text-faint">Overtime hours</p><p className="tnum mt-1 text-2xl font-semibold text-warning-600">{num(totals.ot, 1)}</p></Card>
        <Card><p className="text-xs text-faint">Paid leave hours</p><p className="tnum mt-1 text-2xl font-semibold text-teal-700">{num(totals.leave, 1)}</p></Card>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search team members…" className="min-w-[14rem] flex-1" />
          <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="w-auto">
            <option value="current">Current period</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{fmtDateShort(p.start)} – {fmtDateShort(p.end)}</option>)}
          </Select>
        </div>
        <DataTable rows={rows} columns={columns} getRowId={(t) => t.id} pageSize={14}
          empty={<EmptyState icon={Clock} title="No timecards in this period" />} />
      </Card>

      <p className="text-xs text-faint">Period ending {activePeriod ? fmtDate(activePeriod.end) : fmtDate(today)}.</p>
    </div>
  );
};

/* ---------------------------------------------------------- exceptions */

const Exceptions = () => {
  const { db, visibleIds } = useApp();
  const { decidePunchCorrection } = useActions();
  const lookups = useLookups();
  const scope = visibleIds('time');

  const corrections = db.punchCorrections.filter((c) => scope.has(c.employeeId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const flagged = db.timecards
    .filter((t) => scope.has(t.employeeId))
    .flatMap((t) => t.days
      .filter((d) => d.exceptions.some((x) => !x.resolved && x.severity !== 'info'))
      .map((d) => ({ timecard: t, day: d })))
    .sort((a, b) => b.day.date.localeCompare(a.day.date))
    .slice(0, 40);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader title="Punch correction requests" dense icon={Pencil}
            subtitle={`${corrections.filter((c) => c.status === 'pending').length} pending`} />
        </div>
        {corrections.length === 0 ? <EmptyState compact title="No correction requests" /> : (
          <ul className="divide-y divide-line">
            {corrections.slice(0, 12).map((c) => {
              const e = lookups.employee.get(c.employeeId);
              return (
                <li key={c.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{e?.preferredName} {e?.lastName} · {fmtDate(c.date)}</p>
                      <p className="mt-0.5 text-xs text-brand-700">{c.requestedChange}</p>
                      <p className="mt-1 text-xs text-muted">{c.reason}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  {c.status === 'pending' ? (
                    <div className="mt-2.5 flex gap-2">
                      <Button size="xs" onClick={() => decidePunchCorrection(c.id, false, 'Please provide supporting detail.')}>Deny</Button>
                      <Button size="xs" variant="primary" onClick={() => decidePunchCorrection(c.id, true)}>Approve &amp; apply</Button>
                    </div>
                  ) : c.decisionNote ? <p className="mt-1.5 text-2xs text-faint">{c.decisionNote}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader title="Attendance exceptions" dense icon={AlertTriangle}
            subtitle="Missed punches, short breaks, geofence and overtime flags" />
        </div>
        {flagged.length === 0 ? <EmptyState compact icon={CheckCircle2} title="No open exceptions" /> : (
          <ul className="divide-y divide-line">
            {flagged.map(({ timecard, day }) => {
              const e = lookups.employee.get(timecard.employeeId);
              return (
                <li key={`${timecard.id}-${day.date}`} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{e?.preferredName} {e?.lastName}</p>
                    <p className="text-xs text-muted">{fmtDate(day.date)} · {num(day.regularHours + day.overtimeHours, 2)}h recorded</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {day.exceptions.filter((x) => !x.resolved && x.severity !== 'info').map((x, i) => (
                      <Badge key={i} tone={x.severity === 'error' ? 'danger' : 'warning'}>{x.message}</Badge>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};

/* ------------------------------------------------------- clock devices */

const ClockTerminals = () => {
  const { db } = useApp();
  return (
    <div className="space-y-5">
      <Alert tone="info" icon={Monitor} title="Clocking methods">
        Meridian records the capture method, device, network address and geolocation for every punch. Kiosk,
        badge and biometric terminals authenticate against the same employee record used by payroll.
      </Alert>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {db.locations.filter((l) => l.active && l.id !== 'loc_rmt').map((loc, i) => (
          <Card key={loc.id}>
            <CardHeader
              title={loc.name} dense icon={Monitor}
              subtitle={`${loc.city}, ${loc.state}`}
              actions={<Badge tone={i % 4 === 3 ? 'warning' : 'success'} dot>{i % 4 === 3 ? 'Needs sync' : 'Online'}</Badge>}
            />
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between"><dt className="text-muted">Terminals</dt><dd className="tnum font-medium">{2 + (i % 3)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Capture methods</dt><dd className="font-medium">Kiosk · Badge · Mobile</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Geofence radius</dt><dd className="tnum font-medium">{loc.geofenceMeters} m</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Punches today</dt><dd className="tnum font-medium">{db.punches.filter((p) => p.locationId === loc.id && p.at.slice(0, 10) === db.meta.today).length}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">IP restriction</dt><dd className="font-medium">10.{i}.0.0/16</dd></div>
            </dl>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Time policy rules in force" icon={Clock} subtitle="Applied automatically when hours are calculated" />
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            ['Overtime', 'Over 40 worked hours in a Sunday-start week pays at 1.5×.'],
            ['Double time', 'Over 52 worked hours in a week pays at 2×.'],
            ['Meal break', 'A 30-minute unpaid break is required on shifts of 6 hours or more.'],
            ['Rounding', 'Punches are recorded to the minute; no rounding is applied.'],
            ['Geofencing', 'Punches outside the assigned radius are flagged for manager review.'],
            ['Holiday', 'Company holidays pay at standard daily hours for eligible employees.'],
          ].map(([title, body]) => (
            <li key={title} className="rounded-lg border border-line p-3">
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-1 text-xs text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};
