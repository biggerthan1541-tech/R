import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Repeat, Send,
  Users, X,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal,
  PermissionDenied, SectionHeader, Select, SegmentedControl, StatusBadge, Tabs, Textarea,
  Toggle, cx,
} from '@/components/ui';
import { useApp, useLookups } from '@/lib/store';
import { useActions } from '@/lib/actions';
import { num } from '@/lib/format';
import {
  DOW, addDays, dayOfWeek, endOfMonth, fmtDate, fmtDateShort, fmtTime, hoursBetween,
  parseISO, rangeDays, startOfMonth, startOfWeek,
} from '@/lib/dates';
import type { Shift } from '@/lib/types';

type View = 'week' | 'day' | 'month';

export const SchedulingPage = () => {
  const { db, can, employee } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'schedule';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  if (!can('schedule.view.self', 'schedule.view.team', 'schedule.view.all')) {
    return <PermissionDenied what="scheduling" />;
  }

  const pendingSwaps = db.shiftSwaps.filter((s) => s.status.startsWith('pending'));
  const mySwaps = pendingSwaps.filter((s) => s.targetEmployeeId === employee?.id || s.requesterId === employee?.id);
  const openShifts = db.shifts.filter((s) => s.status === 'open' && s.date >= db.meta.today);

  const tabs = [
    { id: 'schedule', label: can('schedule.manage') ? 'Schedule' : 'My schedule', icon: CalendarDays },
    { id: 'open', label: 'Open shifts', count: openShifts.length, icon: Plus },
    { id: 'swaps', label: 'Swaps', count: can('schedule.manage') ? pendingSwaps.length : mySwaps.length, icon: Repeat },
    { id: 'availability', label: 'Availability', icon: Users },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Scheduling"
        subtitle={can('schedule.manage')
          ? 'Build, publish and staff shifts. Published shifts appear on employee dashboards and mobile immediately.'
          : 'Your published shifts, open shifts you can pick up, and swap requests.'}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'schedule' ? <ScheduleBoard /> : null}
      {tab === 'open' ? <OpenShifts /> : null}
      {tab === 'swaps' ? <Swaps /> : null}
      {tab === 'availability' ? <AvailabilityTab /> : null}
    </div>
  );
};

/* -------------------------------------------------------------- board */

