import type {
  BenefitEnrollment, Dependent, Employee, EnrollmentWindow, Garnishment, ID, ISODate,
  PayPeriod, Paycheck, PayrollRun, TaxProfile, Timecard,
} from '../types';
import { Rng } from '../rng';
import { addDays, diffDays } from '../dates';
import {
  PERIODS_PER_YEAR, blankTotals, calculatePaycheck, earningsFromTimecard, emptyEarnings, round2,
} from '../payroll';
import { BENEFIT_PLANS, PAY_GROUPS } from './catalog';

const ELIGIBLE = (e: Employee): boolean =>
  (e.employmentType === 'full_time' || e.employmentType === 'part_time') &&
  e.standardHoursPerWeek >= 30 &&
  e.status !== 'pending_hire' &&
  e.status !== 'terminated';

const perPay = (monthly: number, frequency: keyof typeof PERIODS_PER_YEAR): number =>
  round2((monthly * 12) / PERIODS_PER_YEAR[frequency]);

export interface BenefitsSeed {
  enrollments: BenefitEnrollment[];
  windows: EnrollmentWindow[];
  garnishments: Garnishment[];
}

export const seedBenefits = (
  rng: Rng, employees: Employee[], dependents: Dependent[], today: ISODate,
): BenefitsSeed => {
  const enrollments: BenefitEnrollment[] = [];
  const garnishments: Garnishment[] = [];
  const planYear = Number(today.slice(0, 4));
  let n = 0;

  for (const emp of employees) {
    if (!ELIGIBLE(emp)) continue;
    const freq = PAY_GROUPS.find((p) => p.id === emp.payGroupId)!.frequency;
    const deps = dependents.filter((d) => d.employeeId === emp.id && d.isCovered);
    const hasSpouse = deps.some((d) => d.relationship === 'spouse' || d.relationship === 'domestic_partner');
    const hasKids = deps.some((d) => d.relationship === 'child');
    const tier: BenefitEnrollment['tier'] = hasSpouse && hasKids ? 'family'
      : hasSpouse ? 'employee_spouse'
      : hasKids ? 'employee_children'
      : 'employee';
    const effectiveDate = diffDays(emp.hireDate, today) > 365
      ? `${planYear}-01-01`
      : addDays(emp.hireDate, 30);
    const waived = rng.chance(0.08);

    const add = (planId: ID, t: BenefitEnrollment['tier'], contribution = 0) => {
      const plan = BENEFIT_PLANS.find((p) => p.id === planId)!;
      const eeMonthly = t === 'waived' ? 0 : plan.employeeCostMonthly[t];
      const erMonthly = t === 'waived' ? 0 : plan.employerCostMonthly[t];
      enrollments.push({
        id: `enr_${++n}`, employeeId: emp.id, planId, planYear, tier: t,
        status: t === 'waived' ? 'waived' : 'active',
        effectiveDate, endDate: null,
        employeeCostPerPay: perPay(eeMonthly, freq),
        employerCostPerPay: perPay(erMonthly, freq),
        dependentIds: t === 'employee' || t === 'waived' ? [] : deps.map((d) => d.id),
        electedAt: `${effectiveDate}T14:30:00.000Z`,
        contributionAmount: contribution,
      });
    };

    if (waived) {
      add('plan_med_ppo', 'waived');
    } else {
      const medical = rng.weighted<ID>([['plan_med_ppo', 45], ['plan_med_hdhp', 35], ['plan_med_hmo', 20]]);
      add(medical, tier);
      if (medical === 'plan_med_hdhp' && rng.chance(0.75)) {
        add('plan_hsa', tier === 'family' ? 'family' : 'employee', rng.pick([1200, 1800, 2400, 3000]));
      } else if (rng.chance(0.3)) {
        add('plan_fsa', 'employee', rng.pick([600, 1200, 1800, 2400]));
      }
      if (rng.chance(0.9)) add('plan_den', tier);
      if (rng.chance(0.8)) add('plan_vis', tier);
    }
    add('plan_life', 'employee');
    if (rng.chance(0.25)) add('plan_std', 'employee');
    if (rng.chance(0.18)) add('plan_ltd', 'employee');
    if (rng.chance(0.72) && diffDays(emp.hireDate, today) > 90) {
      add('plan_401k', 'employee', rng.weighted([[3, 15], [4, 25], [5, 20], [6, 20], [8, 12], [10, 8]]));
    }
    if (rng.chance(0.06)) add('plan_commuter', 'employee', rng.pick([75, 120, 150]));
  }

  const workforce = employees.filter((e) => e.status === 'active');
  for (let i = 0; i < 6; i++) {
    const e = workforce[(i * 17) % workforce.length];
    const type: Garnishment['type'] = rng.weighted([
      ['child_support', 45], ['creditor', 25], ['tax_levy', 20], ['student_loan', 10],
    ]);
    garnishments.push({
      id: `garn_${i}`, employeeId: e.id, type,
      caseNumber: `${type === 'child_support' ? 'CS' : type === 'tax_levy' ? 'TL' : 'CR'}-${rng.int(100000, 999999)}`,
      agency: type === 'child_support' ? 'State Child Support Services'
        : type === 'tax_levy' ? 'Internal Revenue Service'
        : type === 'student_loan' ? 'Department of Education'
        : 'Meridian Collections LLP',
      amount: type === 'child_support' ? rng.pick([180, 220, 260, 310]) : rng.pick([10, 12, 15]),
      amountType: type === 'child_support' ? 'fixed' : 'percent_disposable',
      maxPercent: type === 'child_support' ? 50 : 25,
      startDate: addDays(today, -rng.int(60, 600)),
      endDate: null,
      active: true,
      priority: type === 'child_support' ? 1 : type === 'tax_levy' ? 2 : 3,
    });
  }

  const windows: EnrollmentWindow[] = [
    {
      id: 'win_oe', name: `${planYear + 1} Open Enrollment`, type: 'open_enrollment',
      startDate: `${planYear}-11-01`, endDate: `${planYear}-11-21`, planYear: planYear + 1,
      active: today >= `${planYear}-11-01` && today <= `${planYear}-11-21`,
    },
    {
      id: 'win_nh', name: 'New Hire Enrollment', type: 'new_hire',
      startDate: `${planYear}-01-01`, endDate: `${planYear}-12-31`, planYear, active: true,
    },
    {
      id: 'win_qe', name: 'Qualifying Life Event', type: 'qualifying_event',
      startDate: `${planYear}-01-01`, endDate: `${planYear}-12-31`, planYear, active: true,
    },
  ];

  return { enrollments, windows, garnishments };
};

