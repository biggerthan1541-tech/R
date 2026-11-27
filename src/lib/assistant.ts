/**
 * Meridian Assistant.
 *
 * A deterministic intent matcher over the live database. Every answer is
 * computed from records the asking user is allowed to see — the permission
 * scope is applied before any aggregation, never after.
 */
import type { Database, Employee, ID, ISODate } from './types';
import type { Permission } from './permissions';
import { addDays, diffDays, fmtDate, fmtDateShort, fmtTime, startOfWeek } from './dates';
import { currency, num } from './format';

export interface AssistantContext {
  db: Database;
  today: ISODate;
  viewer: Employee | null;
  can: (...perms: Permission[]) => boolean;
  visible: (module: string) => Set<ID>;
}

export interface AssistantAnswer {
  headline: string;
  detail?: string;
  table?: { columns: string[]; rows: (string | number)[][] };
  stats?: { label: string; value: string }[];
  path?: { label: string; to: string };
  denied?: boolean;
}

const nameOf = (e: Employee | undefined) => (e ? `${e.preferredName} ${e.lastName}` : 'Unknown');

const findEmployee = (ctx: AssistantContext, text: string): Employee | null => {
  const scope = ctx.visible('people');
  const candidates = ctx.db.employees.filter((e) => scope.has(e.id));
  const lower = text.toLowerCase();
  // Longest name match wins so "John Smith" beats "John".
  let best: Employee | null = null;
  let bestLen = 0;
  for (const e of candidates) {
    for (const token of [`${e.firstName} ${e.lastName}`, `${e.preferredName} ${e.lastName}`, e.lastName, e.firstName]) {
      const t = token.toLowerCase();
      if (t.length > 2 && lower.includes(t) && t.length > bestLen) {
        best = e;
        bestLen = t.length;
      }
    }
  }
  return best;
};

const denied = (what: string): AssistantAnswer => ({
  headline: `You do not have permission to see ${what}.`,
  detail: 'Meridian applies your role\'s data scope before answering, so the assistant can never reveal records you could not open yourself.',
  denied: true,
});

/* ------------------------------------------------------------- intents */

type Handler = (ctx: AssistantContext, q: string) => AssistantAnswer | null;

const absentToday: Handler = (ctx, q) => {
  if (!/(absent|out|off|away|on leave|not (in|working))/.test(q) || /tomorrow|next week/.test(q)) return null;
  if (!ctx.can('pto.view.team', 'pto.view.all')) return denied('other employees\' time off');
  const scope = ctx.visible('pto');
  const out = ctx.db.ptoRequests.filter(
    (r) => r.status === 'approved' && r.startDate <= ctx.today && r.endDate >= ctx.today && scope.has(r.employeeId),
  );
  const onLeave = ctx.db.employees.filter((e) => e.status === 'on_leave' && scope.has(e.id));
  return {
    headline: `${out.length + onLeave.length} people are out today.`,
    detail: `${out.length} on approved time off and ${onLeave.length} on a leave of absence.`,
    table: out.length || onLeave.length ? {
      columns: ['Employee', 'Type', 'Returns'],
      rows: [
        ...out.map((r) => {
          const e = ctx.db.employees.find((x) => x.id === r.employeeId);
          return [nameOf(e), r.kind.replace(/_/g, ' '), fmtDate(addDays(r.endDate, 1))];
        }),
        ...onLeave.map((e) => [nameOf(e), 'Leave of absence', '—']),
      ],
    } : undefined,
    path: { label: 'Open the time-off calendar', to: '/time-off?tab=calendar' },
  };
};

