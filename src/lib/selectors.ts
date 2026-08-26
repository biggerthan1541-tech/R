/** Derived reads shared across modules. Pure functions over the database. */
import type {
  Database, Employee, ID, ISODate, Paycheck, PtoKind, Shift, Timecard,
} from './types';
import { addDays, diffDays, endOfWeek, startOfWeek } from './dates';
import { round2 } from './payroll';
import { periodFor } from './actions';

export const currentTimecard = (db: Database, employee: Employee, date: ISODate): Timecard | undefined => {
  const period = periodFor(db, employee.payGroupId, date);
  return period ? db.timecards.find((t) => t.employeeId === employee.id && t.payPeriodId === period.id) : undefined;
};

export const hoursToday = (db: Database, employeeId: ID, date: ISODate): number => {
  const tc = db.timecards.find((t) => t.employeeId === employeeId && t.periodStart <= date && t.periodEnd >= date);
  const day = tc?.days.find((d) => d.date === date);
  return day ? round2(day.regularHours + day.overtimeHours + day.doubleTimeHours) : 0;
};

export const hoursThisWeek = (db: Database, employeeId: ID, date: ISODate): number => {
  const from = startOfWeek(date, 0);
  const to = endOfWeek(date, 0);
  return round2(
    db.timecards
      .filter((t) => t.employeeId === employeeId)
      .flatMap((t) => t.days)
      .filter((d) => d.date >= from && d.date <= to)
      .reduce((s, d) => s + d.regularHours + d.overtimeHours + d.doubleTimeHours, 0),
  );
};

export const upcomingShifts = (db: Database, employeeId: ID, from: ISODate, days = 14): Shift[] =>
  db.shifts
    .filter((s) => s.employeeId === employeeId && s.date >= from && s.date <= addDays(from, days) && s.status !== 'cancelled')
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

export const ptoSummary = (db: Database, employeeId: ID) => {
  const kinds: PtoKind[] = ['vacation', 'sick', 'personal'];
  return kinds.map((kind) => {
    const b = db.ptoBalances.find((x) => x.employeeId === employeeId && x.kind === kind);
    const accrued = b ? round2(b.accruedHours + b.carryoverHours) : 0;
    const used = b?.usedHours ?? 0;
    const pending = b?.pendingHours ?? 0;
    return { kind, accrued, used, pending, available: round2(accrued - used - pending) };
  });
};

export const latestPaycheck = (db: Database, employeeId: ID): Paycheck | undefined =>
  db.paychecks
    .filter((c) => c.employeeId === employeeId && c.status !== 'voided')
    .sort((a, b) => b.checkDate.localeCompare(a.checkDate))[0];

export const paychecksFor = (db: Database, employeeId: ID): Paycheck[] =>
  db.paychecks
    .filter((c) => c.employeeId === employeeId)
    .sort((a, b) => b.checkDate.localeCompare(a.checkDate));

export const openTasksFor = (db: Database, userId: ID) =>
  db.tasks
    .filter((t) => t.assigneeId === userId && t.status === 'open')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

export const pendingSignaturesFor = (db: Database, employeeId: ID) =>
  db.signatureRequests
    .filter((r) => r.signers.some((s) => s.employeeId === employeeId && s.state !== 'signed'))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

export const trainingFor = (db: Database, employeeId: ID) =>
  db.trainingAssignments
    .filter((a) => a.employeeId === employeeId)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

export const goalsFor = (db: Database, employeeId: ID) =>
  db.goals.filter((g) => g.employeeId === employeeId && g.status !== 'cancelled');

export const whoIsOut = (db: Database, date: ISODate, employeeIds?: Set<ID>) =>
  db.ptoRequests.filter(
    (r) => r.status === 'approved' && r.startDate <= date && r.endDate >= date &&
      (!employeeIds || employeeIds.has(r.employeeId)),
  );

