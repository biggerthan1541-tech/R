import type {
  Availability, BlackoutPeriod, Employee, Holiday, ID, ISODate, PayPeriod, PtoBalance,
  PtoKind, PtoRequest, Punch, PunchCorrectionRequest, Shift, ShiftSwapRequest,
  TimeException, Timecard, TimecardDay,
} from '../types';
import { Rng } from '../rng';
import {
  addDays, addMonths, dayOfWeek, diffDays, endOfMonth, isoAt, parseISO,
  startOfWeek, toISODate,
} from '../dates';
import { round2 } from '../payroll';
import { JOB_TITLES, PAY_GROUPS } from './catalog';

const SHIFT_DEPARTMENTS = new Set(['dep_fld', 'dep_whs', 'dep_qa', 'dep_cs']);

const HOLIDAY_DEFS: { name: string; month: number; day?: number; nth?: number; dow?: number; last?: boolean }[] = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: 'Martin Luther King Jr. Day', month: 1, nth: 3, dow: 1 },
  { name: 'Memorial Day', month: 5, last: true, dow: 1 },
  { name: 'Juneteenth', month: 6, day: 19 },
  { name: 'Independence Day', month: 7, day: 4 },
  { name: 'Labor Day', month: 9, nth: 1, dow: 1 },
  { name: 'Thanksgiving Day', month: 11, nth: 4, dow: 4 },
  { name: 'Day after Thanksgiving', month: 11, nth: 4, dow: 5 },
  { name: 'Christmas Eve', month: 12, day: 24 },
  { name: 'Christmas Day', month: 12, day: 25 },
];

const nthDow = (year: number, month: number, nth: number, dow: number): ISODate => {
  const first = new Date(year, month - 1, 1);
  const offset = (dow - first.getDay() + 7) % 7;
  return toISODate(new Date(year, month - 1, 1 + offset + (nth - 1) * 7));
};

const lastDow = (year: number, month: number, dow: number): ISODate => {
  const last = new Date(year, month, 0);
  const offset = (last.getDay() - dow + 7) % 7;
  return toISODate(new Date(year, month, 0 - offset));
};