const workingTomorrow: Handler = (ctx, q) => {
  if (!/(working|scheduled|on the schedule|shift).*(tomorrow|next)/.test(q) && !/who.*tomorrow/.test(q)) return null;
  if (!ctx.can('schedule.view.team', 'schedule.view.all')) return denied('the team schedule');
  const tomorrow = addDays(ctx.today, 1);
  const scope = ctx.visible('schedule');
  const shifts = ctx.db.shifts.filter(
    (s) => s.date === tomorrow && s.employeeId && scope.has(s.employeeId) && s.status !== 'cancelled',
  );
  return {
    headline: `${shifts.length} people are scheduled tomorrow (${fmtDate(tomorrow)}).`,
    table: shifts.length ? {
      columns: ['Employee', 'Shift', 'Role', 'Location'],
      rows: shifts.slice(0, 25).map((s) => {
        const e = ctx.db.employees.find((x) => x.id === s.employeeId);
        const loc = ctx.db.locations.find((l) => l.id === s.locationId);
        return [nameOf(e), `${fmtTime(s.start)} – ${fmtTime(s.end)}`, s.role, loc?.code ?? ''];
      }),
    } : undefined,
    path: { label: 'Open scheduling', to: '/scheduling' },
  };
};

const overtime: Handler = (ctx, q) => {
  if (!/overtime|\bot\b/.test(q)) return null;
  if (!ctx.can('time.view.team', 'time.view.all')) return denied('team overtime');
  const scope = ctx.visible('time');
  const rows = ctx.db.timecards
    .filter((t) => scope.has(t.employeeId) && t.totalOvertime + t.totalDoubleTime > 0)
    .sort((a, b) => (b.totalOvertime + b.totalDoubleTime) - (a.totalOvertime + a.totalDoubleTime))
    .slice(0, 15);
  const total = ctx.db.timecards.filter((t) => scope.has(t.employeeId)).reduce((s, t) => s + t.totalOvertime + t.totalDoubleTime, 0);
  return {
    headline: `${rows.length} employees have recorded overtime, totalling ${num(total, 1)} hours.`,
    table: {
      columns: ['Employee', 'Pay period', 'Overtime', 'Double time'],
      rows: rows.map((t) => {
        const e = ctx.db.employees.find((x) => x.id === t.employeeId);
        return [nameOf(e), `${fmtDateShort(t.periodStart)} – ${fmtDateShort(t.periodEnd)}`, num(t.totalOvertime, 2), num(t.totalDoubleTime, 2)];
      }),
    },
    path: { label: 'Open time & attendance', to: '/time?tab=team' },
  };
};

const ptoBalance: Handler = (ctx, q) => {
  if (!/(pto|time off|vacation|sick).*(balance|left|remaining|available|have)/.test(q) && !/balance/.test(q)) return null;
  const target = findEmployee(ctx, q) ?? ctx.viewer;
  if (!target) return null;
  if (target.id !== ctx.viewer?.id && !ctx.can('pto.view.team', 'pto.view.all')) {
    return denied(`${nameOf(target)}'s balances`);
  }
  const balances = ctx.db.ptoBalances.filter((b) => b.employeeId === target.id);
  const policy = ctx.db.ptoPolicies.find((p) => p.id === target.ptoPolicyId);
  const unlimited = policy?.accrualMethod === 'unlimited';
  const who = target.id === ctx.viewer?.id ? 'You are' : `${nameOf(target)} is`;
  const has = target.id === ctx.viewer?.id ? 'You have' : `${nameOf(target)} has`;
  const available = balances.reduce((s, b) => s + b.accruedHours + b.carryoverHours - b.usedHours - b.pendingHours, 0);

  return {
    headline: unlimited
      ? `${who} on the ${policy?.name} policy — flexible time off with no fixed balance.`
      : `${has} ${num(available, 1)} hours of time off available.`,
    detail: unlimited
      ? `${num(balances.reduce((s, b) => s + b.usedHours, 0), 1)} hours taken so far this year. Requests still route to a manager for coverage.`
      : undefined,
    stats: unlimited ? undefined : balances.map((b) => ({
      label: b.kind.replace(/_/g, ' '),
      value: `${num(b.accruedHours + b.carryoverHours - b.usedHours - b.pendingHours, 1)}h`,
    })),
    table: {
      columns: unlimited ? ['Type', 'Taken', 'Pending'] : ['Type', 'Accrued', 'Used', 'Pending', 'Available'],
      rows: balances.map((b) => (unlimited
        ? [b.kind.replace(/_/g, ' '), num(b.usedHours, 1), num(b.pendingHours, 1)]
        : [
            b.kind.replace(/_/g, ' '),
            num(b.accruedHours + b.carryoverHours, 1),
            num(b.usedHours, 1),
            num(b.pendingHours, 1),
            num(b.accruedHours + b.carryoverHours - b.usedHours - b.pendingHours, 1),
          ])),
    },
    path: { label: 'Open time off', to: '/time-off' },
  };
};