export const headcountStats = (db: Database, today: ISODate) => {
  const active = db.employees.filter((e) => e.status === 'active');
  const onLeave = db.employees.filter((e) => e.status === 'on_leave');
  const pending = db.employees.filter((e) => e.status === 'pending_hire');
  const yearAgo = addDays(today, -365);
  const hiresYtd = db.employees.filter((e) => e.hireDate >= `${today.slice(0, 4)}-01-01` && e.hireDate <= today);
  const separations = db.employees.filter((e) => e.terminationDate && e.terminationDate >= yearAgo);
  const avgHeadcount = active.length + separations.length / 2;
  const turnover = avgHeadcount ? (separations.length / avgHeadcount) * 100 : 0;
  const voluntary = separations.filter((e) => e.terminationReason?.startsWith('Voluntary')).length;
  return {
    active: active.length,
    onLeave: onLeave.length,
    pending: pending.length,
    total: active.length + onLeave.length,
    hiresYtd: hiresYtd.length,
    separations: separations.length,
    voluntary,
    involuntary: separations.length - voluntary,
    turnover: round2(turnover),
    newHires90: db.employees.filter((e) => e.status !== 'terminated' && diffDays(e.hireDate, today) <= 90 && e.hireDate <= today).length,
  };
};

export const departmentHeadcount = (db: Database) =>
  db.departments
    .map((d) => ({
      id: d.id,
      label: d.name,
      value: db.employees.filter((e) => e.departmentId === d.id && e.status === 'active').length,
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

export const locationHeadcount = (db: Database) =>
  db.locations
    .map((l) => ({
      id: l.id,
      label: l.name,
      value: db.employees.filter((e) => e.locationId === l.id && e.status === 'active').length,
    }))
    .filter((l) => l.value > 0)
    .sort((a, b) => b.value - a.value);

export const payrollHistory = (db: Database, months = 12) => {
  const byMonth = new Map<string, { gross: number; cost: number; hours: number }>();
  for (const run of db.payrollRuns.filter((r) => r.status === 'paid' || r.status === 'finalized')) {
    const period = db.payPeriods.find((p) => p.id === run.payPeriodId);
    if (!period) continue;
    const key = period.checkDate.slice(0, 7);
    const cur = byMonth.get(key) ?? { gross: 0, cost: 0, hours: 0 };
    cur.gross = round2(cur.gross + run.totals.grossPay);
    cur.cost = round2(cur.cost + run.totals.totalCost);
    cur.hours = round2(cur.hours + run.totals.hours);
    byMonth.set(key, cur);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-months)
    .map(([month, v]) => ({ month, ...v }));
};

export const overtimeByDepartment = (db: Database, sinceDate: ISODate) => {
  const map = new Map<ID, number>();
  for (const tc of db.timecards) {
    if (tc.periodEnd < sinceDate) continue;
    const emp = db.employees.find((e) => e.id === tc.employeeId);
    if (!emp) continue;
    map.set(emp.departmentId, round2((map.get(emp.departmentId) ?? 0) + tc.totalOvertime + tc.totalDoubleTime));
  }
  return db.departments
    .map((d) => ({ id: d.id, label: d.name, value: map.get(d.id) ?? 0 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
};

export const onboardingProgress = (db: Database, packetId: ID) => {
  const tasks = db.onboardingTasks.filter((t) => t.packetId === packetId);
  const done = tasks.filter((t) => t.status === 'completed' || t.status === 'waived').length;
  return {
    total: tasks.length,
    done,
    overdue: tasks.filter((t) => t.status === 'overdue').length,
    percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
  };
};

export const expiringItems = (db: Database, today: ISODate, withinDays = 60) => {
  const certs = db.employees.flatMap((e) =>
    e.certifications
      .filter((c) => c.expires && diffDays(today, c.expires) <= withinDays && diffDays(today, c.expires) >= -30)
      .map((c) => ({ employeeId: e.id, name: c.name, expires: c.expires!, kind: 'certification' as const })),
  );
  const docs = db.documents
    .filter((d) => d.expiresOn && diffDays(today, d.expiresOn) <= withinDays && diffDays(today, d.expiresOn) >= -30)
    .map((d) => ({ employeeId: d.employeeId, name: d.name, expires: d.expiresOn!, kind: 'document' as const }));
  return [...certs, ...docs].sort((a, b) => a.expires.localeCompare(b.expires));
};

export const activeRunFor = (db: Database) =>
  db.payrollRuns.find((r) => !['paid', 'cancelled'].includes(r.status));

export const recruitingFunnel = (db: Database) => {
  const stages: { stage: string; label: string }[] = [
    { stage: 'applied', label: 'Applied' },
    { stage: 'screening', label: 'Screening' },
    { stage: 'interview', label: 'Interview' },
    { stage: 'final_interview', label: 'Final' },
    { stage: 'offer', label: 'Offer' },
    { stage: 'hired', label: 'Hired' },
  ];
  return stages.map((s) => ({
    ...s,
    value: db.applications.filter((a) => a.stage === s.stage).length,
  }));
};
