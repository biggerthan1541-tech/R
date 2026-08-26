/**
 * Domain actions.
 *
 * Every workflow that changes state goes through here so that audit entries,
 * notifications, task queues and automation rules fire consistently no matter
 * which screen triggered the change.
 */
import { useCallback, useMemo } from 'react';
import type {
  Application, BenefitEnrollment, CandidateStage, Database, Employee, EmploymentEvent,
  Expense, ExpenseReport, Goal, ID, ISODate, LifecycleAction, Offer, PayrollRun, Paycheck,
  PtoKind, Punch, PunchType, Shift, Timecard, TimecardDay, TrainingAssignment,
} from './types';
import { useApp } from './store';
import { uid } from './rng';
import { addDays, diffDays, startOfWeek, toISODate } from './dates';
import {
  PERIODS_PER_YEAR, blankTotals, calculatePaycheck, earningsFromTimecard, emptyEarnings, round2,
} from './payroll';
import { validatePayrollRun } from './validation';

/* ------------------------------------------------------------- utilities */

const HOUR = 3_600_000;

export const recalcTimecard = (tc: Timecard): void => {
  const sum = (f: (d: TimecardDay) => number) => round2(tc.days.reduce((s, d) => s + f(d), 0));
  tc.totalRegular = sum((d) => d.regularHours);
  tc.totalOvertime = sum((d) => d.overtimeHours);
  tc.totalDoubleTime = sum((d) => d.doubleTimeHours);
  tc.totalPto = sum((d) => d.ptoHours);
  tc.totalHoliday = sum((d) => d.holidayHours);
};

/** Re-splits a week's worked hours into regular / overtime / double time. */
export const applyOvertimeRules = (tc: Timecard): void => {
  const byWeek = new Map<string, TimecardDay[]>();
  for (const d of tc.days) {
    const wk = startOfWeek(d.date, 0);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk)!.push(d);
  }
  for (const week of byWeek.values()) {
    let worked = 0;
    for (const d of week) {
      const total = round2(d.regularHours + d.overtimeHours + d.doubleTimeHours);
      const before = worked;
      worked = round2(worked + total);
      if (worked <= 40) {
        d.regularHours = total; d.overtimeHours = 0; d.doubleTimeHours = 0;
      } else {
        const regular = Math.max(0, 40 - before);
        const excess = round2(total - regular);
        const dt = before + total > 52 ? round2(Math.min(excess, before + total - Math.max(52, before))) : 0;
        d.regularHours = round2(regular);
        d.overtimeHours = round2(excess - dt);
        d.doubleTimeHours = round2(dt);
      }
    }
  }
  recalcTimecard(tc);
};

const dayFromPunches = (punches: Punch[]): { worked: number; breakMinutes: number; missing: boolean } => {
  const ordered = [...punches].sort((a, b) => a.at.localeCompare(b.at));
  let worked = 0;
  let breakMs = 0;
  let inAt: number | null = null;
  let breakAt: number | null = null;
  for (const p of ordered) {
    const t = new Date(p.at).getTime();
    if (p.type === 'in') inAt = t;
    if (p.type === 'break_start' && inAt !== null) breakAt = t;
    if (p.type === 'break_end' && breakAt !== null) { breakMs += t - breakAt; breakAt = null; }
    if (p.type === 'out' && inAt !== null) { worked += t - inAt; inAt = null; }
  }
  const missing = inAt !== null;
  return {
    worked: round2(Math.max(0, (worked - breakMs) / HOUR)),
    breakMinutes: Math.round(breakMs / 60000),
    missing,
  };
};

export const openPunchState = (punches: Punch[]): 'out' | 'in' | 'break' => {
  const ordered = [...punches].sort((a, b) => a.at.localeCompare(b.at));
  let state: 'out' | 'in' | 'break' = 'out';
  for (const p of ordered) {
    if (p.type === 'in') state = 'in';
    else if (p.type === 'out') state = 'out';
    else if (p.type === 'break_start') state = 'break';
    else if (p.type === 'break_end') state = 'in';
  }
  return state;
};

export const periodFor = (db: Database, payGroupId: ID, date: ISODate) =>
  db.payPeriods.find((p) => p.payGroupId === payGroupId && p.start <= date && p.end >= date);

export const ensureTimecard = (draft: Database, employee: Employee, date: ISODate): Timecard => {
  const period = periodFor(draft, employee.payGroupId, date);
  if (!period) throw new Error('No pay period covers that date.');
  let tc = draft.timecards.find((t) => t.employeeId === employee.id && t.payPeriodId === period.id);
  if (!tc) {
    tc = {
      id: uid('tc'), employeeId: employee.id, periodStart: period.start, periodEnd: period.end,
      payPeriodId: period.id, status: 'open', days: [], totalRegular: 0, totalOvertime: 0,
      totalDoubleTime: 0, totalPto: 0, totalHoliday: 0, submittedAt: null, approvedBy: null,
      approvedAt: null, rejectionNote: null,
    };
    draft.timecards.push(tc);
  }
  if (!tc.days.some((d) => d.date === date)) {
    tc.days.push({
      date, regularHours: 0, overtimeHours: 0, doubleTimeHours: 0, breakMinutes: 0,
      ptoHours: 0, holidayHours: 0, exceptions: [], jobCode: 'GEN',
    });
    tc.days.sort((a, b) => a.date.localeCompare(b.date));
  }
  return tc;
};

export const ptoAvailable = (db: Database, employeeId: ID, kind: PtoKind): number => {
  const b = db.ptoBalances.find((x) => x.employeeId === employeeId && x.kind === kind);
  if (!b) return 0;
  return round2(b.accruedHours + b.carryoverHours - b.usedHours - b.pendingHours);
};

const employeeLabel = (e: Employee | undefined) => (e ? `${e.preferredName} ${e.lastName}` : 'Unknown');

/* ------------------------------------------------------------------ hook */