const onboardingIncomplete: Handler = (ctx, q) => {
  if (!/onboard/.test(q)) return null;
  if (!ctx.can('onboarding.manage', 'onboarding.view.team')) return denied('other employees\' onboarding');
  const rows = ctx.db.onboardingPackets
    .filter((p) => p.status !== 'completed')
    .map((p) => {
      const tasks = ctx.db.onboardingTasks.filter((t) => t.packetId === p.id);
      const done = tasks.filter((t) => t.status === 'completed' || t.status === 'waived').length;
      const overdue = tasks.filter((t) => t.status === 'overdue').length;
      const e = ctx.db.employees.find((x) => x.id === p.employeeId);
      return { e, done, total: tasks.length, overdue, start: p.startDate };
    })
    .sort((a, b) => b.overdue - a.overdue);
  return {
    headline: `${rows.length} new hires have onboarding still in progress.`,
    detail: `${rows.reduce((s, r) => s + r.overdue, 0)} steps are overdue across those packets.`,
    table: {
      columns: ['Employee', 'Start date', 'Completed', 'Overdue'],
      rows: rows.slice(0, 15).map((r) => [nameOf(r.e), fmtDate(r.start), `${r.done}/${r.total}`, r.overdue]),
    },
    path: { label: 'Open onboarding', to: '/onboarding' },
  };
};

const payrollTotal: Handler = (ctx, q) => {
  if (!/(payroll|paid|gross|labor cost|labour cost).*(last|month|total|cost|much)/.test(q) && !/how much.*payroll/.test(q)) return null;
  if (!ctx.can('payroll.view.all', 'payroll.process', 'analytics.view')) return denied('company payroll totals');
  const lastMonth = addDays(`${ctx.today.slice(0, 7)}-01`, -1).slice(0, 7);
  const checks = ctx.db.paychecks.filter((c) => c.checkDate.startsWith(lastMonth));
  const gross = checks.reduce((s, c) => s + c.grossPay, 0);
  const net = checks.reduce((s, c) => s + c.netPay, 0);
  const taxes = checks.reduce((s, c) => s + c.taxes.reduce((t, x) => t + x.amount + x.employerAmount, 0), 0);
  return {
    headline: `Payroll for ${lastMonth} was ${currency(gross, { cents: false })} gross across ${checks.length} pay statements.`,
    stats: [
      { label: 'Gross pay', value: currency(gross, { cents: false }) },
      { label: 'Net pay', value: currency(net, { cents: false }) },
      { label: 'Total taxes', value: currency(taxes, { cents: false }) },
      { label: 'Statements', value: num(checks.length) },
    ],
    path: { label: 'Open payroll', to: '/payroll?tab=runs' },
  };
};

const compChanged: Handler = (ctx, q) => {
  if (!/(compensation|salary|pay).*(chang|increas|raise|adjust)/.test(q)) return null;
  if (!ctx.can('people.sensitive.view')) return denied('compensation changes');
  const since = addDays(ctx.today, -30);
  const rows = ctx.db.compensation
    .filter((c) => c.effectiveDate >= since && c.changeReason !== 'New hire')
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return {
    headline: `${rows.length} compensation changes took effect in the last 30 days.`,
    table: rows.length ? {
      columns: ['Employee', 'Effective', 'New amount', 'Change', 'Reason'],
      rows: rows.slice(0, 15).map((c) => {
        const e = ctx.db.employees.find((x) => x.id === c.employeeId);
        return [
          nameOf(e), fmtDate(c.effectiveDate),
          e?.payType === 'hourly' ? `${currency(c.hourlyRate)}/hr` : currency(c.annualSalary, { cents: false }),
          `${c.changePercent > 0 ? '+' : ''}${c.changePercent}%`,
          c.changeReason,
        ];
      }),
    } : undefined,
    path: { label: 'Open HR operations', to: '/hr' },
  };
};

