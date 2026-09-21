/**
 * Pre-commit payroll validation.
 *
 * Runs over a calculated payroll run and classifies every finding as
 * ERROR (blocks finalization), WARNING, or REVIEW REQUIRED. A run with no
 * findings reports READY.
 */
import type {
  BenefitEnrollment, DirectDeposit, Employee, ID, Paycheck, PayrollIssue,
  PayrollRun, TaxProfile, Timecard,
} from './types';
import { round2 } from './payroll';

export interface ValidationInput {
  run: PayrollRun;
  paychecks: Paycheck[];
  priorPaychecks: Paycheck[];
  employees: Employee[];
  timecards: Timecard[];
  taxProfiles: TaxProfile[];
  directDeposits: DirectDeposit[];
  enrollments: BenefitEnrollment[];
  compensationChangedIds: Set<ID>;
}

let issueSeq = 0;
const nextId = (runId: string) => `iss_${runId}_${++issueSeq}`;

export const validatePayrollRun = (input: ValidationInput): PayrollIssue[] => {
  const {
    run, paychecks, priorPaychecks, employees, timecards, taxProfiles,
    directDeposits, enrollments, compensationChangedIds,
  } = input;
  const issues: PayrollIssue[] = [];
  const byEmployee = new Map(employees.map((e) => [e.id, e] as const));
  const priorByEmployee = new Map(priorPaychecks.map((p) => [p.employeeId, p] as const));

  const push = (
    level: PayrollIssue['level'], code: string, employeeId: ID | null,
    title: string, detail: string, suggestedAction: string,
  ) => {
    issues.push({
      id: nextId(run.id), payrollRunId: run.id, employeeId, level, code, title, detail,
      suggestedAction, resolved: false, resolvedBy: null, resolvedAt: null, resolutionNote: '',
    });
  };

  for (const check of paychecks) {
    const emp = byEmployee.get(check.employeeId);
    if (!emp) continue;
    const name = `${emp.preferredName} ${emp.lastName}`;
    const tc = timecards.find((t) => t.employeeId === emp.id && t.payPeriodId === run.payPeriodId);

    // --- employment status -------------------------------------------------
    if (emp.status === 'terminated' && (!emp.terminationDate || emp.terminationDate < run.createdAt.slice(0, 10))) {
      push('error', 'INVALID_STATUS', emp.id, `${name} is terminated`,
        `Employee separated on ${emp.terminationDate}. A paycheck of ${check.netPay.toFixed(2)} is still included in this run.`,
        'Remove from the run or reclassify as a final off-cycle payment.');
    }
    if (emp.status === 'pending_hire') {
      push('error', 'INVALID_STATUS', emp.id, `${name} has not started`,
        `Start date is ${emp.hireDate}, which is after this pay period.`,
        'Remove from the run until the employee is active.');
    }

    // --- time --------------------------------------------------------------
    if (emp.payType === 'hourly') {
      if (!tc || check.totalHours === 0) {
        push('error', 'MISSING_TIME', emp.id, `No hours recorded for ${name}`,
          'This hourly employee has no approved time for the pay period, which would produce a zero-dollar check.',
          'Review the timecard and add missing punches before finalizing.');
      } else {
        if (tc.status !== 'approved' && tc.status !== 'locked' && tc.status !== 'paid') {
          push('warning', 'UNAPPROVED_TIME', emp.id, `Timecard not approved for ${name}`,
            `Timecard status is "${tc.status}". Unapproved time is included at its current value.`,
            'Ask the approving manager to review and approve the timecard.');
        }
        const standard = emp.standardHoursPerWeek * (run.payGroupId === 'pg_field' ? 2 : 2.17);
        if (check.totalHours > standard * 1.35) {
          push('review', 'UNUSUAL_HOURS', emp.id, `Unusually high hours for ${name}`,
            `${check.totalHours.toFixed(2)} hours recorded against an expected ${standard.toFixed(0)} hours.`,
            'Confirm the hours are accurate and approved by the manager.');
        } else if (check.totalHours > 0 && check.totalHours < standard * 0.5) {
          push('warning', 'LOW_HOURS', emp.id, `Low hours for ${name}`,
            `${check.totalHours.toFixed(2)} hours recorded against an expected ${standard.toFixed(0)} hours.`,
            'Verify whether unpaid leave or missing punches explain the gap.');
        }
        const ot = tc.totalOvertime + tc.totalDoubleTime;
        if (ot > 12) {
          push('review', 'UNEXPECTED_OT', emp.id, `${ot.toFixed(2)} overtime hours for ${name}`,
            `Overtime is above the 12-hour review threshold for this pay period.`,
            'Confirm the overtime was authorized before it is paid.');
        }
        const missed = tc.days.flatMap((d) => d.exceptions).filter((x) => x.kind === 'missed_punch' && !x.resolved);
        if (missed.length) {
          push('error', 'MISSED_PUNCH', emp.id, `${missed.length} unresolved missed punch(es) for ${name}`,
            'Hours were estimated for at least one day because a punch is missing.',
            'Resolve the punch correction request or edit the timecard.');
        }
      }
    }

    // --- pay setup ---------------------------------------------------------
    const dd = directDeposits.filter((d) => d.employeeId === emp.id && d.active);
    if (check.method === 'direct_deposit' && dd.length === 0) {
      push('error', 'NO_DIRECT_DEPOSIT', emp.id, `No direct deposit account for ${name}`,
        'The check is set to pay by direct deposit but no active account exists.',
        'Add a bank account or switch the payment method to a physical check.');
    }
    if (dd.some((d) => !d.verified)) {
      push('warning', 'UNVERIFIED_ACCOUNT', emp.id, `Unverified bank account for ${name}`,
        'A prenote has not yet cleared for one of the accounts on file.',
        'Pay by check this cycle or confirm the account details.');
    }

    const tax = taxProfiles.find((t) => t.employeeId === emp.id);
    if (!tax || !tax.complete) {
      push('error', 'TAX_INCOMPLETE', emp.id, `Incomplete tax setup for ${name}`,
        'No completed Form W-4 is on file, so withholding defaults to single with zero allowances.',
        'Ask the employee to complete their withholding elections.');
    } else if (tax.exemptFederal) {
      push('review', 'TAX_EXEMPT', emp.id, `${name} is exempt from federal withholding`,
        'No federal income tax will be withheld from this check.',
        'Confirm the exemption is current for the tax year.');
    } else if (tax.stateCode !== emp.state) {
      push('warning', 'TAX_JURISDICTION', emp.id, `Tax state does not match work state for ${name}`,
        `Withholding state is ${tax.stateCode} but the employee record shows ${emp.state}.`,
        'Verify the correct work and residence jurisdictions.');
    }

    // --- deductions --------------------------------------------------------
    const active = enrollments.filter(
      (e) => e.employeeId === emp.id && e.status === 'active' && e.tier !== 'waived' && e.employeeCostPerPay > 0,
    );
    const missingDeduction = active.filter(
      (e) => !check.deductions.some((d) => Math.abs(d.amount - e.employeeCostPerPay) < 0.02 || d.label.includes(e.planId)),
    );
    if (missingDeduction.length > 2) {
      push('error', 'MISSING_DEDUCTION', emp.id, `Benefit deductions missing for ${name}`,
        `${missingDeduction.length} active elections have no matching deduction on this check.`,
        'Recalculate the check after confirming the benefit deduction schedule.');
    }

    // --- amounts -----------------------------------------------------------
    if (check.netPay <= 0) {
      push('error', 'NEGATIVE_NET', emp.id, `Net pay is ${check.netPay.toFixed(2)} for ${name}`,
        'Deductions and taxes meet or exceed gross pay, which cannot be paid.',
        'Reduce or defer a voluntary deduction for this period.');
    } else if (check.netPay < 100 && check.grossPay > 500) {
      push('warning', 'LOW_NET', emp.id, `Very low net pay for ${name}`,
        `Gross ${check.grossPay.toFixed(2)} nets to only ${check.netPay.toFixed(2)}.`,
        'Review garnishments and voluntary deductions.');
    }

    const prior = priorByEmployee.get(emp.id);
    if (prior && prior.netPay > 0) {
      const delta = ((check.netPay - prior.netPay) / prior.netPay) * 100;
      if (Math.abs(delta) >= 25) {
        push('review', 'NET_VARIANCE', emp.id, `Net pay moved ${delta > 0 ? '+' : ''}${delta.toFixed(1)}% for ${name}`,
          `Prior period net was ${prior.netPay.toFixed(2)}; this period is ${check.netPay.toFixed(2)}.`,
          'Confirm the change is explained by hours, a bonus, or a compensation change.');
      }
    }

    if (compensationChangedIds.has(emp.id)) {
      push('review', 'COMP_CHANGE', emp.id, `Compensation changed for ${name}`,
        'A compensation change takes effect inside this pay period. Confirm proration is correct.',
        'Verify the effective date and whether retroactive pay is owed.');
    }

    // --- duplicates --------------------------------------------------------
    const codes = check.earnings.map((e) => e.code);
    const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
    if (dupes.length) {
      push('warning', 'DUPLICATE_EARNING', emp.id, `Duplicate earning lines for ${name}`,
        `Earning code(s) ${[...new Set(dupes)].join(', ')} appear more than once.`,
        'Merge the duplicate lines before finalizing.');
    }

    if (!emp.i9Complete) {
      push('warning', 'I9_INCOMPLETE', emp.id, `Form I-9 incomplete for ${name}`,
        'Employment eligibility verification has not been completed.',
        'Complete Section 2 within three business days of the start date.');
    }
  }

  // --- run-level checks ----------------------------------------------------
  const paidIds = new Set(paychecks.map((p) => p.employeeId));
  const expected = employees.filter(
    (e) => e.payGroupId === run.payGroupId && e.status === 'active' && e.hireDate <= run.createdAt.slice(0, 10),
  );
  const omitted = expected.filter((e) => !paidIds.has(e.id));
  if (omitted.length) {
    push('review', 'OMITTED_EMPLOYEE', null, `${omitted.length} active employee(s) not in this run`,
      `${omitted.slice(0, 4).map((e) => `${e.preferredName} ${e.lastName}`).join(', ')}${omitted.length > 4 ? ` and ${omitted.length - 4} more` : ''} are active in this pay group but have no check.`,
      'Add the missing employees or confirm they are intentionally excluded.');
  }

  const priorTotal = round2(priorPaychecks.reduce((s, p) => s + p.grossPay, 0));
  if (priorTotal > 0) {
    const delta = ((run.totals.grossPay - priorTotal) / priorTotal) * 100;
    if (Math.abs(delta) >= 15) {
      push('review', 'RUN_VARIANCE', null, `Total gross moved ${delta > 0 ? '+' : ''}${delta.toFixed(1)}% versus the prior run`,
        `Prior gross was ${priorTotal.toFixed(2)}; this run totals ${run.totals.grossPay.toFixed(2)}.`,
        'Review headcount changes, bonuses and overtime driving the variance.');
    }
  }

  return issues;
};

export const issueCounts = (issues: PayrollIssue[]) => {
  const open = issues.filter((i) => !i.resolved);
  return {
    error: open.filter((i) => i.level === 'error').length,
    warning: open.filter((i) => i.level === 'warning').length,
    review: open.filter((i) => i.level === 'review').length,
    resolved: issues.length - open.length,
    total: issues.length,
    blocking: open.filter((i) => i.level === 'error').length > 0,
  };
};