export const useActions = () => {
  const { db, update, user, employee, notify, createTask, runAutomation, toast, today } = useApp();

  const managerUserOf = useCallback(
    (emp: Employee | undefined) => {
      if (!emp?.managerId) return null;
      const mgr = db.employees.find((e) => e.id === emp.managerId);
      return mgr ? db.users.find((u) => u.id === mgr.userId) ?? null : null;
    },
    [db.employees, db.users],
  );

  /* ------------------------------------------------------------ time */

  const punch = useCallback(
    (type: PunchType, opts: { source?: Punch['source']; note?: string; jobCode?: string } = {}) => {
      if (!employee) return;
      const now = new Date();
      const date = toISODate(now);
      const loc = db.locations.find((l) => l.id === employee.locationId);
      update((draft) => {
        const emp = draft.employees.find((e) => e.id === employee.id)!;
        const tc = ensureTimecard(draft, emp, date);
        const newPunch: Punch = {
          id: uid('pn'), employeeId: emp.id, timecardId: tc.id, type, at: now.toISOString(),
          source: opts.source ?? 'web', locationId: emp.locationId,
          geo: loc && !emp.remote ? loc.geo : null,
          withinGeofence: true, ipAddress: '10.14.22.108', device: 'Chrome · this session',
          jobCode: opts.jobCode ?? 'GEN', note: opts.note ?? '', edited: false, editedBy: null,
        };
        draft.punches.push(newPunch);

        const dayPunches = draft.punches.filter((p) => p.employeeId === emp.id && p.at.slice(0, 10) === date);
        const computed = dayFromPunches(dayPunches);
        const day = tc.days.find((d) => d.date === date)!;
        day.regularHours = computed.worked;
        day.overtimeHours = 0;
        day.doubleTimeHours = 0;
        day.breakMinutes = computed.breakMinutes;
        day.exceptions = day.exceptions.filter((x) => x.kind !== 'missed_punch');
        applyOvertimeRules(tc);

        if (tc.totalOvertime > 0) {
          const mgr = draft.employees.find((e) => e.id === emp.managerId);
          if (mgr && !draft.notifications.some((n) => n.userId === mgr.userId && n.title.includes('Overtime') && n.createdAt.slice(0, 10) === date)) {
            draft.notifications.unshift({
              id: uid('ntf'), userId: mgr.userId, kind: 'timecard',
              title: `Overtime recorded — ${employeeLabel(emp)}`,
              body: `${tc.totalOvertime.toFixed(2)} overtime hours so far this pay period.`,
              createdAt: new Date().toISOString(), read: false, actionPath: '/time?tab=approvals',
              severity: 'warning', channels: ['in_app', 'email'],
            });
          }
        }
      }, {
        action: type === 'in' ? 'Clocked in' : type === 'out' ? 'Clocked out' : type === 'break_start' ? 'Started break' : 'Ended break',
        objectType: 'Punch', objectId: employee.id, objectLabel: employeeLabel(employee),
        module: 'Time & Attendance',
      });

      const label = { in: 'Clocked in', out: 'Clocked out', break_start: 'Break started', break_end: 'Back from break' }[type];
      toast({ kind: 'success', title: label, body: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
    },
    [db.locations, employee, update, toast],
  );

  const submitTimecard = useCallback(
    (timecardId: ID) => {
      const tc = db.timecards.find((t) => t.id === timecardId);
      if (!tc) return;
      const emp = db.employees.find((e) => e.id === tc.employeeId);
      update((draft) => {
        const live = draft.timecards.find((t) => t.id === timecardId)!;
        live.status = 'submitted';
        live.submittedAt = new Date().toISOString();
      }, {
        action: 'Submitted timecard', objectType: 'Timecard', objectId: timecardId,
        objectLabel: `${employeeLabel(emp)} · ${tc.periodStart} – ${tc.periodEnd}`, module: 'Time & Attendance',
      });
      const mgrUser = managerUserOf(emp);
      if (mgrUser) {
        notify({
          userId: mgrUser.id, kind: 'timecard', title: `Timecard submitted — ${employeeLabel(emp)}`,
          body: `${round2(tc.totalRegular + tc.totalOvertime)} hours for ${tc.periodStart} – ${tc.periodEnd}.`,
          actionPath: '/time?tab=approvals',
        });
        createTask({
          assigneeId: mgrUser.id, kind: 'timecard', title: `Approve timecard — ${employeeLabel(emp)}`,
          detail: `Pay period ${tc.periodStart} to ${tc.periodEnd}.`, dueDate: addDays(today, 1),
          priority: 'high', actionPath: '/time?tab=approvals', relatedId: timecardId,
        });
      }
      toast({ kind: 'success', title: 'Timecard submitted for approval' });
    },
    [db.timecards, db.employees, update, notify, createTask, managerUserOf, toast, today],
  );

  const decideTimecard = useCallback(
    (timecardId: ID, approve: boolean, note = '') => {
      const tc = db.timecards.find((t) => t.id === timecardId);
      if (!tc) return;
      const emp = db.employees.find((e) => e.id === tc.employeeId);
      update((draft) => {
        const live = draft.timecards.find((t) => t.id === timecardId)!;
        live.status = approve ? 'approved' : 'rejected';
        live.approvedBy = approve ? (employee?.id ?? null) : null;
        live.approvedAt = approve ? new Date().toISOString() : null;
        live.rejectionNote = approve ? null : note;
        for (const t of draft.tasks) {
          if (t.relatedId === timecardId && t.status === 'open') { t.status = 'completed'; t.completedAt = new Date().toISOString(); }
        }
      }, {
        action: approve ? 'Approved timecard' : 'Rejected timecard', objectType: 'Timecard',
        objectId: timecardId, objectLabel: `${employeeLabel(emp)} · ${tc.periodStart} – ${tc.periodEnd}`,
        module: 'Time & Attendance', severity: 'notice',
      });
      if (emp) {
        notify({
          userId: emp.userId, kind: 'timecard',
          title: approve ? 'Your timecard was approved' : 'Your timecard needs changes',
          body: approve
            ? `${tc.periodStart} – ${tc.periodEnd} approved and released to payroll.`
            : note || 'Your manager asked for a correction before approval.',
          severity: approve ? 'success' : 'warning', actionPath: '/time',
        });
      }
      toast({ kind: approve ? 'success' : 'info', title: approve ? 'Timecard approved' : 'Timecard returned to employee' });
    },
    [db.timecards, db.employees, employee, update, notify, toast],
  );

  const editTimecardDay = useCallback(
    (timecardId: ID, date: ISODate, patch: Partial<TimecardDay>, reason: string) => {
      const tc = db.timecards.find((t) => t.id === timecardId);
      const emp = db.employees.find((e) => e.id === tc?.employeeId);
      const before = tc?.days.find((d) => d.date === date);
      update((draft) => {
        const live = draft.timecards.find((t) => t.id === timecardId);
        if (!live) return;
        const day = live.days.find((d) => d.date === date);
        if (!day) return;
        Object.assign(day, patch);
        day.exceptions = day.exceptions.filter((x) => x.kind !== 'missed_punch');
        applyOvertimeRules(live);
      }, {
        action: 'Edited timecard', objectType: 'Timecard', objectId: timecardId,
        objectLabel: `${employeeLabel(emp)} · ${date}`, module: 'Time & Attendance', severity: 'notice',
        changes: [{
          field: 'hours',
          from: before ? `${round2(before.regularHours + before.overtimeHours)}h` : '—',
          to: `${round2((patch.regularHours ?? before?.regularHours ?? 0) + (patch.overtimeHours ?? before?.overtimeHours ?? 0))}h · ${reason}`,
        }],
      });
      toast({ kind: 'success', title: 'Timecard updated', body: reason });
    },
    [db.timecards, db.employees, update, toast],
  );

  const requestPunchCorrection = useCallback(
    (input: { timecardId: ID; date: ISODate; requestedChange: string; reason: string }) => {
      if (!employee) return;
      update((draft) => {
        draft.punchCorrections.unshift({
          id: uid('pc'), employeeId: employee.id, timecardId: input.timecardId, date: input.date,
          requestedChange: input.requestedChange, reason: input.reason, status: 'pending',
          createdAt: new Date().toISOString(), decidedBy: null, decidedAt: null, decisionNote: '',
        });
      }, {
        action: 'Requested punch correction', objectType: 'PunchCorrection', objectId: input.timecardId,
        objectLabel: `${employeeLabel(employee)} · ${input.date}`, module: 'Time & Attendance',
      });
      const mgrUser = managerUserOf(employee);
      if (mgrUser) {
        notify({
          userId: mgrUser.id, kind: 'timecard', title: `Punch correction — ${employeeLabel(employee)}`,
          body: `${input.date}: ${input.requestedChange}`, actionPath: '/time?tab=exceptions',
        });
      }
      toast({ kind: 'success', title: 'Correction requested', body: 'Your manager has been notified.' });
    },
    [employee, update, notify, managerUserOf, toast],
  );

  const decidePunchCorrection = useCallback(
    (id: ID, approve: boolean, note = '') => {
      const req = db.punchCorrections.find((c) => c.id === id);
      if (!req) return;
      const emp = db.employees.find((e) => e.id === req.employeeId);
      update((draft) => {
        const live = draft.punchCorrections.find((c) => c.id === id)!;
        live.status = approve ? 'approved' : 'denied';
        live.decidedBy = employee?.id ?? null;
        live.decidedAt = new Date().toISOString();
        live.decisionNote = note;
        if (approve) {
          const tc = draft.timecards.find((t) => t.id === req.timecardId);
          const day = tc?.days.find((d) => d.date === req.date);
          if (tc && day) {
            day.exceptions = day.exceptions.filter((x) => x.kind !== 'missed_punch');
            if (day.regularHours === 0) day.regularHours = 8;
            applyOvertimeRules(tc);
          }
        }
      }, {
        action: approve ? 'Approved punch correction' : 'Denied punch correction',
        objectType: 'PunchCorrection', objectId: id, objectLabel: `${employeeLabel(emp)} · ${req.date}`,
        module: 'Time & Attendance', severity: 'notice',
      });
      if (emp) {
        notify({
          userId: emp.userId, kind: 'timecard',
          title: approve ? 'Punch correction approved' : 'Punch correction denied',
          body: note || `${req.date}: ${req.requestedChange}`,
          severity: approve ? 'success' : 'warning', actionPath: '/time',
        });
      }
      toast({ kind: 'success', title: approve ? 'Correction applied' : 'Correction denied' });
    },
    [db.punchCorrections, db.employees, employee, update, notify, toast],
  );

  /* ---------------------------------------------------------- time off */

  const requestTimeOff = useCallback(
    (input: { employeeId?: ID; kind: PtoKind; startDate: ISODate; endDate: ISODate; hours: number; note: string; partialDay?: boolean }) => {
      const targetId = input.employeeId ?? employee?.id;
      if (!targetId) return;
      const emp = db.employees.find((e) => e.id === targetId)!;
      const available = ptoAvailable(db, targetId, input.kind);
      const policy = db.ptoPolicies.find((p) => p.id === emp.ptoPolicyId);
      const flags: string[] = [];
      const unlimited = policy?.accrualMethod === 'unlimited';
      if (!unlimited && input.hours > available) flags.push(`Exceeds available balance by ${round2(input.hours - available)}h`);
      const notice = diffDays(today, input.startDate);
      if (policy && notice < policy.minNoticeDays) flags.push(`Submitted inside the ${policy.minNoticeDays}-day notice window`);
      const blackout = db.blackouts.find(
        (b) => b.departmentIds.includes(emp.departmentId) && input.startDate <= b.endDate && input.endDate >= b.startDate,
      );
      if (blackout) flags.push(`Overlaps blackout period: ${blackout.name}`);

      const id = uid('pto');
      update((draft) => {
        draft.ptoRequests.unshift({
          id, employeeId: targetId, kind: input.kind, startDate: input.startDate, endDate: input.endDate,
          hours: input.hours, partialDay: input.partialDay ?? false, note: input.note, status: 'pending',
          createdAt: new Date().toISOString(), decidedBy: null, decidedAt: null, decisionNote: '', flags,
        });
        const bal = draft.ptoBalances.find((b) => b.employeeId === targetId && b.kind === input.kind);
        if (bal) bal.pendingHours = round2(bal.pendingHours + input.hours);
      }, {
        action: 'Requested time off', objectType: 'PtoRequest', objectId: id,
        objectLabel: `${employeeLabel(emp)} · ${input.startDate} – ${input.endDate}`, module: 'Time Off',
      });

      const mgrUser = managerUserOf(emp);
      if (mgrUser) {
        notify({
          userId: mgrUser.id, kind: 'pto', title: `Time-off request — ${employeeLabel(emp)}`,
          body: `${input.hours}h of ${input.kind.replace(/_/g, ' ')} from ${input.startDate} to ${input.endDate}.`,
          actionPath: `/time-off/requests/${id}`, severity: flags.length ? 'warning' : 'info',
        });
        createTask({
          assigneeId: mgrUser.id, kind: 'pto', title: `Approve time off — ${employeeLabel(emp)}`,
          detail: `${input.hours}h of ${input.kind.replace(/_/g, ' ')} from ${input.startDate}.`,
          dueDate: addDays(today, 2), priority: flags.length ? 'high' : 'normal',
          actionPath: `/time-off/requests/${id}`, relatedId: id,
        });
      }

      if (flags.some((f) => f.startsWith('Exceeds'))) {
        runAutomation('pto_exceeds_balance', {
          subjectEmployeeId: targetId,
          values: { requestedHours: input.hours, availableHours: available },
          tokens: {
            employee: employeeLabel(emp), hours: String(input.hours),
            available: String(available), delta: String(round2(input.hours - available)),
          },
        });
      }
      toast({ kind: 'success', title: 'Time-off request submitted', body: flags.length ? flags[0] : 'Your manager has been notified.' });
      return id;
    },
    [db, employee, update, notify, createTask, runAutomation, managerUserOf, toast, today],
  );

  const decideTimeOff = useCallback(
    (id: ID, approve: boolean, note = '') => {
      const req = db.ptoRequests.find((r) => r.id === id);
      if (!req) return;
      const emp = db.employees.find((e) => e.id === req.employeeId);
      update((draft) => {
        const live = draft.ptoRequests.find((r) => r.id === id)!;
        live.status = approve ? 'approved' : 'denied';
        live.decidedBy = employee?.id ?? null;
        live.decidedAt = new Date().toISOString();
        live.decisionNote = note;
        const bal = draft.ptoBalances.find((b) => b.employeeId === req.employeeId && b.kind === req.kind);
        if (bal) {
          bal.pendingHours = round2(Math.max(0, bal.pendingHours - req.hours));
          if (approve) bal.usedHours = round2(bal.usedHours + req.hours);
        }
        if (approve) {
          // Approved leave lands on the timecard so payroll picks it up.
          const target = draft.employees.find((e) => e.id === req.employeeId);
          if (target) {
            const days = diffDays(req.startDate, req.endDate) + 1;
            const perDay = req.hours / Math.max(1, days);
            for (let i = 0; i < days; i++) {
              const date = addDays(req.startDate, i);
              if (!periodFor(draft, target.payGroupId, date)) continue;
              try {
                const tc = ensureTimecard(draft, target, date);
                const day = tc.days.find((d) => d.date === date);
                if (day) day.ptoHours = round2(Math.min(8, perDay));
                recalcTimecard(tc);
              } catch { /* date outside the generated period window */ }
            }
          }
        }
        for (const t of draft.tasks) {
          if (t.relatedId === id && t.status === 'open') { t.status = 'completed'; t.completedAt = new Date().toISOString(); }
        }
      }, {
        action: approve ? 'Approved time-off request' : 'Denied time-off request',
        objectType: 'PtoRequest', objectId: id,
        objectLabel: `${employeeLabel(emp)} · ${req.startDate} – ${req.endDate}`,
        module: 'Time Off', severity: 'notice',
      });
      if (emp) {
        notify({
          userId: emp.userId, kind: 'pto',
          title: approve ? 'Time off approved' : 'Time off denied',
          body: `${req.startDate} – ${req.endDate}${note ? ` · ${note}` : ''}`,
          severity: approve ? 'success' : 'warning', actionPath: '/time-off',
          channels: ['in_app', 'email', 'push'],
        });
      }
      toast({ kind: approve ? 'success' : 'info', title: approve ? 'Request approved' : 'Request denied' });
    },
    [db.ptoRequests, db.employees, employee, update, notify, toast],
  );

  const cancelTimeOff = useCallback(
    (id: ID) => {
      const req = db.ptoRequests.find((r) => r.id === id);
      if (!req) return;
      update((draft) => {
        const live = draft.ptoRequests.find((r) => r.id === id)!;
        const wasApproved = live.status === 'approved';
        live.status = 'cancelled';
        const bal = draft.ptoBalances.find((b) => b.employeeId === req.employeeId && b.kind === req.kind);
        if (bal) {
          if (wasApproved) bal.usedHours = round2(Math.max(0, bal.usedHours - req.hours));
          else bal.pendingHours = round2(Math.max(0, bal.pendingHours - req.hours));
        }
      }, {
        action: 'Cancelled time-off request', objectType: 'PtoRequest', objectId: id,
        objectLabel: `${req.startDate} – ${req.endDate}`, module: 'Time Off',
      });
      toast({ kind: 'info', title: 'Request cancelled', body: 'The hours have been returned to your balance.' });
    },
    [db.ptoRequests, update, toast],
  );

  /* -------------------------------------------------------- scheduling */

  const saveShift = useCallback(
    (shift: Partial<Shift> & { id?: ID }) => {
      const isNew = !shift.id;
      const id = shift.id ?? uid('sh');
      update((draft) => {
        if (isNew) {
          draft.shifts.push({
            id, employeeId: shift.employeeId ?? null, departmentId: shift.departmentId ?? 'dep_ops',
            locationId: shift.locationId ?? 'loc_den', date: shift.date ?? today,
            start: shift.start ?? '09:00', end: shift.end ?? '17:00', breakMinutes: shift.breakMinutes ?? 30,
            role: shift.role ?? 'General', jobCode: shift.jobCode ?? 'GEN',
            status: shift.status ?? 'draft', note: shift.note ?? '', publishedAt: null,
            createdBy: user?.id ?? 'system',
          });
        } else {
          const live = draft.shifts.find((s) => s.id === id);
          if (live) Object.assign(live, shift);
        }
      }, {
        action: isNew ? 'Created shift' : 'Updated shift', objectType: 'Shift', objectId: id,
        objectLabel: `${shift.date ?? ''} ${shift.start ?? ''}–${shift.end ?? ''}`, module: 'Scheduling',
      });
      toast({ kind: 'success', title: isNew ? 'Shift created' : 'Shift updated' });
      return id;
    },
    [update, toast, today, user],
  );

  const deleteShift = useCallback(
    (id: ID) => {
      update((draft) => {
        draft.shifts = draft.shifts.filter((s) => s.id !== id);
      }, { action: 'Deleted shift', objectType: 'Shift', objectId: id, objectLabel: id, module: 'Scheduling', severity: 'notice' });
      toast({ kind: 'info', title: 'Shift removed' });
    },
    [update, toast],
  );

  const publishSchedule = useCallback(
    (weekStart: ISODate, departmentId: ID | 'all') => {
      const weekEnd = addDays(weekStart, 6);
      let count = 0;
      const affected = new Set<ID>();
      update((draft) => {
        for (const s of draft.shifts) {
          if (s.date < weekStart || s.date > weekEnd) continue;
          if (departmentId !== 'all' && s.departmentId !== departmentId) continue;
          if (s.status !== 'draft') continue;
          s.status = s.employeeId ? 'published' : 'open';
          s.publishedAt = new Date().toISOString();
          count++;
          if (s.employeeId) affected.add(s.employeeId);
        }
        for (const empId of affected) {
          const emp = draft.employees.find((e) => e.id === empId);
          if (!emp) continue;
          draft.notifications.unshift({
            id: uid('ntf'), userId: emp.userId, kind: 'schedule', title: 'Your schedule was published',
            body: `Shifts for the week of ${weekStart} are now available.`,
            createdAt: new Date().toISOString(), read: false, actionPath: '/scheduling',
            severity: 'info', channels: ['in_app', 'push'],
          });
        }
      }, {
        action: 'Published schedule', objectType: 'Shift', objectId: weekStart,
        objectLabel: `Week of ${weekStart}`, module: 'Scheduling', severity: 'notice',
      });
      toast({ kind: 'success', title: `Published ${count} shift${count === 1 ? '' : 's'}`, body: `${affected.size} employees notified.` });
    },
    [update, toast],
  );

  const claimOpenShift = useCallback(
    (shiftId: ID) => {
      if (!employee) return;
      update((draft) => {
        const s = draft.shifts.find((x) => x.id === shiftId);
        if (!s) return;
        s.employeeId = employee.id;
        s.status = 'published';
        s.note = 'Picked up by employee';
      }, {
        action: 'Claimed open shift', objectType: 'Shift', objectId: shiftId,
        objectLabel: employeeLabel(employee), module: 'Scheduling',
      });
      const mgrUser = managerUserOf(employee);
      if (mgrUser) {
        notify({ userId: mgrUser.id, kind: 'schedule', title: `${employeeLabel(employee)} picked up an open shift`, body: 'Coverage confirmed.', actionPath: '/scheduling' });
      }
      toast({ kind: 'success', title: 'Shift added to your schedule' });
    },
    [employee, update, notify, managerUserOf, toast],
  );

  const requestSwap = useCallback(
    (input: { shiftId: ID; targetEmployeeId: ID | null; type: 'swap' | 'giveaway'; reason: string }) => {
      if (!employee) return;
      const id = uid('swap');
      update((draft) => {
        draft.shiftSwaps.unshift({
          id, shiftId: input.shiftId, requesterId: employee.id, targetEmployeeId: input.targetEmployeeId,
          type: input.type, status: input.targetEmployeeId ? 'pending_employee' : 'pending_manager',
          createdAt: new Date().toISOString(), reason: input.reason, decidedBy: null, decidedAt: null,
        });
      }, {
        action: 'Requested shift swap', objectType: 'ShiftSwap', objectId: id,
        objectLabel: employeeLabel(employee), module: 'Scheduling',
      });
      const target = input.targetEmployeeId ? db.employees.find((e) => e.id === input.targetEmployeeId) : null;
      if (target) {
        notify({ userId: target.userId, kind: 'schedule', title: `${employeeLabel(employee)} asked to swap a shift`, body: input.reason, actionPath: '/scheduling?tab=swaps' });
      } else {
        const mgrUser = managerUserOf(employee);
        if (mgrUser) notify({ userId: mgrUser.id, kind: 'schedule', title: `Shift giveaway — ${employeeLabel(employee)}`, body: input.reason, actionPath: '/scheduling?tab=swaps' });
      }
      toast({ kind: 'success', title: 'Swap request sent' });
    },
    [employee, db.employees, update, notify, managerUserOf, toast],
  );

  const decideSwap = useCallback(
    (id: ID, approve: boolean) => {
      const swap = db.shiftSwaps.find((s) => s.id === id);
      if (!swap) return;
      update((draft) => {
        const live = draft.shiftSwaps.find((s) => s.id === id)!;
        if (approve && live.status === 'pending_employee') {
          live.status = 'pending_manager';
        } else {
          live.status = approve ? 'approved' : 'denied';
          live.decidedBy = employee?.id ?? null;
          live.decidedAt = new Date().toISOString();
          if (approve) {
            const shift = draft.shifts.find((s) => s.id === live.shiftId);
            if (shift) {
              shift.employeeId = live.targetEmployeeId ?? null;
              shift.status = live.targetEmployeeId ? 'published' : 'open';
            }
          }
        }
      }, {
        action: approve ? 'Approved shift swap' : 'Denied shift swap', objectType: 'ShiftSwap',
        objectId: id, objectLabel: id, module: 'Scheduling', severity: 'notice',
      });
      const requester = db.employees.find((e) => e.id === swap.requesterId);
      if (requester) {
        notify({
          userId: requester.userId, kind: 'schedule',
          title: approve ? 'Shift swap approved' : 'Shift swap denied',
          body: approve ? 'Your schedule has been updated.' : 'Talk to your supervisor about coverage.',
          severity: approve ? 'success' : 'warning', actionPath: '/scheduling',
        });
      }
      toast({ kind: 'success', title: approve ? 'Swap approved' : 'Swap denied' });
    },
    [db.shiftSwaps, db.employees, employee, update, notify, toast],
  );

  const setAvailability = useCallback(
    (entries: { dayOfWeek: number; available: boolean; start: string; end: string; note: string }[]) => {
      if (!employee) return;
      update((draft) => {
        draft.availability = draft.availability.filter((a) => a.employeeId !== employee.id);
        for (const e of entries) {
          draft.availability.push({ id: uid('av'), employeeId: employee.id, ...e });
        }
      }, {
        action: 'Updated availability', objectType: 'Availability', objectId: employee.id,
        objectLabel: employeeLabel(employee), module: 'Scheduling',
      });
      toast({ kind: 'success', title: 'Availability saved' });
    },
    [employee, update, toast],
  );

  return useMemo(() => ({
    punch, submitTimecard, decideTimecard, editTimecardDay, requestPunchCorrection, decidePunchCorrection,
    requestTimeOff, decideTimeOff, cancelTimeOff,
    saveShift, deleteShift, publishSchedule, claimOpenShift, requestSwap, decideSwap, setAvailability,
  }), [
    punch, submitTimecard, decideTimecard, editTimecardDay, requestPunchCorrection, decidePunchCorrection,
    requestTimeOff, decideTimeOff, cancelTimeOff,
    saveShift, deleteShift, publishSchedule, claimOpenShift, requestSwap, decideSwap, setAvailability,
  ]);
};

/* --------------------------------------------------- payroll operations */

export const usePayrollActions = () => {
  const { db, update, employee, notify, createTask, runAutomation, toast, today } = useApp();

  const buildChecks = useCallback((draft: Database, run: PayrollRun): Paycheck[] => {
    const pg = draft.payGroups.find((p) => p.id === run.payGroupId)!;
    const period = draft.payPeriods.find((p) => p.id === run.payPeriodId)!;
    const staff = draft.employees.filter(
      (e) => e.payGroupId === pg.id && e.status !== 'pending_hire' &&
        e.hireDate <= period.end && (!e.terminationDate || e.terminationDate >= period.start),
    );
    const year = period.start.slice(0, 4);
    const checks: Paycheck[] = [];
    let seq = 900000 + draft.paychecks.length;

    for (const emp of staff) {
      const tc = draft.timecards.find((t) => t.employeeId === emp.id && t.payPeriodId === period.id);
      const earnings = emp.payType === 'hourly' ? earningsFromTimecard(tc) : emptyEarnings();
      if (emp.payType === 'salary') {
        earnings.regularHours = round2((emp.standardHoursPerWeek * 52) / PERIODS_PER_YEAR[pg.frequency]);
        if (tc) earnings.ptoHours = tc.totalPto;
      }
      const reimbursable = draft.expenseReports.filter(
        (r) => r.employeeId === emp.id && r.status === 'approved' && !r.reimbursedOnCheck,
      );
      earnings.reimbursement = round2(reimbursable.reduce((s, r) => s + r.total, 0));

      const enrollments = draft.benefitEnrollments.filter((e) => e.employeeId === emp.id);
      const k401 = enrollments.find((e) => e.planId === 'plan_401k');
      const ytdBefore = draft.paychecks
        .filter((c) => c.employeeId === emp.id && c.checkDate.startsWith(year) && c.status !== 'voided')
        .reduce((s, c) => s + c.grossPay, 0);

      const result = calculatePaycheck({
        employee: emp, frequency: pg.frequency, earnings,
        taxProfile: draft.taxProfiles.find((t) => t.employeeId === emp.id),
        enrollments, plans: draft.benefitPlans,
        garnishments: draft.garnishments.filter((g) => g.employeeId === emp.id && g.active),
        ytdGrossBefore: ytdBefore,
        retirementPercent: k401?.contributionAmount ?? 0,
      });

      checks.push({
        id: uid('chk'), payrollRunId: run.id, employeeId: emp.id, payPeriodId: period.id,
        checkNumber: String(++seq), checkDate: period.checkDate,
        method: draft.directDeposits.some((d) => d.employeeId === emp.id && d.active) ? 'direct_deposit' : 'check',
        earnings: result.earnings, deductions: result.deductions, taxes: result.taxes,
        grossPay: result.grossPay, netPay: result.netPay, totalHours: result.totalHours,
        ytdGross: round2(ytdBefore + result.grossPay),
        ytdNet: round2(result.netPay), ytdTaxes: round2(result.employeeTaxTotal),
        status: 'draft', employeeAcknowledged: false,
      });

      for (const r of reimbursable) r.reimbursedOnCheck = checks[checks.length - 1].id;
    }
    return checks;
  }, []);

  const createRun = useCallback(
    (payGroupId: ID, payPeriodId: ID, type: PayrollRun['type'] = 'regular') => {
      const period = db.payPeriods.find((p) => p.id === payPeriodId)!;
      const pg = db.payGroups.find((p) => p.id === payGroupId)!;
      const id = uid('run');
      update((draft) => {
        draft.payrollRuns.unshift({
          id, payGroupId, payPeriodId,
          runNumber: `${payGroupId === 'pg_corp' ? 'C' : 'F'}${period.start.slice(0, 4)}-${String(period.sequence).padStart(3, '0')}${type === 'regular' ? '' : '-OC'}`,
          type, status: 'gathering', createdAt: new Date().toISOString(),
          createdBy: employee?.userId ?? 'system', calculatedAt: null, approvedBy: null, approvedAt: null,
          finalizedAt: null, totals: blankTotals(), employeeCount: 0, note: '',
        });
      }, {
        action: 'Created payroll run', objectType: 'PayrollRun', objectId: id,
        objectLabel: `${pg.name} · ${period.start} – ${period.end}`, module: 'Payroll', severity: 'notice',
      });
      toast({ kind: 'success', title: 'Payroll run created', body: 'Gathering time, compensation and deductions.' });
      return id;
    },
    [db.payPeriods, db.payGroups, employee, update, toast],
  );

  const calculateRun = useCallback(
    (runId: ID) => {
      update((draft) => {
        const run = draft.payrollRuns.find((r) => r.id === runId);
        if (!run) return;
        draft.paychecks = draft.paychecks.filter((c) => c.payrollRunId !== runId);
        const checks = buildChecks(draft, run);
        draft.paychecks.push(...checks);

        const totals = blankTotals();
        for (const c of checks) {
          totals.grossPay = round2(totals.grossPay + c.grossPay);
          totals.netPay = round2(totals.netPay + c.netPay);
          totals.employeeTaxes = round2(totals.employeeTaxes + c.taxes.reduce((s, t) => s + t.amount, 0));
          totals.employerTaxes = round2(totals.employerTaxes + c.taxes.reduce((s, t) => s + t.employerAmount, 0));
          totals.preTaxDeductions = round2(totals.preTaxDeductions + c.deductions.filter((d) => d.preTax).reduce((s, d) => s + d.amount, 0));
          totals.postTaxDeductions = round2(totals.postTaxDeductions + c.deductions.filter((d) => !d.preTax).reduce((s, d) => s + d.amount, 0));
          totals.employerBenefits = round2(totals.employerBenefits + c.deductions.reduce((s, d) => s + d.employerAmount, 0));
          totals.reimbursements = round2(totals.reimbursements + c.earnings.filter((e) => e.code === 'reimbursement').reduce((s, e) => s + e.amount, 0));
          totals.hours = round2(totals.hours + c.totalHours);
        }
        totals.totalCost = round2(totals.grossPay + totals.employerTaxes + totals.employerBenefits);
        run.totals = totals;
        run.employeeCount = checks.length;
        run.status = 'calculated';
        run.calculatedAt = new Date().toISOString();
      }, {
        action: 'Calculated payroll', objectType: 'PayrollRun', objectId: runId,
        objectLabel: runId, module: 'Payroll', severity: 'notice',
      });
      toast({ kind: 'success', title: 'Payroll calculated', body: 'Run validation to check for errors before approval.' });
    },
    [buildChecks, update, toast],
  );

  const runValidation = useCallback(
    (runId: ID) => {
      let summary = { error: 0, warning: 0, review: 0 };
      update((draft) => {
        const run = draft.payrollRuns.find((r) => r.id === runId);
        if (!run) return;
        const period = draft.payPeriods.find((p) => p.id === run.payPeriodId)!;
        const priorPeriod = draft.payPeriods
          .filter((p) => p.payGroupId === run.payGroupId && p.end < period.start)
          .sort((a, b) => a.start.localeCompare(b.start)).at(-1);
        const compChanged = new Set(
          draft.compensation
            .filter((c) => c.effectiveDate >= period.start && c.effectiveDate <= period.end)
            .map((c) => c.employeeId),
        );
        draft.payrollIssues = draft.payrollIssues.filter((i) => i.payrollRunId !== runId);
        const issues = validatePayrollRun({
          run,
          paychecks: draft.paychecks.filter((c) => c.payrollRunId === runId),
          priorPaychecks: priorPeriod ? draft.paychecks.filter((c) => c.payPeriodId === priorPeriod.id) : [],
          employees: draft.employees,
          timecards: draft.timecards,
          taxProfiles: draft.taxProfiles,
          directDeposits: draft.directDeposits,
          enrollments: draft.benefitEnrollments,
          compensationChangedIds: compChanged,
        });
        draft.payrollIssues.push(...issues);
        run.status = 'validation';
        summary = {
          error: issues.filter((i) => i.level === 'error').length,
          warning: issues.filter((i) => i.level === 'warning').length,
          review: issues.filter((i) => i.level === 'review').length,
        };
      }, {
        action: 'Ran payroll validation', objectType: 'PayrollRun', objectId: runId,
        objectLabel: runId, module: 'Payroll',
      });
      toast({
        kind: summary.error ? 'warning' : 'success',
        title: summary.error ? `${summary.error} blocking error(s) found` : 'Validation clean',
        body: `${summary.warning} warning(s), ${summary.review} item(s) needing review.`,
      });
    },
    [update, toast],
  );

  const resolveIssue = useCallback(
    (issueId: ID, note: string) => {
      update((draft) => {
        const issue = draft.payrollIssues.find((i) => i.id === issueId);
        if (!issue) return;
        issue.resolved = true;
        issue.resolvedBy = employee?.id ?? null;
        issue.resolvedAt = new Date().toISOString();
        issue.resolutionNote = note;
      }, {
        action: 'Resolved payroll exception', objectType: 'PayrollIssue', objectId: issueId,
        objectLabel: issueId, module: 'Payroll', severity: 'notice',
        changes: [{ field: 'resolved', from: 'false', to: `true · ${note}` }],
      });
      toast({ kind: 'success', title: 'Exception resolved' });
    },
    [employee, update, toast],
  );

  const advanceRun = useCallback(
    (runId: ID, to: PayrollRun['status']) => {
      const run = db.payrollRuns.find((r) => r.id === runId);
      if (!run) return;
      update((draft) => {
        const live = draft.payrollRuns.find((r) => r.id === runId)!;
        live.status = to;
        if (to === 'approved') {
          live.approvedBy = employee?.id ?? null;
          live.approvedAt = new Date().toISOString();
        }
        if (to === 'finalized') {
          live.finalizedAt = new Date().toISOString();
          for (const c of draft.paychecks) if (c.payrollRunId === runId) c.status = 'issued';
          for (const t of draft.timecards) if (t.payPeriodId === live.payPeriodId && t.status === 'approved') t.status = 'paid';
          const period = draft.payPeriods.find((p) => p.id === live.payPeriodId);
          if (period) period.status = 'closed';
        }
        if (to === 'paid') {
          for (const c of draft.paychecks) {
            if (c.payrollRunId !== runId) continue;
            const emp = draft.employees.find((e) => e.id === c.employeeId);
            if (!emp) continue;
            draft.notifications.unshift({
              id: uid('ntf'), userId: emp.userId, kind: 'payroll', title: 'Your pay statement is available',
              body: `Net pay of $${c.netPay.toFixed(2)} deposited on ${c.checkDate}.`,
              createdAt: new Date().toISOString(), read: false, actionPath: '/payroll',
              severity: 'success', channels: ['in_app', 'email', 'push'],
            });
          }
        }
      }, {
        action: `Payroll moved to ${to.replace(/_/g, ' ')}`, objectType: 'PayrollRun', objectId: runId,
        objectLabel: run.runNumber, module: 'Payroll',
        severity: to === 'finalized' || to === 'paid' ? 'critical' : 'notice',
        changes: [{ field: 'status', from: run.status, to }],
      });

      if (to === 'employee_review') {
        toast({ kind: 'success', title: 'Released for employee review', body: 'Employees can preview their statements before the check date.' });
      } else if (to === 'pending_approval') {
        const approvers = db.users.filter((u) => u.roles.includes('payroll_admin') || u.roles.includes('finance')).slice(0, 2);
        for (const a of approvers) {
          notify({ userId: a.id, kind: 'payroll', title: `Payroll ${run.runNumber} needs approval`, body: `${run.employeeCount} employees · $${run.totals.grossPay.toFixed(2)} gross.`, actionPath: `/payroll/runs/${runId}`, severity: 'warning' });
          createTask({ assigneeId: a.id, kind: 'payroll', title: `Approve payroll ${run.runNumber}`, detail: 'Final review before funding.', dueDate: addDays(today, 1), priority: 'urgent', actionPath: `/payroll/runs/${runId}`, relatedId: runId });
        }
        toast({ kind: 'success', title: 'Submitted for approval' });
      } else {
        toast({ kind: 'success', title: `Payroll ${to.replace(/_/g, ' ')}` });
      }

      if (to === 'finalized') {
        runAutomation('payroll_anomaly', {
          subjectEmployeeId: null,
          values: { netChangePercent: 0 },
          tokens: { employee: 'Payroll run', delta: '0' },
        });
      }
    },
    [db.payrollRuns, db.users, employee, update, notify, createTask, runAutomation, toast, today],
  );

  const acknowledgePaycheck = useCallback(
    (checkId: ID) => {
      update((draft) => {
        const c = draft.paychecks.find((x) => x.id === checkId);
        if (c) c.employeeAcknowledged = true;
      }, { action: 'Acknowledged pay statement', objectType: 'Paycheck', objectId: checkId, objectLabel: checkId, module: 'Payroll' });
      toast({ kind: 'success', title: 'Pay statement acknowledged' });
    },
    [update, toast],
  );

  return { createRun, calculateRun, runValidation, resolveIssue, advanceRun, acknowledgePaycheck };
};

/* ------------------------------------------------ people & lifecycle ops */

export const usePeopleActions = () => {
  const { db, update, employee, notify, createTask, runAutomation, toast, today } = useApp();

  const updateEmployee = useCallback(
    (employeeId: ID, patch: Partial<Employee>, opts: { module?: string; action?: string } = {}) => {
      const before = db.employees.find((e) => e.id === employeeId);
      if (!before) return;
      const changes = Object.entries(patch)
        .filter(([k, v]) => String((before as unknown as Record<string, unknown>)[k]) !== String(v))
        .map(([k, v]) => ({ field: k, from: String((before as unknown as Record<string, unknown>)[k] ?? '—'), to: String(v) }));
      update((draft) => {
        const live = draft.employees.find((e) => e.id === employeeId);
        if (live) Object.assign(live, patch);
      }, {
        action: opts.action ?? 'Updated employee record', objectType: 'Employee', objectId: employeeId,
        objectLabel: `${before.firstName} ${before.lastName}`, module: opts.module ?? 'HR',
        severity: changes.some((c) => ['baseSalary', 'hourlyRate', 'status', 'managerId'].includes(c.field)) ? 'critical' : 'info',
        changes,
      });
      toast({ kind: 'success', title: 'Record updated' });
    },
    [db.employees, update, toast],
  );

  const lifecycleAction = useCallback(
    (input: {
      employeeId: ID; action: LifecycleAction; effectiveDate: ISODate; note: string;
      patch: Partial<Employee>; summary: string; newSalary?: number; newHourlyRate?: number; changeReason?: string;
    }) => {
      const target = db.employees.find((e) => e.id === input.employeeId);
      if (!target) return;
      const changes: EmploymentEvent['changes'] = Object.entries(input.patch).map(([k, v]) => ({
        field: k,
        from: String((target as unknown as Record<string, unknown>)[k] ?? '—'),
        to: String(v),
      }));

      update((draft) => {
        const live = draft.employees.find((e) => e.id === input.employeeId)!;
        Object.assign(live, input.patch);
        draft.employmentEvents.unshift({
          id: uid('evt'), employeeId: input.employeeId, action: input.action,
          effectiveDate: input.effectiveDate, createdAt: new Date().toISOString(),
          createdBy: employee?.userId ?? 'system', summary: input.summary, changes, note: input.note,
        });
        if (input.newSalary !== undefined || input.newHourlyRate !== undefined) {
          const prior = draft.compensation.filter((c) => c.employeeId === input.employeeId).at(-1);
          const annual = input.newSalary ?? live.baseSalary;
          const hourly = input.newHourlyRate ?? live.hourlyRate;
          draft.compensation.push({
            id: uid('comp'), employeeId: input.employeeId, effectiveDate: input.effectiveDate,
            payType: live.payType, annualSalary: Math.round(annual), hourlyRate: round2(hourly),
            changeReason: input.changeReason ?? input.summary,
            changePercent: prior && prior.annualSalary
              ? Number((((annual - prior.annualSalary) / prior.annualSalary) * 100).toFixed(1))
              : 0,
            approvedBy: employee?.id ?? null,
          });
          live.baseSalary = Math.round(annual);
          live.hourlyRate = round2(hourly);
        }
        if (input.action === 'termination') {
          const account = draft.users.find((u) => u.id === live.userId);
          if (account) { account.status = 'disabled'; account.sessions = []; }
        }
      }, {
        action: `Lifecycle: ${input.action.replace(/_/g, ' ')}`, objectType: 'Employee',
        objectId: input.employeeId, objectLabel: `${target.firstName} ${target.lastName}`,
        module: 'HR', severity: 'critical', changes,
      });

      if (input.action === 'compensation_change' || input.action === 'promotion') {
        runAutomation('compensation_changed', {
          subjectEmployeeId: input.employeeId,
          values: {},
          tokens: {
            employee: `${target.preferredName} ${target.lastName}`,
            newValue: input.newSalary ? `$${Math.round(input.newSalary).toLocaleString()}` : `$${input.newHourlyRate}/hr`,
            date: input.effectiveDate,
          },
        });
      }
      if (input.action === 'termination') {
        runAutomation('termination_processed', {
          subjectEmployeeId: input.employeeId, values: {},
          tokens: { employee: `${target.preferredName} ${target.lastName}`, date: input.effectiveDate },
        });
      }
      toast({ kind: 'success', title: `${input.summary} recorded`, body: `Effective ${input.effectiveDate}.` });
    },
    [db.employees, employee, update, runAutomation, toast],
  );

  /** Converts an accepted candidate into a full employee record. */
  const hireCandidate = useCallback(
    (applicationId: ID, overrides: { startDate: ISODate; managerId: ID; locationId: ID; payGroupId: ID }) => {
      const app = db.applications.find((a) => a.id === applicationId);
      if (!app) return null;
      const candidate = db.candidates.find((c) => c.id === app.candidateId);
      const req = db.requisitions.find((r) => r.id === app.requisitionId);
      const offer = db.offers.find((o) => o.applicationId === applicationId);
      if (!candidate || !req) return null;

      const empId = uid('emp');
      const userId = uid('usr');
      const packetId = uid('pkt');
      const job = db.jobTitles.find((j) => j.id === req.jobTitleId)!;

      update((draft) => {
        const number = `CP-${1000 + draft.employees.length + 1}`;
        const newEmployee: Employee = {
          id: empId, employeeNumber: number, userId,
          firstName: candidate.firstName, lastName: candidate.lastName, preferredName: candidate.firstName,
          email: `${candidate.firstName}.${candidate.lastName}`.toLowerCase().replace(/[^a-z.]/g, '') + '@cardinalpeak.com',
          personalEmail: candidate.email, phone: candidate.phone,
          avatarSeed: `${candidate.firstName}${candidate.lastName}`,
          dob: addDays(today, -30 * 365), ssnLast4: '0000', gender: 'undisclosed',
          ethnicity: 'Prefer not to disclose', veteranStatus: 'undisclosed',
          addressLine1: '—', city: candidate.city, state: candidate.state, postalCode: '00000',
          status: overrides.startDate > today ? 'pending_hire' : 'active',
          employmentType: req.employmentType,
          hireDate: overrides.startDate, seniorityDate: overrides.startDate,
          terminationDate: null, terminationReason: null, rehireEligible: true,
          departmentId: req.departmentId, jobTitleId: req.jobTitleId, locationId: overrides.locationId,
          managerId: overrides.managerId, payGroupId: overrides.payGroupId,
          payType: offer?.payType ?? (job.flsa === 'exempt' ? 'salary' : 'hourly'),
          baseSalary: offer?.baseSalary ?? job.minSalary,
          hourlyRate: offer?.hourlyRate ?? 0,
          standardHoursPerWeek: 40,
          ptoPolicyId: job.flsa === 'exempt' ? 'pto_std' : 'pto_hourly',
          emergencyContacts: [], skills: candidate.skills, certifications: [],
          badgeId: `BDG${Math.floor(Math.random() * 90000 + 10000)}`,
          roles: ['employee'], onboardingPacketId: packetId, candidateId: candidate.id,
          workAuthorized: true, i9Complete: false, remote: overrides.locationId === 'loc_rmt',
          bio: `${job.name} joining ${req.departmentId.replace('dep_', '').toUpperCase()}.`,
        };
        draft.employees.push(newEmployee);

        draft.users.push({
          id: userId, employeeId: empId, email: newEmployee.email,
          displayName: `${candidate.firstName} ${candidate.lastName}`, roles: ['employee'],
          status: 'invited', mfaEnabled: false, mfaMethod: null, lastLoginAt: null,
          passwordUpdatedAt: today, failedAttempts: 0, sessions: [], permissionOverrides: [],
        });

        draft.taxProfiles.push({
          employeeId: empId, filingStatus: 'single', federalAllowances: 0, additionalFederal: 0,
          stateCode: candidate.state, stateAllowances: 0, additionalState: 0, exemptFederal: false,
          w4Year: Number(today.slice(0, 4)), lastUpdated: today, complete: false,
        });

        draft.compensation.push({
          id: uid('comp'), employeeId: empId, effectiveDate: overrides.startDate,
          payType: newEmployee.payType, annualSalary: newEmployee.baseSalary,
          hourlyRate: newEmployee.hourlyRate, changeReason: 'New hire', changePercent: 0,
          approvedBy: overrides.managerId,
        });

        draft.employmentEvents.unshift({
          id: uid('evt'), employeeId: empId, action: 'hire', effectiveDate: overrides.startDate,
          createdAt: new Date().toISOString(), createdBy: employee?.userId ?? 'system',
          summary: `Hired as ${job.name}`,
          changes: [{ field: 'status', from: '—', to: 'pending_hire' }],
          note: `Converted from candidate ${candidate.firstName} ${candidate.lastName} on requisition ${req.code}.`,
        });

        // Onboarding packet from the matching template.
        const template = draft.onboardingTemplates.find((t) => t.departmentIds.includes(req.departmentId))
          ?? draft.onboardingTemplates[0];
        draft.onboardingPackets.push({
          id: packetId, employeeId: empId, templateId: template.id, startDate: overrides.startDate,
          status: 'not_started', createdAt: new Date().toISOString(), completedAt: null,
          buddyId: draft.employees.find((e) => e.departmentId === req.departmentId && e.id !== empId)?.id ?? null,
        });
        template.tasks.forEach((t, i) => {
          draft.onboardingTasks.push({
            id: uid('otk'), packetId, key: t.key, title: t.title, owner: t.owner, kind: t.kind,
            dueDate: addDays(overrides.startDate, t.dueOffsetDays), required: t.required,
            description: t.description, status: 'not_started', completedAt: null, completedBy: null,
            documentId: null,
          });
          void i;
        });

        // Required training bundle.
        const required = draft.courses.filter((c) => c.mandatory && c.category !== 'safety');
        for (const course of required) {
          draft.trainingAssignments.push({
            id: uid('trn'), courseId: course.id, employeeId: empId,
            assignedBy: employee?.id ?? 'system', assignedAt: new Date().toISOString(),
            dueDate: addDays(overrides.startDate, 30), status: 'assigned', progressPercent: 0,
            completedAt: null, score: null, certificateId: null,
          });
        }

        // Close out the pipeline.
        const liveApp = draft.applications.find((a) => a.id === applicationId)!;
        liveApp.stage = 'hired';
        liveApp.stageChangedAt = new Date().toISOString();
        liveApp.history.push({ stage: 'hired', at: new Date().toISOString(), byId: employee?.id ?? 'system' });
        const liveReq = draft.requisitions.find((r) => r.id === req.id)!;
        liveReq.filled += 1;
        if (liveReq.filled >= liveReq.openings) liveReq.status = 'filled';
        const liveOffer = draft.offers.find((o) => o.applicationId === applicationId);
        if (liveOffer) liveOffer.status = 'accepted';
      }, {
        action: 'Hired candidate', objectType: 'Employee', objectId: empId,
        objectLabel: `${candidate.firstName} ${candidate.lastName}`, module: 'Recruiting', severity: 'critical',
        changes: [{ field: 'candidate', from: candidate.id, to: empId }],
      });

      const manager = db.employees.find((e) => e.id === overrides.managerId);
      if (manager) {
        createTask({
          assigneeId: manager.userId, kind: 'task',
          title: `Prepare 30/60/90 plan for ${candidate.firstName} ${candidate.lastName}`,
          detail: `Starts ${overrides.startDate} as ${job.name}.`,
          dueDate: addDays(overrides.startDate, 3), priority: 'high', actionPath: '/onboarding', relatedId: empId,
        });
        notify({
          userId: manager.userId, kind: 'recruiting', title: 'Your new hire is confirmed',
          body: `${candidate.firstName} ${candidate.lastName} starts ${overrides.startDate}.`,
          severity: 'success', actionPath: '/onboarding',
        });
      }
      runAutomation('new_hire_created', {
        subjectEmployeeId: empId, values: {},
        tokens: { employee: `${candidate.firstName} ${candidate.lastName}` },
      });
      toast({ kind: 'success', title: 'Employee record created', body: 'Onboarding packet and required training assigned.' });
      return empId;
    },
    [db, employee, update, notify, createTask, runAutomation, toast, today],
  );

  const completeWorkTask = useCallback(
    (taskId: ID, status: 'completed' | 'dismissed' = 'completed') => {
      update((draft) => {
        const t = draft.tasks.find((x) => x.id === taskId);
        if (!t) return;
        t.status = status;
        t.completedAt = new Date().toISOString();
      });
      toast({ kind: 'success', title: status === 'completed' ? 'Task completed' : 'Task dismissed' });
    },
    [update, toast],
  );

  return { updateEmployee, lifecycleAction, hireCandidate, completeWorkTask };
};

/* ------------------------------------------------------- talent actions */

export const useTalentActions = () => {
  const { db, update, employee, notify, createTask, toast, today } = useApp();

  const advanceApplication = useCallback(
    (applicationId: ID, stage: CandidateStage, reason = '') => {
      const app = db.applications.find((a) => a.id === applicationId);
      const cand = db.candidates.find((c) => c.id === app?.candidateId);
      update((draft) => {
        const live = draft.applications.find((a) => a.id === applicationId);
        if (!live) return;
        live.stage = stage;
        live.stageChangedAt = new Date().toISOString();
        live.history.push({ stage, at: new Date().toISOString(), byId: employee?.id ?? 'system' });
        if (stage === 'rejected') live.rejectionReason = reason || 'Not moving forward';
      }, {
        action: `Moved candidate to ${stage.replace(/_/g, ' ')}`, objectType: 'Application',
        objectId: applicationId, objectLabel: cand ? `${cand.firstName} ${cand.lastName}` : applicationId,
        module: 'Recruiting',
      });
      toast({ kind: 'success', title: `Moved to ${stage.replace(/_/g, ' ')}` });
    },
    [db.applications, db.candidates, employee, update, toast],
  );

  const addApplicationNote = useCallback(
    (applicationId: ID, body: string) => {
      update((draft) => {
        const live = draft.applications.find((a) => a.id === applicationId);
        if (!live) return;
        live.notes.unshift({ id: uid('note'), authorId: employee?.id ?? 'system', at: new Date().toISOString(), body });
      });
      toast({ kind: 'success', title: 'Note added' });
    },
    [employee, update, toast],
  );

  const scheduleInterview = useCallback(
    (input: { applicationId: ID; round: string; scheduledAt: string; durationMinutes: number; interviewerIds: ID[]; mode: 'onsite' | 'video' | 'phone' }) => {
      const id = uid('int');
      update((draft) => {
        draft.interviews.push({
          id, applicationId: input.applicationId, round: input.round, scheduledAt: input.scheduledAt,
          durationMinutes: input.durationMinutes, interviewerIds: input.interviewerIds, mode: input.mode,
          status: 'scheduled', feedback: [],
        });
      }, { action: 'Scheduled interview', objectType: 'Interview', objectId: id, objectLabel: input.round, module: 'Recruiting' });
      for (const interviewerId of input.interviewerIds) {
        const emp = db.employees.find((e) => e.id === interviewerId);
        if (!emp) continue;
        notify({ userId: emp.userId, kind: 'recruiting', title: `Interview scheduled — ${input.round}`, body: new Date(input.scheduledAt).toLocaleString(), actionPath: '/recruiting' });
        createTask({ assigneeId: emp.userId, kind: 'recruiting', title: `Interview: ${input.round}`, detail: 'Submit scorecard feedback within 24 hours.', dueDate: addDays(input.scheduledAt.slice(0, 10), 1), priority: 'normal', actionPath: '/recruiting', relatedId: id });
      }
      toast({ kind: 'success', title: 'Interview scheduled', body: `${input.interviewerIds.length} interviewer(s) notified.` });
    },
    [db.employees, update, notify, createTask, toast],
  );

  const submitInterviewFeedback = useCallback(
    (interviewId: ID, feedback: { recommendation: 'strong_yes' | 'yes' | 'neutral' | 'no' | 'strong_no'; rating: number; strengths: string; concerns: string }) => {
      update((draft) => {
        const live = draft.interviews.find((i) => i.id === interviewId);
        if (!live || !employee) return;
        live.feedback = live.feedback.filter((f) => f.interviewerId !== employee.id);
        live.feedback.push({ ...feedback, interviewerId: employee.id, submittedAt: new Date().toISOString() });
        live.status = 'completed';
        for (const t of draft.tasks) {
          if (t.relatedId === interviewId && t.status === 'open') { t.status = 'completed'; t.completedAt = new Date().toISOString(); }
        }
      }, { action: 'Submitted interview feedback', objectType: 'Interview', objectId: interviewId, objectLabel: interviewId, module: 'Recruiting' });
      toast({ kind: 'success', title: 'Feedback submitted' });
    },
    [employee, update, toast],
  );

  const saveOffer = useCallback(
    (offer: Partial<Offer> & { applicationId: ID; candidateId: ID; requisitionId: ID }) => {
      const existing = db.offers.find((o) => o.applicationId === offer.applicationId);
      const id = existing?.id ?? uid('off');
      update((draft) => {
        if (existing) {
          const live = draft.offers.find((o) => o.id === id)!;
          Object.assign(live, offer);
        } else {
          draft.offers.push({
            id, applicationId: offer.applicationId, candidateId: offer.candidateId,
            requisitionId: offer.requisitionId, baseSalary: offer.baseSalary ?? 0,
            payType: offer.payType ?? 'salary', hourlyRate: offer.hourlyRate ?? 0,
            signingBonus: offer.signingBonus ?? 0, equity: offer.equity ?? '—',
            startDate: offer.startDate ?? addDays(today, 21), expiresOn: offer.expiresOn ?? addDays(today, 7),
            status: offer.status ?? 'draft', approverId: offer.approverId ?? null,
            createdBy: employee?.id ?? 'system', createdAt: new Date().toISOString(), note: offer.note ?? '',
          });
        }
      }, { action: existing ? 'Updated offer' : 'Created offer', objectType: 'Offer', objectId: id, objectLabel: id, module: 'Recruiting', severity: 'notice' });
      toast({ kind: 'success', title: existing ? 'Offer updated' : 'Offer created' });
      return id;
    },
    [db.offers, employee, update, toast, today],
  );

  const setOfferStatus = useCallback(
    (offerId: ID, status: Offer['status']) => {
      update((draft) => {
        const live = draft.offers.find((o) => o.id === offerId);
        if (live) live.status = status;
      }, { action: `Offer ${status.replace(/_/g, ' ')}`, objectType: 'Offer', objectId: offerId, objectLabel: offerId, module: 'Recruiting', severity: 'notice' });
      toast({ kind: 'success', title: `Offer ${status.replace(/_/g, ' ')}` });
    },
    [update, toast],
  );

  const completeOnboardingTask = useCallback(
    (taskId: ID, status: 'completed' | 'waived' = 'completed') => {
      const task = db.onboardingTasks.find((t) => t.id === taskId);
      if (!task) return;
      update((draft) => {
        const live = draft.onboardingTasks.find((t) => t.id === taskId)!;
        live.status = status;
        live.completedAt = new Date().toISOString();
        live.completedBy = employee?.userId ?? null;
        const packetTasks = draft.onboardingTasks.filter((t) => t.packetId === live.packetId);
        const done = packetTasks.filter((t) => t.status === 'completed' || t.status === 'waived').length;
        const packet = draft.onboardingPackets.find((p) => p.id === live.packetId);
        if (packet) {
          packet.status = done === packetTasks.length ? 'completed' : 'in_progress';
          packet.completedAt = done === packetTasks.length ? new Date().toISOString() : null;
        }
      }, { action: status === 'waived' ? 'Waived onboarding task' : 'Completed onboarding task', objectType: 'OnboardingTask', objectId: taskId, objectLabel: task.title, module: 'Onboarding' });
      toast({ kind: 'success', title: status === 'waived' ? 'Task waived' : 'Task completed' });
    },
    [db.onboardingTasks, employee, update, toast],
  );

  const updateGoal = useCallback(
    (goalId: ID, value: number, note: string) => {
      update((draft) => {
        const g = draft.goals.find((x) => x.id === goalId);
        if (!g) return;
        g.current = value;
        g.updates.push({ at: new Date().toISOString(), byId: employee?.id ?? 'system', value, note });
        const pct = g.target ? value / g.target : 0;
        g.status = pct >= 1 ? 'completed' : pct > 0.7 ? 'on_track' : pct > 0.45 ? 'at_risk' : pct > 0 ? 'behind' : 'not_started';
      }, { action: 'Updated goal progress', objectType: 'Goal', objectId: goalId, objectLabel: goalId, module: 'Performance' });
      toast({ kind: 'success', title: 'Goal updated' });
    },
    [employee, update, toast],
  );

  const createGoal = useCallback(
    (goal: Omit<Goal, 'id' | 'updates'>) => {
      const id = uid('goal');
      update((draft) => {
        draft.goals.unshift({ ...goal, id, updates: [] });
      }, { action: 'Created goal', objectType: 'Goal', objectId: id, objectLabel: goal.title, module: 'Performance' });
      toast({ kind: 'success', title: 'Goal created' });
      return id;
    },
    [update, toast],
  );

  const advanceReview = useCallback(
    (reviewId: ID, patch: Partial<import('./types').PerformanceReview>) => {
      const review = db.reviews.find((r) => r.id === reviewId);
      update((draft) => {
        const live = draft.reviews.find((r) => r.id === reviewId);
        if (live) Object.assign(live, patch);
      }, {
        action: `Review moved to ${(patch.stage ?? 'updated').replace(/_/g, ' ')}`, objectType: 'PerformanceReview',
        objectId: reviewId, objectLabel: reviewId, module: 'Performance', severity: 'notice',
      });
      if (patch.stage === 'manager_review' && review) {
        const mgr = db.employees.find((e) => e.id === review.managerId);
        if (mgr) notify({ userId: mgr.userId, kind: 'performance', title: 'Self-review submitted', body: 'Your input is needed to move the review forward.', actionPath: '/performance' });
      }
      if (patch.stage === 'final_review' && review) {
        const emp = db.employees.find((e) => e.id === review.employeeId);
        if (emp) notify({ userId: emp.userId, kind: 'performance', title: 'Your review is ready', body: 'Read the final review and acknowledge it.', actionPath: '/performance', severity: 'info' });
      }
      toast({ kind: 'success', title: 'Review updated' });
    },
    [db.reviews, db.employees, update, notify, toast],
  );

  const assignTraining = useCallback(
    (courseId: ID, employeeIds: ID[], dueDate: ISODate) => {
      update((draft) => {
        for (const id of employeeIds) {
          if (draft.trainingAssignments.some((a) => a.courseId === courseId && a.employeeId === id && a.status !== 'completed')) continue;
          draft.trainingAssignments.unshift({
            id: uid('trn'), courseId, employeeId: id, assignedBy: employee?.id ?? 'system',
            assignedAt: new Date().toISOString(), dueDate, status: 'assigned', progressPercent: 0,
            completedAt: null, score: null, certificateId: null,
          });
          const emp = draft.employees.find((e) => e.id === id);
          const course = draft.courses.find((c) => c.id === courseId);
          if (emp && course) {
            draft.notifications.unshift({
              id: uid('ntf'), userId: emp.userId, kind: 'training', title: 'New training assigned',
              body: `${course.title} · due ${dueDate}`, createdAt: new Date().toISOString(),
              read: false, actionPath: '/learning', severity: 'info', channels: ['in_app', 'email'],
            });
          }
        }
      }, { action: 'Assigned training', objectType: 'Course', objectId: courseId, objectLabel: `${employeeIds.length} employee(s)`, module: 'Learning' });
      toast({ kind: 'success', title: `Assigned to ${employeeIds.length} employee(s)` });
    },
    [employee, update, toast],
  );

  const progressTraining = useCallback(
    (assignmentId: ID, percent: number) => {
      update((draft) => {
        const a = draft.trainingAssignments.find((x) => x.id === assignmentId);
        if (!a) return;
        a.progressPercent = Math.min(100, Math.max(0, Math.round(percent)));
        const course = draft.courses.find((c) => c.id === a.courseId);
        if (a.progressPercent >= 100) {
          a.status = 'completed';
          a.completedAt = new Date().toISOString();
          a.score = course && course.passingScore > 0 ? Math.max(course.passingScore, 88) : null;
          a.certificateId = a.score ? uid('cert') : null;
          for (const t of draft.tasks) {
            if (t.relatedId === assignmentId && t.status === 'open') { t.status = 'completed'; t.completedAt = new Date().toISOString(); }
          }
        } else if (a.progressPercent > 0) {
          a.status = a.dueDate < toISODate(new Date()) ? 'overdue' : 'in_progress';
        }
      }, { action: 'Updated training progress', objectType: 'TrainingAssignment', objectId: assignmentId, objectLabel: assignmentId, module: 'Learning' });
    },
    [update],
  );

  return {
    advanceApplication, addApplicationNote, scheduleInterview, submitInterviewFeedback,
    saveOffer, setOfferStatus, completeOnboardingTask, updateGoal, createGoal, advanceReview,
    assignTraining, progressTraining,
  };
};

/* -------------------------------------- benefits, expenses, documents */

export const useAdminActions = () => {
  const { db, update, employee, notify, createTask, runAutomation, toast, today } = useApp();

  const saveEnrollments = useCallback(
    (employeeId: ID, elections: { planId: ID; tier: BenefitEnrollment['tier']; contributionAmount?: number }[]) => {
      const emp = db.employees.find((e) => e.id === employeeId);
      const pg = db.payGroups.find((p) => p.id === emp?.payGroupId);
      if (!emp || !pg) return;
      const periods = PERIODS_PER_YEAR[pg.frequency];
      update((draft) => {
        const planYear = Number(today.slice(0, 4));
        draft.benefitEnrollments = draft.benefitEnrollments.filter((e) => e.employeeId !== employeeId);
        for (const el of elections) {
          const plan = draft.benefitPlans.find((p) => p.id === el.planId);
          if (!plan) continue;
          const tier = el.tier;
          const ee = tier === 'waived' ? 0 : plan.employeeCostMonthly[tier];
          const er = tier === 'waived' ? 0 : plan.employerCostMonthly[tier];
          draft.benefitEnrollments.push({
            id: uid('enr'), employeeId, planId: el.planId, planYear, tier,
            status: tier === 'waived' ? 'waived' : 'active',
            effectiveDate: today, endDate: null,
            employeeCostPerPay: round2((ee * 12) / periods),
            employerCostPerPay: round2((er * 12) / periods),
            dependentIds: tier === 'employee' || tier === 'waived'
              ? []
              : draft.dependents.filter((d) => d.employeeId === employeeId && d.isCovered).map((d) => d.id),
            electedAt: new Date().toISOString(),
            contributionAmount: el.contributionAmount ?? 0,
          });
        }
      }, {
        action: 'Saved benefit elections', objectType: 'BenefitEnrollment', objectId: employeeId,
        objectLabel: employeeLabel(emp), module: 'Benefits', severity: 'critical',
        changes: [{ field: 'elections', from: 'prior plan year', to: `${elections.length} elections` }],
      });
      notify({
        userId: emp.userId, kind: 'benefits', title: 'Your benefit elections were saved',
        body: `${elections.filter((e) => e.tier !== 'waived').length} plans elected. Deductions begin on your next check.`,
        severity: 'success', actionPath: '/benefits',
      });
      toast({ kind: 'success', title: 'Elections saved', body: 'Payroll deductions update on the next run.' });
    },
    [db.employees, db.payGroups, update, notify, toast, today],
  );

  const saveExpenseReport = useCallback(
    (input: { reportId?: ID; title: string; purpose: string; lines: Omit<Expense, 'id' | 'reportId' | 'employeeId' | 'status' | 'policyFlags'>[]; submit: boolean }) => {
      if (!employee) return;
      const reportId = input.reportId ?? uid('exr');
      const total = round2(input.lines.reduce((s, l) => s + l.amount, 0));
      update((draft) => {
        draft.expenses = draft.expenses.filter((e) => e.reportId !== reportId);
        for (const line of input.lines) {
          const flags: string[] = [];
          if (line.category === 'meals' && line.amount > 75) flags.push('Exceeds the $75 per-diem meal cap');
          if (line.amount > 25 && !line.receiptFileName) flags.push('Receipt missing');
          draft.expenses.push({
            ...line, id: uid('exp'), reportId, employeeId: employee.id,
            status: input.submit ? 'submitted' : 'draft', policyFlags: flags,
          });
        }
        const existing = draft.expenseReports.find((r) => r.id === reportId);
        const payload: ExpenseReport = {
          id: reportId, employeeId: employee.id, title: input.title, purpose: input.purpose,
          submittedAt: input.submit ? new Date().toISOString() : null,
          status: input.submit ? 'submitted' : 'draft', total,
          managerId: employee.managerId ?? employee.id,
          managerDecisionAt: null, financeDecisionAt: null, decisionNote: '', reimbursedOnCheck: null,
        };
        if (existing) Object.assign(existing, payload);
        else draft.expenseReports.unshift(payload);
      }, {
        action: input.submit ? 'Submitted expense report' : 'Saved expense draft', objectType: 'ExpenseReport',
        objectId: reportId, objectLabel: input.title, module: 'Expenses',
      });

      if (input.submit) {
        const mgr = db.employees.find((e) => e.id === employee.managerId);
        if (mgr) {
          notify({ userId: mgr.userId, kind: 'expense', title: `Expense report — ${employeeLabel(employee)}`, body: `${input.title} · $${total.toFixed(2)}`, actionPath: `/expenses/${reportId}` });
          createTask({ assigneeId: mgr.userId, kind: 'expense', title: `Approve expense report — ${employeeLabel(employee)}`, detail: `${input.title} · $${total.toFixed(2)}`, dueDate: addDays(today, 3), priority: total > 2500 ? 'high' : 'normal', actionPath: `/expenses/${reportId}`, relatedId: reportId });
        }
        if (total > 2500) {
          runAutomation('expense_submitted', {
            subjectEmployeeId: employee.id, values: { total },
            tokens: { employee: employeeLabel(employee), amount: `$${total.toFixed(2)}` },
          });
        }
      }
      toast({ kind: 'success', title: input.submit ? 'Expense report submitted' : 'Draft saved' });
      return reportId;
    },
    [db.employees, employee, update, notify, createTask, runAutomation, toast, today],
  );

  const decideExpenseReport = useCallback(
    (reportId: ID, decision: 'manager_approved' | 'finance_review' | 'approved' | 'rejected' | 'reimbursed', note = '') => {
      const report = db.expenseReports.find((r) => r.id === reportId);
      if (!report) return;
      const emp = db.employees.find((e) => e.id === report.employeeId);
      update((draft) => {
        const live = draft.expenseReports.find((r) => r.id === reportId)!;
        live.status = decision;
        live.decisionNote = note;
        if (decision === 'manager_approved' || decision === 'rejected') live.managerDecisionAt = new Date().toISOString();
        if (decision === 'approved' || decision === 'reimbursed') live.financeDecisionAt = new Date().toISOString();
        for (const e of draft.expenses) if (e.reportId === reportId) e.status = decision === 'rejected' ? 'rejected' : decision;
        for (const t of draft.tasks) {
          if (t.relatedId === reportId && t.status === 'open') { t.status = 'completed'; t.completedAt = new Date().toISOString(); }
        }
        if (decision === 'manager_approved') {
          const financeUsers = draft.users.filter((u) => u.roles.includes('finance')).slice(0, 1);
          for (const f of financeUsers) {
            draft.tasks.unshift({
              id: uid('tsk'), assigneeId: f.id, title: `Finance review — ${live.title}`,
              detail: `${employeeLabel(emp)} · $${live.total.toFixed(2)}`, kind: 'expense',
              dueDate: addDays(today, 3), priority: 'normal', status: 'open',
              actionPath: `/expenses/${reportId}`, createdAt: new Date().toISOString(),
              completedAt: null, relatedId: reportId,
            });
          }
        }
      }, {
        action: `Expense report ${decision.replace(/_/g, ' ')}`, objectType: 'ExpenseReport',
        objectId: reportId, objectLabel: report.title, module: 'Expenses', severity: 'notice',
      });
      if (emp) {
        notify({
          userId: emp.userId, kind: 'expense',
          title: decision === 'rejected' ? 'Expense report returned' : `Expense report ${decision.replace(/_/g, ' ')}`,
          body: note || `${report.title} · $${report.total.toFixed(2)}`,
          severity: decision === 'rejected' ? 'warning' : 'success', actionPath: `/expenses/${reportId}`,
        });
      }
      toast({ kind: 'success', title: `Report ${decision.replace(/_/g, ' ')}` });
    },
    [db.expenseReports, db.employees, update, notify, toast, today],
  );

  const uploadDocument = useCallback(
    (input: { name: string; category: import('./types').DocumentCategory; employeeId: ID | null; visibility: import('./types').EmployeeDocument['visibility']; expiresOn: ISODate | null; requiresSignature: boolean; confidential: boolean; tags: string[] }) => {
      const id = uid('doc');
      update((draft) => {
        draft.documents.unshift({
          id, name: input.name.endsWith('.pdf') ? input.name : `${input.name}.pdf`,
          category: input.category, employeeId: input.employeeId,
          ownerId: employee?.userId ?? 'system', fileType: 'pdf',
          sizeKb: 120 + Math.floor(Math.random() * 800),
          uploadedAt: new Date().toISOString(), uploadedBy: employee?.userId ?? 'system',
          expiresOn: input.expiresOn, version: 1, versions: [],
          requiresSignature: input.requiresSignature, signatureRequestId: null,
          visibility: input.visibility, tags: input.tags, confidential: input.confidential,
        });
      }, { action: 'Uploaded document', objectType: 'Document', objectId: id, objectLabel: input.name, module: 'Documents' });
      toast({ kind: 'success', title: 'Document uploaded' });
      return id;
    },
    [employee, update, toast],
  );

  const requestSignatures = useCallback(
    (documentId: ID, employeeIds: ID[], dueDate: ISODate) => {
      const doc = db.documents.find((d) => d.id === documentId);
      if (!doc) return;
      const id = uid('sig');
      update((draft) => {
        draft.signatureRequests.unshift({
          id, documentId, documentName: doc.name, requestedBy: employee?.userId ?? 'system',
          createdAt: new Date().toISOString(), dueDate, state: 'sent', documentVersion: doc.version,
          signers: employeeIds.map((eid) => ({
            employeeId: eid, order: 1, state: 'sent' as const, viewedAt: null, signedAt: null,
            signatureText: null, ipAddress: null,
          })),
          auditTrail: [
            { at: new Date().toISOString(), actorId: employee?.userId ?? 'system', event: 'Signature request created' },
            { at: new Date().toISOString(), actorId: employee?.userId ?? 'system', event: `Sent to ${employeeIds.length} recipients` },
          ],
        });
        const live = draft.documents.find((d) => d.id === documentId);
        if (live) { live.requiresSignature = true; live.signatureRequestId = id; }
        for (const eid of employeeIds) {
          const emp = draft.employees.find((e) => e.id === eid);
          if (!emp) continue;
          draft.notifications.unshift({
            id: uid('ntf'), userId: emp.userId, kind: 'document', title: 'Document requires your signature',
            body: doc.name, createdAt: new Date().toISOString(), read: false,
            actionPath: `/documents/sign/${id}`, severity: 'info', channels: ['in_app', 'email'],
          });
          draft.tasks.unshift({
            id: uid('tsk'), assigneeId: emp.userId, title: `Sign: ${doc.name}`,
            detail: `Due ${dueDate}.`, kind: 'document', dueDate, priority: 'normal', status: 'open',
            actionPath: `/documents/sign/${id}`, createdAt: new Date().toISOString(),
            completedAt: null, relatedId: id,
          });
        }
      }, { action: 'Requested signatures', objectType: 'SignatureRequest', objectId: id, objectLabel: doc.name, module: 'Documents', severity: 'notice' });
      toast({ kind: 'success', title: `Sent to ${employeeIds.length} recipient(s)` });
      return id;
    },
    [db.documents, employee, update, toast],
  );

  const signDocument = useCallback(
    (requestId: ID, signatureText: string) => {
      if (!employee) return;
      update((draft) => {
        const req = draft.signatureRequests.find((r) => r.id === requestId);
        if (!req) return;
        const signer = req.signers.find((s) => s.employeeId === employee.id);
        if (!signer) return;
        signer.state = 'signed';
        signer.signedAt = new Date().toISOString();
        signer.viewedAt = signer.viewedAt ?? new Date().toISOString();
        signer.signatureText = signatureText;
        signer.ipAddress = '10.14.22.108';
        req.auditTrail.push({ at: new Date().toISOString(), actorId: employee.userId, event: `Signed by ${employeeLabel(employee)}` });
        if (req.signers.every((s) => s.state === 'signed')) {
          req.state = 'completed';
          req.auditTrail.push({ at: new Date().toISOString(), actorId: 'system', event: 'All signatures collected — request completed' });
        }
        for (const t of draft.tasks) {
          if (t.relatedId === requestId && t.assigneeId === employee.userId && t.status === 'open') {
            t.status = 'completed';
            t.completedAt = new Date().toISOString();
          }
        }
      }, {
        action: 'Signed document', objectType: 'SignatureRequest', objectId: requestId,
        objectLabel: employeeLabel(employee), module: 'Documents', severity: 'notice',
      });
      toast({ kind: 'success', title: 'Document signed', body: 'A copy has been filed to your documents.' });
    },
    [employee, update, toast],
  );

  const markSignatureViewed = useCallback(
    (requestId: ID) => {
      if (!employee) return;
      update((draft) => {
        const req = draft.signatureRequests.find((r) => r.id === requestId);
        const signer = req?.signers.find((s) => s.employeeId === employee.id);
        if (!signer || signer.state === 'signed') return;
        if (!signer.viewedAt) {
          signer.viewedAt = new Date().toISOString();
          signer.state = 'viewed';
          req!.auditTrail.push({ at: new Date().toISOString(), actorId: employee.userId, event: `Viewed by ${employeeLabel(employee)}` });
        }
      });
    },
    [employee, update],
  );

  const toggleAutomationRule = useCallback(
    (ruleId: ID, enabled: boolean) => {
      const rule = db.automationRules.find((r) => r.id === ruleId);
      update((draft) => {
        const live = draft.automationRules.find((r) => r.id === ruleId);
        if (live) live.enabled = enabled;
      }, {
        action: enabled ? 'Enabled automation rule' : 'Disabled automation rule', objectType: 'AutomationRule',
        objectId: ruleId, objectLabel: rule?.name ?? ruleId, module: 'Settings', severity: 'notice',
        changes: [{ field: 'enabled', from: String(!enabled), to: String(enabled) }],
      });
      toast({ kind: 'success', title: enabled ? 'Rule enabled' : 'Rule disabled' });
    },
    [db.automationRules, update, toast],
  );

  return {
    saveEnrollments, saveExpenseReport, decideExpenseReport,
    uploadDocument, requestSignatures, signDocument, markSignatureViewed, toggleAutomationRule,
  };
};

export type { Application, Goal, TrainingAssignment };