const expiringDocs: Handler = (ctx, q) => {
  if (!/(expir|renew).*(document|certification|cert|license)/.test(q) && !/what.*expir/.test(q)) return null;
  if (!ctx.can('documents.view.all', 'people.view.all')) return denied('company-wide document expirations');
  const soon = addDays(ctx.today, 60);
  const certs = ctx.db.employees.flatMap((e) =>
    e.certifications.filter((c) => c.expires && c.expires <= soon)
      .map((c) => ({ who: nameOf(e), what: c.name, when: c.expires!, kind: 'Certification' })));
  const docs = ctx.db.documents.filter((d) => d.expiresOn && d.expiresOn <= soon)
    .map((d) => {
      const e = d.employeeId ? ctx.db.employees.find((x) => x.id === d.employeeId) : undefined;
      return { who: e ? nameOf(e) : 'Company', what: d.name, when: d.expiresOn!, kind: 'Document' };
    });
  const all = [...certs, ...docs].sort((a, b) => a.when.localeCompare(b.when));
  return {
    headline: `${all.length} items expire within 60 days.`,
    table: {
      columns: ['Type', 'Owner', 'Item', 'Expires'],
      rows: all.slice(0, 20).map((x) => [x.kind, x.who, x.what, fmtDate(x.when)]),
    },
    path: { label: 'Open documents', to: '/documents' },
  };
};

const trainingIncomplete: Handler = (ctx, q) => {
  if (!/(training|course|mandatory|compliance).*(not|incomplete|overdue|outstanding|complet)/.test(q) && !/who.*training/.test(q)) return null;
  if (!ctx.can('learning.assign', 'learning.manage', 'reports.view')) return denied('team training records');
  const scope = ctx.visible('performance');
  const rows = ctx.db.trainingAssignments
    .filter((a) => a.status !== 'completed' && a.status !== 'waived' && scope.has(a.employeeId))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = rows.filter((r) => r.status === 'overdue');
  return {
    headline: `${rows.length} training assignments are outstanding, ${overdue.length} of them overdue.`,
    table: {
      columns: ['Employee', 'Course', 'Due', 'Progress', 'Status'],
      rows: rows.slice(0, 15).map((a) => {
        const e = ctx.db.employees.find((x) => x.id === a.employeeId);
        const c = ctx.db.courses.find((x) => x.id === a.courseId);
        return [nameOf(e), c?.title ?? '', fmtDate(a.dueDate), `${a.progressPercent}%`, a.status];
      }),
    },
    path: { label: 'Open learning', to: '/learning?tab=team' },
  };
};

const headcount: Handler = (ctx, q) => {
  if (!/(how many|headcount|employees|people).*(work|employ|have|total|company)/.test(q) && !/^how many employees/.test(q)) return null;
  if (!ctx.can('people.view.all', 'analytics.view')) return denied('company headcount');
  const active = ctx.db.employees.filter((e) => e.status === 'active');
  const byDept = ctx.db.departments.map((d) => ({
    name: d.name, count: active.filter((e) => e.departmentId === d.id).length,
  })).filter((d) => d.count).sort((a, b) => b.count - a.count);
  return {
    headline: `${active.length} active employees across ${byDept.length} departments and ${ctx.db.locations.filter((l) => l.active).length} locations.`,
    stats: [
      { label: 'Active', value: num(active.length) },
      { label: 'On leave', value: num(ctx.db.employees.filter((e) => e.status === 'on_leave').length) },
      { label: 'Starting soon', value: num(ctx.db.employees.filter((e) => e.status === 'pending_hire').length) },
      { label: 'Open positions', value: num(ctx.db.requisitions.filter((r) => r.status === 'open').reduce((s, r) => s + r.openings - r.filled, 0)) },
    ],
    table: { columns: ['Department', 'Employees'], rows: byDept.map((d) => [d.name, d.count]) },
    path: { label: 'Open analytics', to: '/analytics' },
  };
};

