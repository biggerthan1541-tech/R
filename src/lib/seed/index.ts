import type { Database, ISODate, PayrollIssue } from '../types';
import { Rng } from '../rng';
import { addDays, toISODate } from '../dates';
import { validatePayrollRun } from '../validation';
import {
  AUTOMATION_RULES, BENEFIT_PLANS, COURSES, DEPARTMENTS, INTEGRATIONS, JOB_TITLES,
  LOCATIONS, ONBOARDING_TEMPLATES, PAY_GROUPS, PERMISSION_GROUPS, PTO_POLICIES, TENANT,
} from './catalog';
import { seedPeople } from './people';
import { buildHolidays, buildPayPeriods, seedSchedule, seedTime, seedTimeOff } from './work';
import { seedBenefits, seedPayroll } from './pay';
import { seedLearning, seedOnboarding, seedPerformance, seedRecruiting } from './talent';
import { seedActivity, seedDocuments, seedExpenses } from './misc';

export const DB_VERSION = 1;

export const buildDatabase = (todayOverride?: ISODate): Database => {
  const today = todayOverride ?? toISODate(new Date());
  const rng = new Rng(0x5b3fd6);
  const year = Number(today.slice(0, 4));

  const people = seedPeople(rng, today);
  const holidays = buildHolidays([year - 1, year, year + 1]);
  const payPeriods = buildPayPeriods(today);
  const timeOff = seedTimeOff(rng, people.employees, today, holidays);
  const time = seedTime(rng, people.employees, payPeriods, today, holidays, timeOff.requests);
  const schedule = seedSchedule(rng, people.employees, today);
  const benefits = seedBenefits(rng, people.employees, people.dependents, today);
  const payroll = seedPayroll(
    rng, people.employees, payPeriods, time.timecards,
    benefits.enrollments, benefits.garnishments, people.taxProfiles, today,
  );
  const recruiting = seedRecruiting(rng, people.employees, today);
  const onboarding = seedOnboarding(rng, people.employees, today);
  const performance = seedPerformance(rng, people.employees, today);
  const training = seedLearning(rng, people.employees, today);
  const documents = seedDocuments(rng, people.employees, today);
  const expenses = seedExpenses(rng, people.employees, today);
  const activity = seedActivity(
    rng, people.employees, today, timeOff.requests, time.timecards,
    onboarding.tasks, training, documents.signatures, expenses.reports,
  );

  /* Validation findings for every run that has not yet been finalized. */
  const payrollIssues: PayrollIssue[] = [];
  for (const run of payroll.runs.filter((r) => r.status === 'validation' || r.status === 'calculated')) {
    const runChecks = payroll.paychecks.filter((c) => c.payrollRunId === run.id);
    const periods = payPeriods
      .filter((p) => p.payGroupId === run.payGroupId && p.end < run.createdAt.slice(0, 10))
      .sort((a, b) => a.start.localeCompare(b.start));
    const priorPeriod = periods.at(-1);
    const priorChecks = priorPeriod
      ? payroll.paychecks.filter((c) => c.payPeriodId === priorPeriod.id)
      : [];
    const compChanged = new Set(
      people.compensation
        .filter((c) => {
          const period = payPeriods.find((p) => p.id === run.payPeriodId);
          return period ? c.effectiveDate >= period.start && c.effectiveDate <= period.end : false;
        })
        .map((c) => c.employeeId),
    );
    payrollIssues.push(...validatePayrollRun({
      run,
      paychecks: runChecks,
      priorPaychecks: priorChecks,
      employees: people.employees,
      timecards: time.timecards,
      taxProfiles: people.taxProfiles,
      directDeposits: people.directDeposits,
      enrollments: benefits.enrollments,
      compensationChangedIds: compChanged,
    }));
  }

  const rules = AUTOMATION_RULES.map((r, i) => ({
    ...r,
    createdAt: `${addDays(today, -180 + i * 6)}T12:00:00.000Z`,
    lastFiredAt: activity.automationLog.find((l) => l.ruleId === r.id)?.at ?? null,
    fireCount: activity.automationLog.filter((l) => l.ruleId === r.id).length + (i * 7 + 11),
  }));

  const integrations = INTEGRATIONS.map((i) => ({
    ...i,
    lastSyncAt: i.status === 'connected'
      ? new Date(Date.now() - (i.health === 'degraded' ? 26 : 2) * 3600000).toISOString()
      : null,
  }));

  return {
    meta: { version: DB_VERSION, seededAt: new Date().toISOString(), today },
    organization: TENANT,
    locations: LOCATIONS,
    departments: DEPARTMENTS,
    jobTitles: JOB_TITLES,
    payGroups: PAY_GROUPS,
    payPeriods,
    users: people.users,
    employees: people.employees,
    employmentEvents: people.employmentEvents,
    compensation: people.compensation,
    dependents: people.dependents,
    directDeposits: people.directDeposits,
    taxProfiles: people.taxProfiles,
    punches: time.punches,
    timecards: time.timecards,
    punchCorrections: time.corrections,
    shifts: schedule.shifts,
    availability: schedule.availability,
    shiftSwaps: schedule.swaps,
    ptoPolicies: PTO_POLICIES,
    ptoBalances: timeOff.balances,
    ptoRequests: timeOff.requests,
    holidays,
    blackouts: timeOff.blackouts,
    payrollRuns: payroll.runs,
    paychecks: payroll.paychecks,
    payrollIssues,
    garnishments: benefits.garnishments,
    benefitPlans: BENEFIT_PLANS,
    benefitEnrollments: benefits.enrollments,
    enrollmentWindows: benefits.windows,
    requisitions: recruiting.requisitions,
    candidates: recruiting.candidates,
    applications: recruiting.applications,
    interviews: recruiting.interviews,
    offers: recruiting.offers,
    onboardingTemplates: ONBOARDING_TEMPLATES,
    onboardingPackets: onboarding.packets,
    onboardingTasks: onboarding.tasks,
    goals: performance.goals,
    reviewCycles: performance.cycles,
    reviews: performance.reviews,
    peerFeedback: performance.feedback,
    courses: COURSES,
    trainingAssignments: training,
    expenses: expenses.expenses,
    expenseReports: expenses.reports,
    documents: documents.documents,
    signatureRequests: documents.signatures,
    notifications: activity.notifications,
    tasks: activity.tasks,
    auditLog: activity.auditLog,
    announcements: activity.announcements,
    automationRules: rules,
    automationLog: activity.automationLog,
    permissionGroups: PERMISSION_GROUPS.map((g) => ({
      ...g,
      memberUserIds: people.users
        .filter((u) => {
          if (g.id === 'pgrp_emp') return true;
          if (g.id === 'pgrp_mgr') return u.roles.includes('manager');
          if (g.id === 'pgrp_hr') return u.roles.includes('hr_admin');
          if (g.id === 'pgrp_pay') return u.roles.includes('payroll_admin');
          return u.roles.includes('sys_admin') || u.roles.includes('finance');
        })
        .map((u) => u.id),
    })),
    integrations,
  };
};

export const DEMO_PERSONAS = (db: Database) => db.users;