export const buildHolidays = (years: number[]): Holiday[] => {
  const out: Holiday[] = [];
  for (const y of years) {
    for (const h of HOLIDAY_DEFS) {
      let date: ISODate;
      if (h.day) date = `${y}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`;
      else if (h.last) date = lastDow(y, h.month, h.dow!);
      else date = nthDow(y, h.month, h.nth!, h.dow!);
      out.push({ id: `hol_${y}_${h.name.replace(/\W+/g, '').toLowerCase()}`, name: h.name, date, paid: true, locationIds: [] });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
};

/* ------------------------------------------------------------ pay periods */

export const buildPayPeriods = (today: ISODate): PayPeriod[] => {
  const out: PayPeriod[] = [];
  const start = addMonths(today, -10);
  const end = addMonths(today, 3);

  // Semi-monthly: 1st–15th and 16th–end of month.
  let cursor: ISODate = `${start.slice(0, 7)}-01`;
  let seq = 1;
  while (cursor <= end) {
    const mid = `${cursor.slice(0, 7)}-15`;
    const eom = endOfMonth(cursor);
    for (const [s, e] of [[cursor, mid], [`${cursor.slice(0, 7)}-16`, eom]] as [ISODate, ISODate][]) {
      const checkDate = addDays(e, 5);
      out.push({
        id: `pp_corp_${s}`, payGroupId: 'pg_corp', start: s, end: e, checkDate, sequence: seq++,
        status: e < today ? 'closed' : s <= today ? 'open' : 'future',
      });
    }
    cursor = addDays(eom, 1);
  }

  // Biweekly anchored to a Sunday start.
  let bwStart = startOfWeek(start, 0);
  seq = 1;
  while (bwStart <= end) {
    const bwEnd = addDays(bwStart, 13);
    const checkDate = addDays(bwEnd, 5);
    out.push({
      id: `pp_field_${bwStart}`, payGroupId: 'pg_field', start: bwStart, end: bwEnd, checkDate, sequence: seq++,
      status: bwEnd < today ? 'closed' : bwStart <= today ? 'open' : 'future',
    });
    bwStart = addDays(bwEnd, 1);
  }

  return out.sort((a, b) => a.start.localeCompare(b.start));
};

export const currentPeriodFor = (periods: PayPeriod[], payGroupId: ID, today: ISODate): PayPeriod =>
  periods.find((p) => p.payGroupId === payGroupId && p.start <= today && p.end >= today) ??
  periods.filter((p) => p.payGroupId === payGroupId).at(-1)!;

/* --------------------------------------------------------------- time off */

const PTO_KINDS: PtoKind[] = ['vacation', 'sick', 'personal'];

export const seedTimeOff = (
  rng: Rng, employees: Employee[], today: ISODate, holidays: Holiday[],
): { balances: PtoBalance[]; requests: PtoRequest[]; blackouts: BlackoutPeriod[] } => {
  const balances: PtoBalance[] = [];
  const requests: PtoRequest[] = [];
  const holidaySet = new Set(holidays.map((h) => h.date));

  for (const e of employees) {
    if (e.status === 'terminated') continue;
    const unlimited = e.ptoPolicyId === 'pto_exec';
    const annual = e.ptoPolicyId === 'pto_senior' ? 160 : e.ptoPolicyId === 'pto_hourly' ? 80 : 120;
    const yearFraction = Math.min(1, (diffDays(`${today.slice(0, 4)}-01-01`, today) + 1) / 365);
    const tenureFactor = Math.min(1, Math.max(0.08, diffDays(e.hireDate, today) / 365));

    for (const kind of PTO_KINDS) {
      const share = kind === 'vacation' ? 0.62 : kind === 'sick' ? 0.28 : 0.10;
      const accrued = unlimited ? 0 : round2(annual * share * yearFraction * Math.min(1, tenureFactor + 0.2));
      const used = unlimited ? round2(rng.float(0, 60)) : round2(Math.min(accrued * rng.float(0.15, 0.85), accrued));
      balances.push({
        employeeId: e.id, kind, accruedHours: accrued, usedHours: used, pendingHours: 0,
        carryoverHours: unlimited ? 0 : round2(rng.chance(0.5) ? rng.float(0, 32) : 0), asOf: today,
      });
    }
  }

  const workforce = employees.filter((e) => e.status === 'active' || e.status === 'on_leave');
  const requestCount = 150;
  for (let i = 0; i < requestCount; i++) {
    const e = rng.pick(workforce);
    const future = rng.chance(0.42);
    const offset = future ? rng.int(1, 75) : -rng.int(1, 200);
    let startDate = addDays(today, offset);
    while (dayOfWeek(startDate) === 0 || dayOfWeek(startDate) === 6) startDate = addDays(startDate, 1);
    const span = rng.weighted([[1, 45], [2, 20], [3, 15], [4, 8], [5, 12]]);
    const endDate = addDays(startDate, span - 1);
    const workdays = Array.from({ length: span }, (_, d) => addDays(startDate, d))
      .filter((d) => ![0, 6].includes(dayOfWeek(d)) && !holidaySet.has(d));
    const partial = span === 1 && rng.chance(0.2);
    const hoursPerDay = partial ? rng.pick([2, 4, 6]) : 8;
    const hours = Math.max(hoursPerDay, workdays.length * hoursPerDay);
    const kind: PtoKind = rng.weighted([
      ['vacation', 55], ['sick', 25], ['personal', 12], ['bereavement', 3], ['jury_duty', 2], ['parental', 3],
    ]);

    let status: PtoRequest['status'];
    if (future) status = rng.weighted([['pending', 45], ['approved', 50], ['denied', 5]]);
    else status = rng.weighted([['approved', 88], ['denied', 7], ['cancelled', 5]]);

    const createdAt = new Date(parseISO(addDays(startDate, -rng.int(3, 30))).getTime() + rng.int(8, 18) * 3600000).toISOString();
    const balance = balances.find((b) => b.employeeId === e.id && b.kind === (PTO_KINDS.includes(kind) ? kind : 'personal'));
    const available = balance ? balance.accruedHours + balance.carryoverHours - balance.usedHours : 0;
    const flags: string[] = [];
    if (status === 'pending' && hours > available && e.ptoPolicyId !== 'pto_exec') {
      flags.push(`Exceeds available balance by ${round2(hours - available)}h`);
    }
    if (diffDays(toISODate(new Date(createdAt)), startDate) < 3 && kind === 'vacation') {
      flags.push('Submitted inside the 3-day notice window');
    }

    requests.push({
      id: `pto_${i}`, employeeId: e.id, kind, startDate, endDate, hours, partialDay: partial,
      note: rng.pick([
        'Family trip.', 'Medical appointment.', 'Personal matter.', 'Out of state for a wedding.',
        'Taking a long weekend.', 'Childcare coverage.', 'Home repairs.', '', '', 'Recharging after the Q3 push.',
      ]),
      status, createdAt,
      decidedBy: status === 'pending' ? null : (e.managerId ?? null),
      decidedAt: status === 'pending' ? null : new Date(new Date(createdAt).getTime() + rng.int(2, 72) * 3600000).toISOString(),
      decisionNote: status === 'denied' ? rng.pick(['Coverage conflict — please resubmit for a different week.', 'Blackout period for quarter close.', 'Two team members already out.']) : '',
      flags,
    });
  }

  for (const b of balances) {
    b.pendingHours = round2(
      requests.filter((r) => r.employeeId === b.employeeId && r.kind === b.kind && r.status === 'pending')
        .reduce((s, r) => s + r.hours, 0),
    );
  }

  const year = Number(today.slice(0, 4));
  const blackouts: BlackoutPeriod[] = [
    { id: 'blk_q4', name: 'Year-end close', startDate: `${year}-12-26`, endDate: `${year + 1}-01-05`, departmentIds: ['dep_fin'], reason: 'Fiscal year-end close and audit preparation.' },
    { id: 'blk_peak', name: 'Peak shipping season', startDate: `${year}-11-20`, endDate: `${year}-12-24`, departmentIds: ['dep_whs', 'dep_fld'], reason: 'Peak volume — vacation requests require director approval.' },
    { id: 'blk_inv', name: 'Physical inventory', startDate: `${year}-06-28`, endDate: `${year}-07-02`, departmentIds: ['dep_whs', 'dep_qa'], reason: 'Annual physical inventory count.' },
  ];

  return { balances, requests, blackouts };
};

/* ------------------------------------------------------------- timecards */

const jobCodeFor = (e: Employee): string => {
  const j = JOB_TITLES.find((x) => x.id === e.jobTitleId);
  return j ? j.code.split('-')[0] : 'GEN';
};

const exceptionsFor = (rng: Rng, day: TimecardDay, scheduledStart: string, actualStart: string): TimeException[] => {
  const out: TimeException[] = [];
  if (day.overtimeHours > 0) {
    out.push({ kind: 'overtime', severity: 'info', message: `${round2(day.overtimeHours)}h of overtime recorded`, resolved: true });
  }
  if (day.breakMinutes < 30 && day.regularHours >= 6) {
    out.push({ kind: 'short_break', severity: 'warning', message: `Break was ${day.breakMinutes} minutes; policy requires 30`, resolved: false });
  }
  const late = (Number(actualStart.slice(0, 2)) * 60 + Number(actualStart.slice(3))) -
    (Number(scheduledStart.slice(0, 2)) * 60 + Number(scheduledStart.slice(3)));
  if (late > 7) {
    out.push({ kind: 'late_in', severity: 'warning', message: `Clocked in ${late} minutes after the scheduled start`, resolved: false });
  }
  if (day.regularHours + day.overtimeHours > 12) {
    out.push({ kind: 'long_shift', severity: 'warning', message: 'Shift exceeded 12 hours', resolved: false });
  }
  if (rng.chance(0.02)) {
    out.push({ kind: 'outside_geofence', severity: 'warning', message: 'Punch recorded outside the assigned geofence', resolved: false });
  }
  return out;
};

export interface TimeSeed {
  timecards: Timecard[];
  punches: Punch[];
  corrections: PunchCorrectionRequest[];
}

export const seedTime = (
  rng: Rng, employees: Employee[], periods: PayPeriod[], today: ISODate,
  holidays: Holiday[], ptoRequests: PtoRequest[],
): TimeSeed => {
  const timecards: Timecard[] = [];
  const punches: Punch[] = [];
  const corrections: PunchCorrectionRequest[] = [];
  const holidaySet = new Map(holidays.map((h) => [h.date, h] as const));

  const approvedPto = new Map<string, number>();
  for (const r of ptoRequests) {
    if (r.status !== 'approved') continue;
    const days = diffDays(r.startDate, r.endDate) + 1;
    const per = r.hours / Math.max(1, days);
    for (let d = 0; d < days; d++) {
      const date = addDays(r.startDate, d);
      if ([0, 6].includes(dayOfWeek(date))) continue;
      approvedPto.set(`${r.employeeId}|${date}`, per);
    }
  }

  const periodsByGroup = (pg: ID) => periods.filter((p) => p.payGroupId === pg && p.start <= today);

  for (const emp of employees) {
    if (emp.status === 'terminated' || emp.status === 'pending_hire') continue;
    const hourly = emp.payType === 'hourly';
    const all = periodsByGroup(emp.payGroupId);
    const relevant = hourly ? all.slice(-4) : all.slice(-1);

    for (const period of relevant) {
      const isCurrent = period.end >= today;
      const days: TimecardDay[] = [];
      const shiftStartBase = SHIFT_DEPARTMENTS.has(emp.departmentId)
        ? rng.pick(['06:00', '07:00', '08:00', '14:00'])
        : '09:00';

      for (let d = 0; ; d++) {
        const date = addDays(period.start, d);
        if (date > period.end) break;
        if (date > today) break;
        if (date < emp.hireDate) continue;

        const dow = dayOfWeek(date);
        const weekendWorker = SHIFT_DEPARTMENTS.has(emp.departmentId);
        const isWorkday = weekendWorker ? dow !== 0 && (dow !== 6 || rng.chance(0.35)) : dow >= 1 && dow <= 5;
        const holiday = holidaySet.get(date);
        const pto = approvedPto.get(`${emp.id}|${date}`) ?? 0;

        const day: TimecardDay = {
          date, regularHours: 0, overtimeHours: 0, doubleTimeHours: 0, breakMinutes: 0,
          ptoHours: 0, holidayHours: 0, exceptions: [], jobCode: jobCodeFor(emp),
        };

        if (holiday) {
          day.holidayHours = emp.standardHoursPerWeek / 5;
        } else if (pto > 0) {
          day.ptoHours = round2(Math.min(8, pto));
          if (pto < 8 && isWorkday) day.regularHours = round2(8 - pto);
        } else if (isWorkday && emp.status !== 'on_leave') {
          const target = emp.standardHoursPerWeek / (weekendWorker ? 5 : 5);
          const worked = hourly
            ? round2(Math.max(0, target + rng.weighted([[0, 55], [0.5, 15], [1, 12], [-0.5, 10], [2, 5], [3, 3]])))
            : target;
          day.regularHours = worked;
          day.breakMinutes = hourly ? rng.weighted([[30, 55], [45, 20], [60, 15], [20, 7], [0, 3]]) : 60;
        }

        if (day.regularHours > 0 && hourly) {
          const drift = rng.weighted<number>([[0, 40], [3, 20], [7, 15], [12, 10], [-4, 15]]);
          const startMinutes = Number(shiftStartBase.slice(0, 2)) * 60 + Number(shiftStartBase.slice(3)) + drift;
          const actualStart = `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(((startMinutes % 60) + 60) % 60).padStart(2, '0')}`;
          day.exceptions = exceptionsFor(rng, day, shiftStartBase, actualStart);
        }

        if (hourly && isWorkday && !holiday && pto === 0 && emp.status !== 'on_leave' && rng.chance(0.015)) {
          day.exceptions.push({ kind: 'missed_punch', severity: 'error', message: 'Missing clock-out punch — hours estimated', resolved: false });
        }

        days.push(day);
      }

      // Weekly overtime: anything past 40 worked hours in a Sunday-start week.
      const byWeek = new Map<string, TimecardDay[]>();
      for (const d of days) {
        const wk = startOfWeek(d.date, 0);
        if (!byWeek.has(wk)) byWeek.set(wk, []);
        byWeek.get(wk)!.push(d);
      }
      if (hourly) {
        for (const week of byWeek.values()) {
          let worked = 0;
          for (const d of week) {
            const before = worked;
            worked += d.regularHours;
            if (worked > 40) {
              const ot = Math.min(d.regularHours, worked - 40);
              const dt = before >= 52 ? Math.min(ot, worked - 52) : 0;
              d.overtimeHours = round2(ot - dt);
              d.doubleTimeHours = round2(dt);
              d.regularHours = round2(d.regularHours - ot);
              if (d.overtimeHours > 0 && !d.exceptions.some((x) => x.kind === 'overtime')) {
                d.exceptions.push({ kind: 'overtime', severity: 'info', message: `${d.overtimeHours}h overtime`, resolved: true });
              }
            }
          }
        }
      }

      const sum = (f: (d: TimecardDay) => number) => round2(days.reduce((s, d) => s + f(d), 0));
      const hasError = days.some((d) => d.exceptions.some((x) => x.severity === 'error' && !x.resolved));
      const status: Timecard['status'] = isCurrent
        ? 'open'
        : hasError && rng.chance(0.4) ? 'submitted'
        : period.status === 'closed' ? (rng.chance(0.9) ? 'paid' : 'approved') : 'approved';

      const tc: Timecard = {
        id: `tc_${emp.id}_${period.id}`,
        employeeId: emp.id,
        periodStart: period.start,
        periodEnd: period.end,
        payPeriodId: period.id,
        status,
        days,
        totalRegular: sum((d) => d.regularHours),
        totalOvertime: sum((d) => d.overtimeHours),
        totalDoubleTime: sum((d) => d.doubleTimeHours),
        totalPto: sum((d) => d.ptoHours),
        totalHoliday: sum((d) => d.holidayHours),
        submittedAt: status === 'open' ? null : isoAt(period.end, '17:30'),
        approvedBy: ['approved', 'paid'].includes(status) ? emp.managerId : null,
        approvedAt: ['approved', 'paid'].includes(status) ? isoAt(addDays(period.end, 1), '10:15') : null,
        rejectionNote: null,
      };
      timecards.push(tc);

      // Punch detail for the two most recent periods of hourly staff.
      if (hourly && relevant.indexOf(period) >= relevant.length - 2) {
        for (const d of days) {
          if (d.regularHours + d.overtimeHours <= 0) continue;
          const startH = Number(shiftStartBase.slice(0, 2));
          const inTime = `${String(startH).padStart(2, '0')}:${String(rng.weighted([[0, 45], [2, 20], [5, 15], [9, 12], [14, 8]])).padStart(2, '0')}`;
          const totalWorked = d.regularHours + d.overtimeHours + d.doubleTimeHours;
          const outMinutes = startH * 60 + Number(inTime.slice(3)) + Math.round(totalWorked * 60) + d.breakMinutes;
          const outTime = `${String(Math.floor(outMinutes / 60) % 24).padStart(2, '0')}:${String(outMinutes % 60).padStart(2, '0')}`;
          const breakStartMinutes = startH * 60 + Math.round(totalWorked * 30);
          const bStart = `${String(Math.floor(breakStartMinutes / 60) % 24).padStart(2, '0')}:${String(breakStartMinutes % 60).padStart(2, '0')}`;
          const bEnd = `${String(Math.floor((breakStartMinutes + d.breakMinutes) / 60) % 24).padStart(2, '0')}:${String((breakStartMinutes + d.breakMinutes) % 60).padStart(2, '0')}`;
          const source: Punch['source'] = SHIFT_DEPARTMENTS.has(emp.departmentId)
            ? rng.weighted([['kiosk', 45], ['badge', 30], ['mobile', 20], ['web', 5]])
            : rng.weighted([['web', 60], ['mobile', 35], ['kiosk', 5]]);
          const geo = emp.remote ? null : { lat: round2(39.7 + rng.float(-0.4, 0.4, 4)), lng: round2(-104.9 + rng.float(-0.4, 0.4, 4)) };
          const base = {
            employeeId: emp.id, timecardId: tc.id, source, locationId: emp.locationId, geo,
            withinGeofence: !d.exceptions.some((x) => x.kind === 'outside_geofence'),
            ipAddress: `10.${rng.int(0, 40)}.${rng.int(0, 255)}.${rng.int(2, 254)}`,
            device: source === 'kiosk' ? `Kiosk ${emp.locationId.toUpperCase()}-0${rng.int(1, 4)}`
              : source === 'badge' ? `Badge reader ${rng.int(1, 6)}`
              : source === 'mobile' ? 'Meridian Mobile · iOS' : 'Chrome · Windows',
            jobCode: d.jobCode, note: '', edited: false, editedBy: null as ID | null,
          };
          punches.push({ id: `pn_${emp.id}_${d.date}_in`, type: 'in', at: isoAt(d.date, inTime), ...base });
          if (d.breakMinutes > 0) {
            punches.push({ id: `pn_${emp.id}_${d.date}_bs`, type: 'break_start', at: isoAt(d.date, bStart), ...base });
            punches.push({ id: `pn_${emp.id}_${d.date}_be`, type: 'break_end', at: isoAt(d.date, bEnd), ...base });
          }
          if (!d.exceptions.some((x) => x.kind === 'missed_punch')) {
            punches.push({ id: `pn_${emp.id}_${d.date}_out`, type: 'out', at: isoAt(d.date, outTime), ...base });
          }
        }
      }
    }
  }

  const withMissed = timecards.filter((t) => t.days.some((d) => d.exceptions.some((x) => x.kind === 'missed_punch')));
  for (let i = 0; i < Math.min(10, withMissed.length); i++) {
    const tc = withMissed[i];
    const day = tc.days.find((d) => d.exceptions.some((x) => x.kind === 'missed_punch'))!;
    const status: PunchCorrectionRequest['status'] = i < 4 ? 'pending' : rng.chance(0.8) ? 'approved' : 'denied';
    const decider = employees.find((e) => e.id === tc.employeeId)?.managerId ?? null;
    corrections.push({
      id: `pc_${i}`, employeeId: tc.employeeId, timecardId: tc.id, date: day.date,
      requestedChange: `Add clock-out at ${rng.pick(['16:45', '17:02', '17:30', '18:15'])}`,
      reason: rng.pick([
        'Forgot to clock out at the end of my shift.',
        'Kiosk was offline when I left the dock.',
        'Phone battery died before I could punch out.',
        'Left directly from a customer site.',
      ]),
      status,
      createdAt: isoAt(addDays(day.date, 1), '08:20'),
      decidedBy: status === 'pending' ? null : decider,
      decidedAt: status === 'pending' ? null : isoAt(addDays(day.date, 2), '09:10'),
      decisionNote: status === 'denied' ? 'Please submit with the customer sign-off sheet attached.' : '',
    });
  }

  return { timecards, punches, corrections };
};

/* ------------------------------------------------------------- scheduling */

export interface ScheduleSeed {
  shifts: Shift[];
  availability: Availability[];
  swaps: ShiftSwapRequest[];
}

const SHIFT_TEMPLATES: Record<string, { start: string; end: string; break: number; role: string }[]> = {
  dep_whs: [
    { start: '05:00', end: '13:30', break: 30, role: 'Inbound dock' },
    { start: '06:00', end: '14:30', break: 30, role: 'Put-away' },
    { start: '08:00', end: '16:30', break: 30, role: 'Picking' },
    { start: '13:00', end: '21:30', break: 30, role: 'Outbound' },
    { start: '14:00', end: '22:30', break: 30, role: 'Loading' },
  ],
  dep_fld: [
    { start: '07:00', end: '15:30', break: 30, role: 'Route A' },
    { start: '07:30', end: '16:00', break: 30, role: 'Route B' },
    { start: '09:00', end: '17:30', break: 30, role: 'Install crew' },
    { start: '12:00', end: '20:30', break: 30, role: 'Evening service' },
  ],
  dep_qa: [
    { start: '06:00', end: '14:30', break: 30, role: 'Line inspection' },
    { start: '14:00', end: '22:30', break: 30, role: 'Second shift QA' },
  ],
  dep_cs: [
    { start: '07:00', end: '15:30', break: 45, role: 'Support queue' },
    { start: '09:00', end: '17:30', break: 45, role: 'Support queue' },
    { start: '11:00', end: '19:30', break: 45, role: 'Escalations' },
  ],
};

export const seedSchedule = (rng: Rng, employees: Employee[], today: ISODate): ScheduleSeed => {
  const shifts: Shift[] = [];
  const availability: Availability[] = [];
  const swaps: ShiftSwapRequest[] = [];

  const shiftStaff = employees.filter(
    (e) => SHIFT_DEPARTMENTS.has(e.departmentId) && e.status === 'active' && !e.remote,
  );

  const weekStart = startOfWeek(addDays(today, -14), 0);
  let n = 0;
  for (let w = 0; w < 6; w++) {
    const wkStart = addDays(weekStart, w * 7);
    const isFutureDraft = wkStart > addDays(today, 14);
    for (const emp of shiftStaff) {
      const templates = SHIFT_TEMPLATES[emp.departmentId] ?? SHIFT_TEMPLATES.dep_whs;
      const tpl = templates[(emp.id.charCodeAt(emp.id.length - 1) + w) % templates.length];
      const daysWorked = emp.standardHoursPerWeek >= 40 ? 5 : 4;
      const offset = emp.id.charCodeAt(emp.id.length - 2) % 2;
      for (let d = 0; d < 7; d++) {
        const date = addDays(wkStart, d);
        const dow = dayOfWeek(date);
        const worksToday = daysWorked === 5
          ? (offset === 0 ? dow >= 1 && dow <= 5 : dow >= 2 && dow <= 6)
          : dow >= 1 && dow <= 4;
        if (!worksToday) continue;
        if (date < emp.hireDate) continue;
        const open = rng.chance(0.035);
        shifts.push({
          id: `sh_${++n}`,
          employeeId: open ? null : emp.id,
          departmentId: emp.departmentId,
          locationId: emp.locationId,
          date,
          start: tpl.start,
          end: tpl.end,
          breakMinutes: tpl.break,
          role: tpl.role,
          jobCode: jobCodeFor(emp),
          status: open ? 'open' : isFutureDraft ? 'draft' : date < today ? 'completed' : 'published',
          note: open ? 'Open shift — pick up available' : '',
          publishedAt: isFutureDraft ? null : isoAt(addDays(wkStart, -5), '16:00'),
          createdBy: 'usr_sched',
        });
      }
    }
  }

  for (const emp of shiftStaff) {
    if (!rng.chance(0.4)) continue;
    for (let dow = 0; dow < 7; dow++) {
      const available = dow !== 0 && rng.chance(0.85);
      availability.push({
        id: `av_${emp.id}_${dow}`, employeeId: emp.id, dayOfWeek: dow, available,
        start: available ? rng.pick(['06:00', '07:00', '08:00']) : '00:00',
        end: available ? rng.pick(['15:00', '17:00', '19:00', '22:00']) : '00:00',
        note: available ? '' : rng.pick(['Class', 'Family commitment', 'Second job', 'Not available']),
      });
    }
  }

  const futurePublished = shifts.filter((s) => s.status === 'published' && s.date > today && s.employeeId);
  for (let i = 0; i < 12 && i < futurePublished.length; i++) {
    const shift = futurePublished[i * 3 % futurePublished.length];
    const requester = shift.employeeId!;
    const peers = shiftStaff.filter((e) => e.departmentId === shift.departmentId && e.id !== requester);
    const type: ShiftSwapRequest['type'] = rng.weighted([['swap', 50], ['giveaway', 35], ['pickup', 15]]);
    const status: ShiftSwapRequest['status'] = i < 5
      ? rng.weighted([['pending_manager', 60], ['pending_employee', 40]])
      : rng.weighted([['approved', 70], ['denied', 20], ['cancelled', 10]]);
    swaps.push({
      id: `swap_${i}`, shiftId: shift.id, requesterId: requester,
      targetEmployeeId: type === 'pickup' ? null : peers.length ? rng.pick(peers).id : null,
      type, status,
      createdAt: isoAt(addDays(shift.date, -rng.int(2, 10)), '19:30'),
      reason: rng.pick([
        'Family obligation that day.', 'Medical appointment.', 'Out of town.',
        'Need coverage for childcare.', 'Picking up extra hours.', 'Class schedule conflict.',
      ]),
      decidedBy: status.startsWith('pending') ? null : (employees.find((e) => e.id === requester)?.managerId ?? null),
      decidedAt: status.startsWith('pending') ? null : isoAt(addDays(shift.date, -1), '08:00'),
    });
  }

  return { shifts, availability, swaps };
};

export const payGroupOf = (id: ID) => PAY_GROUPS.find((p) => p.id === id)!;