const whoReportsTo: Handler = (ctx, q) => {
  if (!/(reports? to|team of|direct reports|who works for|manages)/.test(q)) return null;
  const target = findEmployee(ctx, q) ?? ctx.viewer;
  if (!target) return null;
  const scope = ctx.visible('people');
  if (!scope.has(target.id)) return denied(`${nameOf(target)}'s team`);
  const reports = ctx.db.employees.filter((e) => e.managerId === target.id && e.status === 'active');
  return {
    headline: `${nameOf(target)} has ${reports.length} direct report${reports.length === 1 ? '' : 's'}.`,
    table: reports.length ? {
      columns: ['Employee', 'Job title', 'Location'],
      rows: reports.map((e) => [
        nameOf(e),
        ctx.db.jobTitles.find((j) => j.id === e.jobTitleId)?.name ?? '',
        ctx.db.locations.find((l) => l.id === e.locationId)?.code ?? '',
      ]),
    } : undefined,
    path: { label: 'Open the org chart', to: '/people' },
  };
};

const nextPayDate: Handler = (ctx, q) => {
  if (!/(next|when).*(pay ?day|pay date|paid|paycheck)/.test(q)) return null;
  if (!ctx.viewer) return null;
  const period = ctx.db.payPeriods
    .filter((p) => p.payGroupId === ctx.viewer!.payGroupId && p.checkDate >= ctx.today)
    .sort((a, b) => a.checkDate.localeCompare(b.checkDate))[0];
  const last = ctx.db.paychecks
    .filter((c) => c.employeeId === ctx.viewer!.id)
    .sort((a, b) => b.checkDate.localeCompare(a.checkDate))[0];
  if (!period) return { headline: 'No future pay date is scheduled yet.' };
  return {
    headline: `Your next pay date is ${fmtDate(period.checkDate)}, in ${diffDays(ctx.today, period.checkDate)} days.`,
    detail: `It covers the ${fmtDate(period.start)} – ${fmtDate(period.end)} pay period.`,
    stats: last ? [
      { label: 'Last net pay', value: currency(last.netPay) },
      { label: 'Last check date', value: fmtDate(last.checkDate) },
      { label: 'YTD gross', value: currency(last.ytdGross, { cents: false }) },
    ] : undefined,
    path: { label: 'Open my pay', to: '/payroll' },
  };
};

const mySchedule: Handler = (ctx, q) => {
  if (!/(my|when am i).*(schedule|shift|working)/.test(q)) return null;
  if (!ctx.viewer) return null;
  const shifts = ctx.db.shifts
    .filter((s) => s.employeeId === ctx.viewer!.id && s.date >= ctx.today && s.date <= addDays(ctx.today, 14))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    headline: shifts.length
      ? `You have ${shifts.length} shifts scheduled over the next two weeks.`
      : 'You have no shifts scheduled in the next two weeks.',
    table: shifts.length ? {
      columns: ['Date', 'Shift', 'Role', 'Status'],
      rows: shifts.map((s) => [fmtDate(s.date), `${fmtTime(s.start)} – ${fmtTime(s.end)}`, s.role, s.status]),
    } : undefined,
    path: { label: 'Open my schedule', to: '/scheduling' },
  };
};

const pendingApprovals: Handler = (ctx, q) => {
  if (!/(approv|waiting|pending|need).*(me|my|action|decision)/.test(q) && !/what needs my attention/.test(q)) return null;
  if (!ctx.viewer) return null;
  const user = ctx.db.users.find((u) => u.employeeId === ctx.viewer!.id);
  const tasks = ctx.db.tasks.filter((t) => t.assigneeId === user?.id && t.status === 'open');
  return {
    headline: tasks.length ? `${tasks.length} items are waiting on you.` : 'Nothing is waiting on you right now.',
    table: tasks.length ? {
      columns: ['Task', 'Type', 'Due', 'Priority'],
      rows: tasks.slice(0, 15).map((t) => [t.title, t.kind, fmtDate(t.dueDate), t.priority]),
    } : undefined,
    path: { label: 'Open dashboard', to: '/' },
  };
};