const ScheduleBoard = () => {
  const { db, can, employee, visibleIds, today } = useApp();
  const { saveShift, publishSchedule, deleteShift } = useActions();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(today);
  const [dept, setDept] = useState('all');
  const [loc, setLoc] = useState('all');
  const [editing, setEditing] = useState<Partial<Shift> | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [onlyScheduled, setOnlyScheduled] = useState(true);

  const manage = can('schedule.manage');
  const scope = visibleIds('schedule');

  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    if (view === 'month') {
      const first = startOfMonth(anchor);
      return rangeDays(startOfWeek(first, 0), addDays(startOfWeek(endOfMonth(anchor), 0), 6));
    }
    return rangeDays(startOfWeek(anchor, 0), addDays(startOfWeek(anchor, 0), 6));
  }, [anchor, view]);

  const staff = useMemo(() => {
    const list = db.employees
      .filter((e) => e.status === 'active' && scope.has(e.id))
      .filter((e) => (dept === 'all' ? true : e.departmentId === dept))
      .filter((e) => (loc === 'all' ? true : e.locationId === loc))
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
    return manage ? list : list.filter((e) => e.id === employee?.id);
  }, [db.employees, scope, dept, loc, manage, employee]);

  const shiftsInRange = db.shifts.filter(
    (s) => s.date >= days[0] && s.date <= days[days.length - 1] &&
      (dept === 'all' || s.departmentId === dept) && (loc === 'all' || s.locationId === loc) &&
      (manage ? true : s.employeeId === employee?.id || s.status === 'open'),
  );

  const shiftFor = (empId: string | null, date: string) =>
    shiftsInRange.filter((s) => s.employeeId === empId && s.date === date);

  // Corporate staff without shifts would otherwise pad the board with empty rows.
  const rosterIds = new Set(shiftsInRange.map((s) => s.employeeId).filter(Boolean) as string[]);
  const roster = onlyScheduled && manage ? staff.filter((e) => rosterIds.has(e.id)) : staff;

  const draftCount = shiftsInRange.filter((s) => s.status === 'draft').length;
  const weekHours = (empId: string) =>
    shiftsInRange
      .filter((s) => s.employeeId === empId)
      .reduce((sum, s) => sum + hoursBetween(s.start, s.end, s.breakMinutes), 0);

  const move = (shiftId: string, employeeId: string | null, date: string) => {
    const shift = db.shifts.find((s) => s.id === shiftId);
    if (!shift) return;
    saveShift({ id: shiftId, employeeId, date, status: shift.status === 'published' ? 'published' : 'draft' });
  };

  const step = view === 'month' ? 30 : view === 'day' ? 1 : 7;

  return (
    <div className="space-y-4">
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="flex items-center gap-1">
            <Button size="sm" icon={ChevronLeft} onClick={() => setAnchor(addDays(anchor, -step))} aria-label="Previous" />
            <Button size="sm" onClick={() => setAnchor(today)}>Today</Button>
            <Button size="sm" iconRight={ChevronRight} onClick={() => setAnchor(addDays(anchor, step))} aria-label="Next" />
          </div>
          <p className="min-w-[10rem] text-sm font-semibold">
            {view === 'day' ? fmtDate(anchor)
              : view === 'month' ? parseISO(anchor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
              : `${fmtDateShort(days[0])} – ${fmtDateShort(days[days.length - 1])}`}
          </p>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-auto">
              <option value="all">All departments</option>
              {db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Select value={loc} onChange={(e) => setLoc(e.target.value)} className="w-auto">
              <option value="all">All locations</option>
              {db.locations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
            </Select>
            <SegmentedControl value={view} onChange={setView}
              options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
            {manage ? (
              <>
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted">
                  <input
                    type="checkbox" checked={onlyScheduled}
                    onChange={(e) => setOnlyScheduled(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#5B3FD6]"
                  />
                  Only scheduled staff
                </label>
                <Button size="sm" icon={Plus} onClick={() => setEditing({ date: days[0], departmentId: dept === 'all' ? 'dep_whs' : dept, locationId: loc === 'all' ? 'loc_phx' : loc })}>
                  Add shift
                </Button>
                <Button size="sm" variant="primary" icon={Send} disabled={!draftCount}
                  onClick={() => publishSchedule(days[0], dept === 'all' ? 'all' : dept)}>
                  Publish {draftCount ? `(${draftCount})` : ''}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {view === 'month' ? (
          <MonthGrid days={days} shifts={shiftsInRange} anchor={anchor} onPick={(d) => { setAnchor(d); setView('day'); }} />
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 w-52 border-b border-r border-line bg-sunken px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-faint">
                    Employee
                  </th>
                  {days.map((d) => (
                    <th key={d} className={cx('border-b border-line bg-sunken px-2 py-2 text-center text-2xs font-semibold uppercase tracking-wider',
                      d === today ? 'text-brand-700' : 'text-faint')}>
                      {DOW[dayOfWeek(d)]} {parseISO(d).getDate()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.length === 0 ? (
                  <tr><td colSpan={days.length + 1}><EmptyState icon={Users} title="No scheduled employees in this view" body="Clear a filter, or turn off &quot;only scheduled&quot; to add shifts for anyone." /></td></tr>
                ) : roster.map((emp) => {
                  const hrs = weekHours(emp.id);
                  return (
                    <tr key={emp.id}>
                      <td className="sticky left-0 z-10 border-b border-r border-line bg-surface px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar first={emp.firstName} last={emp.lastName} seed={emp.avatarSeed} size={26} />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{emp.preferredName} {emp.lastName}</p>
                            <p className={cx('tnum text-2xs', hrs > 40 ? 'font-medium text-warning-600' : 'text-faint')}>
                              {num(hrs, 1)}h scheduled
                            </p>
                          </div>
                        </div>
                      </td>
                      {days.map((d) => (
                        <td
                          key={d}
                          onDragOver={manage ? (e) => e.preventDefault() : undefined}
                          onDrop={manage ? () => { if (dragId) { move(dragId, emp.id, d); setDragId(null); } } : undefined}
                          className={cx('border-b border-line align-top p-1', d === today && 'bg-brand-50/30')}
                        >
                          <div className="min-h-[3.25rem] space-y-1">
                            {shiftFor(emp.id, d).map((s) => (
                              <ShiftChip
                                key={s.id} shift={s} draggable={manage}
                                onDragStart={() => setDragId(s.id)}
                                onClick={manage ? () => setEditing(s) : undefined}
                              />
                            ))}
                            {manage ? (
                              <button
                                onClick={() => setEditing({ date: d, employeeId: emp.id, departmentId: emp.departmentId, locationId: emp.locationId })}
                                className="flex w-full items-center justify-center rounded border border-dashed border-line py-1 text-2xs text-faint opacity-0 transition-opacity hover:border-brand-300 hover:text-brand-600 focus:opacity-100 group-hover:opacity-100"
                                style={{ opacity: shiftFor(emp.id, d).length ? undefined : 1 }}
                              >
                                +
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {manage ? (
                  <tr>
                    <td className="sticky left-0 z-10 border-r border-line bg-sunken px-3 py-2">
                      <p className="text-xs font-medium text-muted">Open shifts</p>
                      <p className="text-2xs text-faint">Unassigned coverage</p>
                    </td>
                    {days.map((d) => (
                      <td key={d}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => { if (dragId) { move(dragId, null, d); setDragId(null); } }}
                        className="bg-sunken/50 align-top p-1">
                        <div className="min-h-[2.5rem] space-y-1">
                          {shiftFor(null, d).map((s) => (
                            <ShiftChip key={s.id} shift={s} draggable onDragStart={() => setDragId(s.id)} onClick={() => setEditing(s)} />
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {manage ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-xs text-faint">Scheduled hours</p>
            <p className="tnum mt-1 text-2xl font-semibold">
              {num(shiftsInRange.reduce((s, x) => s + hoursBetween(x.start, x.end, x.breakMinutes), 0), 1)}
            </p>
          </Card>
          <Card>
            <p className="text-xs text-faint">Overtime risk</p>
            <p className="tnum mt-1 text-2xl font-semibold text-warning-600">
              {roster.filter((e) => weekHours(e.id) > 40).length}
            </p>
            <p className="mt-0.5 text-2xs text-faint">employees above 40 scheduled hours</p>
          </Card>
          <Card>
            <p className="text-xs text-faint">Unfilled shifts</p>
            <p className="tnum mt-1 text-2xl font-semibold text-danger-600">{shiftsInRange.filter((s) => !s.employeeId).length}</p>
          </Card>
        </div>
      ) : null}

      <ShiftModal
        shift={editing}
        onClose={() => setEditing(null)}
        onSave={(s) => { saveShift(s); setEditing(null); }}
        onDelete={(id) => { deleteShift(id); setEditing(null); }}
      />
      {manage ? (
        <p className="text-xs text-faint">
          Drag a shift onto another employee or day to reassign it. Draft shifts are private until you publish.
        </p>
      ) : null}
    </div>
  );
};

const ShiftChip = ({
  shift, draggable, onDragStart, onClick,
}: { shift: Shift; draggable?: boolean; onDragStart?: () => void; onClick?: () => void }) => {
  const tone = shift.status === 'draft' ? 'border-dashed border-line-strong bg-sunken text-muted'
    : shift.status === 'open' ? 'border-accent-300 bg-accent-50 text-accent-800'
    : shift.status === 'completed' ? 'border-line bg-surface text-faint'
    : 'border-brand-200 bg-brand-50 text-brand-800';
  return (
    <button
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={cx('block w-full cursor-grab rounded border px-1.5 py-1 text-left text-2xs leading-tight transition-shadow active:cursor-grabbing', tone)}
    >
      <span className="block font-medium">{fmtTime(shift.start)}</span>
      <span className="block truncate opacity-80">{shift.role}</span>
    </button>
  );
};

const MonthGrid = ({
  days, shifts, anchor, onPick,
}: { days: string[]; shifts: Shift[]; anchor: string; onPick: (d: string) => void }) => {
  const { today } = useApp();
  const month = anchor.slice(0, 7);
  return (
    <div className="grid grid-cols-7 gap-px bg-line p-px">
      {DOW.map((d) => (
        <div key={d} className="bg-sunken px-2 py-1.5 text-center text-2xs font-semibold uppercase tracking-wider text-faint">{d}</div>
      ))}
      {days.map((d) => {
        const dayShifts = shifts.filter((s) => s.date === d);
        const outside = d.slice(0, 7) !== month;
        return (
          <button
            key={d}
            onClick={() => onPick(d)}
            className={cx('min-h-[5.5rem] bg-surface p-1.5 text-left align-top transition-colors hover:bg-sunken',
              outside && 'opacity-40', d === today && 'ring-1 ring-inset ring-brand-400')}
          >
            <span className={cx('tnum text-xs', d === today ? 'font-semibold text-brand-700' : 'text-muted')}>
              {parseISO(d).getDate()}
            </span>
            {dayShifts.length ? (
              <span className="mt-1 block space-y-0.5">
                <span className="block text-2xs font-medium text-ink">{dayShifts.length} shifts</span>
                <span className="block text-2xs text-faint">
                  {num(dayShifts.reduce((s, x) => s + hoursBetween(x.start, x.end, x.breakMinutes), 0), 0)}h
                </span>
                {dayShifts.some((s) => !s.employeeId) ? (
                  <span className="mt-0.5 inline-block rounded bg-accent-50 px-1 text-2xs text-accent-800">
                    {dayShifts.filter((s) => !s.employeeId).length} open
                  </span>
                ) : null}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

const ShiftModal = ({
  shift, onClose, onSave, onDelete,
}: {
  shift: Partial<Shift> | null;
  onClose: () => void;
  onSave: (s: Partial<Shift> & { id?: string }) => void;
  onDelete: (id: string) => void;
}) => {
  const { db } = useApp();
  const [form, setForm] = useState<Partial<Shift>>({});
  const [initialised, setInitialised] = useState<string | null>(null);

  if (shift && initialised !== (shift.id ?? 'new') + (shift.date ?? '')) {
    setInitialised((shift.id ?? 'new') + (shift.date ?? ''));
    setForm({
      start: '09:00', end: '17:00', breakMinutes: 30, role: 'General', status: 'draft',
      ...shift,
    });
  }

  if (!shift) return null;
  const hours = form.start && form.end ? hoursBetween(form.start, form.end, form.breakMinutes ?? 0) : 0;

  return (
    <Modal
      open onClose={onClose} title={shift.id ? 'Edit shift' : 'Create shift'} icon={CalendarDays}
      subtitle={form.date ? fmtDate(form.date) : ''}
      footer={
        <>
          {shift.id ? <Button variant="danger" onClick={() => onDelete(shift.id!)}>Delete</Button> : null}
          <div className="flex-1" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(form)}>{shift.id ? 'Save shift' : 'Create shift'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date"><Input type="date" value={form.date ?? ''} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Assigned to">
          <Select value={form.employeeId ?? ''} onChange={(e) => setForm({ ...form, employeeId: e.target.value || null })}>
            <option value="">Open shift (unassigned)</option>
            {db.employees.filter((e) => e.status === 'active').sort((a, b) => a.lastName.localeCompare(b.lastName)).map((e) => (
              <option key={e.id} value={e.id}>{e.preferredName} {e.lastName}</option>
            ))}
          </Select>
        </Field>
        <Field label="Start"><Input type="time" value={form.start ?? ''} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
        <Field label="End"><Input type="time" value={form.end ?? ''} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
        <Field label="Unpaid break (minutes)">
          <Input type="number" min="0" step="15" value={form.breakMinutes ?? 30} onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })} />
        </Field>
        <Field label="Role / position"><Input value={form.role ?? ''} onChange={(e) => setForm({ ...form, role: e.target.value })} /></Field>
        <Field label="Department">
          <Select value={form.departmentId ?? ''} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
            {db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Location">
          <Select value={form.locationId ?? ''} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
            {db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <Textarea rows={2} value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
        <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-line bg-sunken px-3 py-2.5">
          <span className="text-sm">Paid hours for this shift</span>
          <span className="tnum text-sm font-semibold">{num(hours, 2)}h</span>
        </div>
        <div className="sm:col-span-2">
          <Toggle
            checked={form.status === 'published' || form.status === 'open'}
            onChange={(v) => setForm({ ...form, status: v ? (form.employeeId ? 'published' : 'open') : 'draft' })}
            label="Publish immediately (notifies the employee)"
          />
        </div>
      </div>
    </Modal>
  );
};

/* -------------------------------------------------------- open shifts */

const OpenShifts = () => {
  const { db, employee, can, today } = useApp();
  const { claimOpenShift } = useActions();
  const lookups = useLookups();
  const open = db.shifts.filter((s) => s.status === 'open' && s.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5">
        <CardHeader
          title="Open shifts" dense icon={Plus}
          subtitle="Unassigned coverage. Employees can pick these up; managers can assign them directly."
        />
      </div>
      {open.length === 0 ? (
        <EmptyState icon={Check} title="Every shift is covered" body="Open shifts appear here when coverage is missing." />
      ) : (
        <ul className="divide-y divide-line">
          {open.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-3">
                <div className="w-12 shrink-0 text-center">
                  <p className="text-2xs uppercase text-faint">{DOW[dayOfWeek(s.date)]}</p>
                  <p className="tnum text-lg font-semibold leading-tight">{parseISO(s.date).getDate()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">{fmtTime(s.start)} – {fmtTime(s.end)} · {s.role}</p>
                  <p className="text-xs text-muted">
                    {lookups.department.get(s.departmentId)?.name} · {lookups.location.get(s.locationId)?.name} ·
                    {' '}{num(hoursBetween(s.start, s.end, s.breakMinutes), 2)}h
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="accent">Open</Badge>
                {employee && !can('schedule.manage') ? (
                  <Button size="sm" variant="primary" onClick={() => claimOpenShift(s.id)}>Pick up</Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => claimOpenShift(s.id)}>Assign to me</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

/* -------------------------------------------------------------- swaps */

const Swaps = () => {
  const { db, employee, can } = useApp();
  const { decideSwap, requestSwap } = useActions();
  const lookups = useLookups();
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ shiftId: '', targetEmployeeId: '', type: 'swap' as 'swap' | 'giveaway', reason: '' });

  const manage = can('schedule.manage');
  const swaps = db.shiftSwaps
    .filter((s) => manage || s.requesterId === employee?.id || s.targetEmployeeId === employee?.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const myFutureShifts = db.shifts.filter(
    (s) => s.employeeId === employee?.id && s.date >= db.meta.today && s.status === 'published',
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" icon={Repeat} onClick={() => setComposing(true)} disabled={!myFutureShifts.length}>
          Request a swap
        </Button>
      </div>

      <Card padded={false}>
        {swaps.length === 0 ? (
          <EmptyState icon={Repeat} title="No swap requests" body="Requests to swap, give away or pick up shifts appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {swaps.map((s) => {
              const shift = db.shifts.find((x) => x.id === s.shiftId);
              const requester = lookups.employee.get(s.requesterId);
              const target = s.targetEmployeeId ? lookups.employee.get(s.targetEmployeeId) : null;
              const actionable = s.status === 'pending_manager' ? manage
                : s.status === 'pending_employee' ? target?.id === employee?.id : false;
              return (
                <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="flex min-w-0 gap-3">
                    {requester ? <Avatar first={requester.firstName} last={requester.lastName} seed={requester.avatarSeed} size={32} /> : null}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {requester?.preferredName} {requester?.lastName}
                        <span className="font-normal text-muted"> wants to {s.type === 'swap' ? 'swap with' : 'give away'} </span>
                        {target ? `${target.preferredName} ${target.lastName}` : 'anyone available'}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {shift ? `${fmtDate(shift.date)} · ${fmtTime(shift.start)} – ${fmtTime(shift.end)} · ${shift.role}` : 'Shift removed'}
                      </p>
                      <p className="mt-1 text-xs text-faint">{s.reason}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={s.status} />
                    {actionable ? (
                      <>
                        <Button size="xs" icon={X} onClick={() => decideSwap(s.id, false)}>Decline</Button>
                        <Button size="xs" variant="primary" icon={Check} onClick={() => decideSwap(s.id, true)}>
                          {s.status === 'pending_employee' ? 'Accept' : 'Approve'}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={composing} onClose={() => setComposing(false)} title="Request a shift swap" icon={Repeat}
        footer={
          <>
            <Button onClick={() => setComposing(false)}>Cancel</Button>
            <Button variant="primary" disabled={!form.shiftId || !form.reason}
              onClick={() => {
                requestSwap({
                  shiftId: form.shiftId,
                  targetEmployeeId: form.type === 'swap' ? form.targetEmployeeId || null : null,
                  type: form.type, reason: form.reason,
                });
                setComposing(false);
                setForm({ shiftId: '', targetEmployeeId: '', type: 'swap', reason: '' });
              }}>
              Send request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Which shift?" required>
            <Select value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
              <option value="">Select a shift…</option>
              {myFutureShifts.map((s) => (
                <option key={s.id} value={s.id}>{fmtDate(s.date)} · {fmtTime(s.start)} – {fmtTime(s.end)} · {s.role}</option>
              ))}
            </Select>
          </Field>
          <Field label="Request type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'swap' | 'giveaway' })}>
              <option value="swap">Swap with a specific coworker</option>
              <option value="giveaway">Give the shift away to anyone</option>
            </Select>
          </Field>
          {form.type === 'swap' ? (
            <Field label="Coworker">
              <Select value={form.targetEmployeeId} onChange={(e) => setForm({ ...form, targetEmployeeId: e.target.value })}>
                <option value="">Select a coworker…</option>
                {db.employees
                  .filter((e) => e.status === 'active' && e.departmentId === employee?.departmentId && e.id !== employee?.id)
                  .map((e) => <option key={e.id} value={e.id}>{e.preferredName} {e.lastName}</option>)}
              </Select>
            </Field>
          ) : null}
          <Field label="Reason" required>
            <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Family commitment that afternoon." />
          </Field>
          <Alert tone="info" title="Two-step approval">
            A coworker accepts first, then your supervisor gives final approval. The schedule updates only after both steps.
          </Alert>
        </div>
      </Modal>
    </div>
  );
};

/* ------------------------------------------------------- availability */

const AvailabilityTab = () => {
  const { db, employee, can } = useApp();
  const { setAvailability } = useActions();
  const lookups = useLookups();
  const mine = db.availability.filter((a) => a.employeeId === employee?.id);
  const [rows, setRows] = useState(
    () => Array.from({ length: 7 }, (_, dow) => {
      const found = mine.find((a) => a.dayOfWeek === dow);
      return found
        ? { dayOfWeek: dow, available: found.available, start: found.start, end: found.end, note: found.note }
        : { dayOfWeek: dow, available: dow !== 0 && dow !== 6, start: '08:00', end: '17:00', note: '' };
    }),
  );

  const teamAvailability = can('schedule.manage')
    ? db.availability.filter((a) => !a.available).slice(0, 24)
    : [];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="My availability" icon={Users}
          subtitle="Schedulers see this when building shifts. It is a preference, not a guarantee." />
        <ul className="space-y-2.5">
          {rows.map((r, i) => (
            <li key={r.dayOfWeek} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-2.5">
              <span className="w-10 text-sm font-medium">{DOW[r.dayOfWeek]}</span>
              <Toggle checked={r.available} onChange={(v) => setRows(rows.map((x, xi) => xi === i ? { ...x, available: v } : x))} />
              {r.available ? (
                <>
                  <Input type="time" value={r.start} className="w-28"
                    onChange={(e) => setRows(rows.map((x, xi) => xi === i ? { ...x, start: e.target.value } : x))} />
                  <span className="text-xs text-faint">to</span>
                  <Input type="time" value={r.end} className="w-28"
                    onChange={(e) => setRows(rows.map((x, xi) => xi === i ? { ...x, end: e.target.value } : x))} />
                </>
              ) : (
                <Input placeholder="Reason (optional)" value={r.note} className="flex-1 min-w-[8rem]"
                  onChange={(e) => setRows(rows.map((x, xi) => xi === i ? { ...x, note: e.target.value } : x))} />
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={() => setAvailability(rows)}>Save availability</Button>
        </div>
      </Card>

      {can('schedule.manage') ? (
        <Card>
          <CardHeader title="Team constraints" icon={AlertTriangle} subtitle="Recorded unavailability to work around" />
          {teamAvailability.length === 0 ? (
            <EmptyState compact title="No recorded constraints" />
          ) : (
            <ul className="divide-y divide-line">
              {teamAvailability.map((a) => {
                const e = lookups.employee.get(a.employeeId);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm">{e?.preferredName} {e?.lastName}</span>
                    <span className="text-xs text-muted">{DOW[a.dayOfWeek]}</span>
                    <span className="text-xs text-faint">{a.note || 'Unavailable'}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
};