/* ----------------------------------------------------------- payroll runs */

export interface PayrollSeed {
  runs: PayrollRun[];
  paychecks: Paycheck[];
}

export const seedPayroll = (
  rng: Rng,
  employees: Employee[],
  periods: PayPeriod[],
  timecards: Timecard[],
  enrollments: BenefitEnrollment[],
  garnishments: Garnishment[],
  taxProfiles: TaxProfile[],
  today: ISODate,
): PayrollSeed => {
  const runs: PayrollRun[] = [];
  const paychecks: Paycheck[] = [];
  const year = today.slice(0, 4);
  const ytd = new Map<ID, { gross: number; net: number; taxes: number }>();
  let checkSeq = 100000;

  for (const pg of PAY_GROUPS) {
    const closed = periods
      .filter((p) => p.payGroupId === pg.id && p.end < today && p.start >= `${year}-01-01`)
      .sort((a, b) => a.start.localeCompare(b.start));
    const detailFrom = Math.max(0, closed.length - 6);

    // The most recently closed period is always mid-process, so the validation
    // workflow is populated no matter which calendar day the demo is opened on.
    closed.forEach((period, idx) => {
      const isInFlight = idx === closed.length - 1;
      const staff = employees.filter(
        (e) => e.payGroupId === pg.id && e.status !== 'pending_hire' &&
          e.hireDate <= period.end &&
          (!e.terminationDate || e.terminationDate >= period.start),
      );
      const runId = `run_${pg.id}_${period.id}`;
      const totals = blankTotals();
      const detailed = idx >= detailFrom;

      for (const emp of staff) {
        const tc = timecards.find((t) => t.employeeId === emp.id && t.payPeriodId === period.id);
        const earnings = emp.payType === 'hourly' ? earningsFromTimecard(tc) : emptyEarnings();
        if (emp.payType === 'salary') {
          earnings.regularHours = round2((emp.standardHoursPerWeek * 52) / PERIODS_PER_YEAR[pg.frequency]);
          if (tc) earnings.ptoHours = tc.totalPto;
        }
        if (emp.payType === 'hourly' && !tc) {
          earnings.regularHours = round2((emp.standardHoursPerWeek * 52) / PERIODS_PER_YEAR[pg.frequency]);
        }
        if (rng.chance(0.06)) earnings.bonus = rng.pick([250, 500, 750, 1000, 1500]);
        if (emp.departmentId === 'dep_sls' && rng.chance(0.55)) earnings.commission = rng.int(800, 6500);

        const empEnrollments = enrollments.filter((e) => e.employeeId === emp.id);
        const k401 = empEnrollments.find((e) => e.planId === 'plan_401k');
        const prior = ytd.get(emp.id) ?? { gross: 0, net: 0, taxes: 0 };

        const result = calculatePaycheck({
          employee: emp,
          frequency: pg.frequency,
          earnings,
          taxProfile: taxProfiles.find((t) => t.employeeId === emp.id),
          enrollments: empEnrollments,
          plans: BENEFIT_PLANS,
          garnishments: garnishments.filter((g) => g.employeeId === emp.id && g.active),
          ytdGrossBefore: prior.gross,
          retirementPercent: k401?.contributionAmount ?? 0,
        });

        const next = {
          gross: round2(prior.gross + result.grossPay),
          net: round2(prior.net + result.netPay),
          taxes: round2(prior.taxes + result.employeeTaxTotal),
        };
        ytd.set(emp.id, next);

        totals.grossPay = round2(totals.grossPay + result.grossPay);
        totals.netPay = round2(totals.netPay + result.netPay);
        totals.employeeTaxes = round2(totals.employeeTaxes + result.employeeTaxTotal);
        totals.employerTaxes = round2(totals.employerTaxes + result.employerTaxTotal);
        totals.preTaxDeductions = round2(totals.preTaxDeductions + result.preTaxTotal);
        totals.postTaxDeductions = round2(totals.postTaxDeductions + result.postTaxTotal);
        totals.employerBenefits = round2(totals.employerBenefits + result.employerBenefitTotal);
        totals.hours = round2(totals.hours + result.totalHours);

        if (detailed) {
          paychecks.push({
            id: `chk_${runId}_${emp.id}`,
            payrollRunId: runId,
            employeeId: emp.id,
            payPeriodId: period.id,
            checkNumber: String(++checkSeq),
            checkDate: period.checkDate,
            method: 'direct_deposit',
            earnings: result.earnings,
            deductions: result.deductions,
            taxes: result.taxes,
            grossPay: result.grossPay,
            netPay: result.netPay,
            totalHours: result.totalHours,
            ytdGross: next.gross,
            ytdNet: next.net,
            ytdTaxes: next.taxes,
            status: isInFlight ? 'draft' : 'issued',
            employeeAcknowledged: !isInFlight && rng.chance(0.55),
          });
        }
      }

      totals.totalCost = round2(totals.grossPay + totals.employerTaxes + totals.employerBenefits);

      runs.push({
        id: runId,
        payGroupId: pg.id,
        payPeriodId: period.id,
        runNumber: `${pg.id === 'pg_corp' ? 'C' : 'F'}${year}-${String(period.sequence).padStart(3, '0')}`,
        type: 'regular',
        status: isInFlight ? 'validation' : 'paid',
        createdAt: `${addDays(period.end, -1)}T15:00:00.000Z`,
        createdBy: 'usr_payroll',
        calculatedAt: `${period.end}T18:30:00.000Z`,
        approvedBy: isInFlight ? null : 'usr_payroll',
        approvedAt: isInFlight ? null : `${addDays(period.end, 1)}T16:00:00.000Z`,
        finalizedAt: isInFlight ? null : `${addDays(period.end, 2)}T14:00:00.000Z`,
        totals,
        employeeCount: staff.length,
        note: isInFlight ? 'Calculated and awaiting validation review.' : '',
      });
    });
  }

  return { runs, paychecks };
};