const turnoverIntent: Handler = (ctx, q) => {
  if (!/(turnover|attrition|quit|resign|left the company)/.test(q)) return null;
  if (!ctx.can('people.view.all', 'analytics.view')) return denied('turnover data');
  const yearAgo = addDays(ctx.today, -365);
  const separations = ctx.db.employees.filter((e) => e.terminationDate && e.terminationDate >= yearAgo);
  const active = ctx.db.employees.filter((e) => e.status === 'active').length;
  const rate = active ? (separations.length / (active + separations.length / 2)) * 100 : 0;
  const voluntary = separations.filter((e) => e.terminationReason?.startsWith('Voluntary')).length;
  return {
    headline: `12-month turnover is ${rate.toFixed(1)}% — ${separations.length} separations.`,
    stats: [
      { label: 'Voluntary', value: num(voluntary) },
      { label: 'Involuntary', value: num(separations.length - voluntary) },
      { label: 'Active headcount', value: num(active) },
    ],
    table: {
      columns: ['Employee', 'Department', 'Date', 'Reason'],
      rows: separations.slice(0, 12).map((e) => [
        nameOf(e),
        ctx.db.departments.find((d) => d.id === e.departmentId)?.name ?? '',
        fmtDate(e.terminationDate!),
        e.terminationReason ?? '',
      ]),
    },
    path: { label: 'Open HR movement', to: '/hr' },
  };
};

const payrollErrors: Handler = (ctx, q) => {
  if (!/(payroll).*(error|issue|problem|block|exception)/.test(q)) return null;
  if (!ctx.can('payroll.process', 'payroll.view.all')) return denied('payroll exceptions');
  const open = ctx.db.payrollIssues.filter((i) => !i.resolved);
  const errors = open.filter((i) => i.level === 'error');
  return {
    headline: errors.length
      ? `${errors.length} blocking errors and ${open.length - errors.length} advisory findings are open.`
      : `No blocking payroll errors. ${open.length} advisory findings are open.`,
    table: open.length ? {
      columns: ['Level', 'Code', 'Finding', 'Employee'],
      rows: open.slice(0, 15).map((i) => {
        const e = i.employeeId ? ctx.db.employees.find((x) => x.id === i.employeeId) : undefined;
        return [i.level, i.code, i.title, e ? nameOf(e) : '—'];
      }),
    } : undefined,
    path: { label: 'Open payroll exceptions', to: '/payroll?tab=exceptions' },
  };
};

const employeeLookup: Handler = (ctx, q) => {
  const target = findEmployee(ctx, q);
  if (!target || !/(who is|tell me about|profile|details|information about|look ?up)/.test(q)) return null;
  const job = ctx.db.jobTitles.find((j) => j.id === target.jobTitleId);
  const dept = ctx.db.departments.find((d) => d.id === target.departmentId);
  const mgr = ctx.db.employees.find((e) => e.id === target.managerId);
  const stats: { label: string; value: string }[] = [
    { label: 'Job title', value: job?.name ?? '' },
    { label: 'Department', value: dept?.name ?? '' },
    { label: 'Manager', value: mgr ? nameOf(mgr) : '—' },
    { label: 'Tenure', value: `${(diffDays(target.hireDate, ctx.today) / 365).toFixed(1)} years` },
  ];
  if (ctx.can('people.sensitive.view')) {
    stats.push({
      label: 'Compensation',
      value: target.payType === 'salary' ? currency(target.baseSalary, { cents: false }) : `${currency(target.hourlyRate)}/hr`,
    });
  }
  return {
    headline: `${target.firstName} ${target.lastName} — ${job?.name}`,
    detail: `${dept?.name} · ${ctx.db.locations.find((l) => l.id === target.locationId)?.name} · joined ${fmtDate(target.hireDate)} · status ${target.status.replace(/_/g, ' ')}`,
    stats,
    path: { label: 'Open employee record', to: `/people/${target.id}` },
  };
};

const hoursThisWeekIntent: Handler = (ctx, q) => {
  if (!/(hours).*(week|worked|so far)/.test(q)) return null;
  if (!ctx.viewer) return null;
  const from = startOfWeek(ctx.today, 0);
  const days = ctx.db.timecards
    .filter((t) => t.employeeId === ctx.viewer!.id)
    .flatMap((t) => t.days)
    .filter((d) => d.date >= from && d.date <= ctx.today);
  const worked = days.reduce((s, d) => s + d.regularHours + d.overtimeHours + d.doubleTimeHours, 0);
  return {
    headline: `You have recorded ${num(worked, 2)} hours this week.`,
    table: days.length ? {
      columns: ['Date', 'Regular', 'Overtime', 'Leave'],
      rows: days.map((d) => [fmtDate(d.date), num(d.regularHours, 2), num(d.overtimeHours, 2), num(d.ptoHours + d.holidayHours, 2)]),
    } : undefined,
    path: { label: 'Open my timecard', to: '/time' },
  };
};

const openPositions: Handler = (ctx, q) => {
  if (!/(open|vacan|hiring|requisition|position|role).*(position|role|req|open|hiring)/.test(q) && !/what.*hiring/.test(q)) return null;
  if (!ctx.can('recruiting.view')) return denied('recruiting data');
  const reqs = ctx.db.requisitions.filter((r) => r.status === 'open');
  return {
    headline: `${reqs.length} open requisitions covering ${reqs.reduce((s, r) => s + r.openings - r.filled, 0)} positions.`,
    table: {
      columns: ['Requisition', 'Department', 'Openings', 'Candidates'],
      rows: reqs.map((r) => [
        `${r.code} — ${r.title}`,
        ctx.db.departments.find((d) => d.id === r.departmentId)?.name ?? '',
        `${r.filled}/${r.openings}`,
        ctx.db.applications.filter((a) => a.requisitionId === r.id).length,
      ]),
    },
    path: { label: 'Open recruiting', to: '/recruiting' },
  };
};

const HANDLERS: Handler[] = [
  pendingApprovals, absentToday, workingTomorrow, mySchedule, hoursThisWeekIntent, nextPayDate,
  ptoBalance, overtime, onboardingIncomplete, payrollErrors, payrollTotal, compChanged,
  expiringDocs, trainingIncomplete, turnoverIntent, openPositions, headcount, whoReportsTo,
  employeeLookup,
];

export const ask = (ctx: AssistantContext, question: string): AssistantAnswer => {
  const q = question.toLowerCase().trim();
  for (const handler of HANDLERS) {
    const result = handler(ctx, q);
    if (result) return result;
  }
  return {
    headline: "I could not match that to a question I know how to answer.",
    detail:
      'Try asking about who is out today, overtime, a PTO balance, incomplete onboarding, payroll totals, ' +
      'compensation changes, expiring documents, outstanding training, headcount, turnover, open positions, ' +
      'or a specific person by name.',
  };
};

export const SUGGESTIONS: { text: string; needs?: Permission }[] = [
  { text: 'What needs my attention today?' },
  { text: 'How many employees are absent today?', needs: 'pto.view.team' },
  { text: 'Who is working tomorrow?', needs: 'schedule.view.team' },
  { text: 'Show me employees with overtime', needs: 'time.view.team' },
  { text: 'What is my PTO balance?' },
  { text: 'Which employees have incomplete onboarding?', needs: 'onboarding.manage' },
  { text: 'How much was payroll last month?', needs: 'payroll.view.all' },
  { text: 'Show employees whose compensation changed this month', needs: 'people.sensitive.view' },
  { text: 'Which documents are expiring?', needs: 'documents.view.all' },
  { text: 'Who has not completed mandatory training?', needs: 'learning.assign' },
  { text: 'How many employees work here?', needs: 'people.view.all' },
  { text: 'What is our turnover rate?', needs: 'analytics.view' },
  { text: 'What positions are open?', needs: 'recruiting.view' },
  { text: 'When is my next pay date?' },
  { text: 'How many hours have I worked this week?' },
  { text: 'Are there any payroll errors?', needs: 'payroll.process' },
];
