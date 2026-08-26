/**
 * Payroll calculation engine.
 *
 * A deliberately transparent implementation of the gross-to-net pipeline:
 * earnings → pre-tax deductions → taxable wages → statutory taxes →
 * post-tax deductions → net. Rates live in one place so a tax-year update is
 * a data change, not a code change.
 */
import type {
  BenefitEnrollment, BenefitPlan, DeductionLine, Employee, Garnishment,
  PayGroup, PaycheckLine, TaxLine, TaxProfile, Timecard,
} from './types';

export const PERIODS_PER_YEAR: Record<PayGroup['frequency'], number> = {
  weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12,
};

export const TAX_YEAR = 2025;

export const FICA = {
  socialSecurityRate: 0.062,
  socialSecurityWageBase: 176_100,
  medicareRate: 0.0145,
  additionalMedicareRate: 0.009,
  additionalMedicareThreshold: 200_000,
  futaRate: 0.006,
  futaWageBase: 7_000,
  sutaRate: 0.027,
  sutaWageBase: 9_000,
};

export const STANDARD_DEDUCTION = {
  single: 15_000,
  married_joint: 30_000,
  head_of_household: 22_500,
};

type Bracket = { upTo: number; rate: number };

const FEDERAL_BRACKETS: Record<TaxProfile['filingStatus'], Bracket[]> = {
  single: [
    { upTo: 11_925, rate: 0.10 }, { upTo: 48_475, rate: 0.12 }, { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 }, { upTo: 250_525, rate: 0.32 }, { upTo: 626_350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  married_joint: [
    { upTo: 23_850, rate: 0.10 }, { upTo: 96_950, rate: 0.12 }, { upTo: 206_700, rate: 0.22 },
    { upTo: 394_600, rate: 0.24 }, { upTo: 501_050, rate: 0.32 }, { upTo: 751_600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { upTo: 17_000, rate: 0.10 }, { upTo: 64_850, rate: 0.12 }, { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 }, { upTo: 250_500, rate: 0.32 }, { upTo: 626_350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
};

/** Flat effective state rates — enough for a faithful demo, easy to swap for a provider. */
export const STATE_TAX_RATES: Record<string, number> = {
  CO: 0.044, AZ: 0.025, TX: 0, OH: 0.0275, CA: 0.062, NV: 0, WA: 0,
  FL: 0, NY: 0.0585, IL: 0.0495, GA: 0.0539, NC: 0.0425, UT: 0.0455, OR: 0.0875,
};

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const annualFederalTax = (annualTaxable: number, filing: TaxProfile['filingStatus']): number => {
  const base = Math.max(0, annualTaxable - STANDARD_DEDUCTION[filing]);
  let remaining = base;
  let prev = 0;
  let tax = 0;
  for (const b of FEDERAL_BRACKETS[filing]) {
    const slice = Math.min(remaining, b.upTo - prev);
    if (slice <= 0) break;
    tax += slice * b.rate;
    remaining -= slice;
    prev = b.upTo;
  }
  return tax;
};

export interface EarningsInput {
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  ptoHours: number;
  holidayHours: number;
  bonus: number;
  commission: number;
  reimbursement: number;
  retro: number;
}

export const emptyEarnings = (): EarningsInput => ({
  regularHours: 0, overtimeHours: 0, doubleTimeHours: 0, ptoHours: 0,
  holidayHours: 0, bonus: 0, commission: 0, reimbursement: 0, retro: 0,
});

export const earningsFromTimecard = (tc: Timecard | undefined): EarningsInput => {
  const e = emptyEarnings();
  if (!tc) return e;
  e.regularHours = tc.totalRegular;
  e.overtimeHours = tc.totalOvertime;
  e.doubleTimeHours = tc.totalDoubleTime;
  e.ptoHours = tc.totalPto;
  e.holidayHours = tc.totalHoliday;
  return e;
};

export interface CalcContext {
  employee: Employee;
  frequency: PayGroup['frequency'];
  earnings: EarningsInput;
  taxProfile: TaxProfile | undefined;
  enrollments: BenefitEnrollment[];
  plans: BenefitPlan[];
  garnishments: Garnishment[];
  ytdGrossBefore: number;
  retirementPercent: number;
}

export interface CalcResult {
  earnings: PaycheckLine[];
  deductions: DeductionLine[];
  taxes: TaxLine[];
  grossPay: number;
  netPay: number;
  totalHours: number;
  preTaxTotal: number;
  postTaxTotal: number;
  employeeTaxTotal: number;
  employerTaxTotal: number;
  employerBenefitTotal: number;
}

export const buildEarningLines = (ctx: CalcContext): PaycheckLine[] => {
  const { employee: emp, frequency, earnings: e } = ctx;
  const periods = PERIODS_PER_YEAR[frequency];
  const lines: PaycheckLine[] = [];

  if (emp.payType === 'salary') {
    const perPeriod = round2(emp.baseSalary / periods);
    lines.push({ code: 'salary', label: 'Salary', hours: emp.standardHoursPerWeek * (52 / periods), rate: 0, amount: perPeriod });
    if (e.ptoHours > 0) {
      lines.push({ code: 'pto', label: 'Paid time off (included)', hours: e.ptoHours, rate: 0, amount: 0 });
    }
  } else {
    const rate = emp.hourlyRate;
    if (e.regularHours > 0) lines.push({ code: 'regular', label: 'Regular', hours: e.regularHours, rate, amount: round2(e.regularHours * rate) });
    if (e.overtimeHours > 0) lines.push({ code: 'overtime', label: 'Overtime (1.5×)', hours: e.overtimeHours, rate: round2(rate * 1.5), amount: round2(e.overtimeHours * rate * 1.5) });
    if (e.doubleTimeHours > 0) lines.push({ code: 'double_time', label: 'Double time (2×)', hours: e.doubleTimeHours, rate: round2(rate * 2), amount: round2(e.doubleTimeHours * rate * 2) });
    if (e.ptoHours > 0) lines.push({ code: 'pto', label: 'Paid time off', hours: e.ptoHours, rate, amount: round2(e.ptoHours * rate) });
    if (e.holidayHours > 0) lines.push({ code: 'holiday', label: 'Holiday', hours: e.holidayHours, rate, amount: round2(e.holidayHours * rate) });
  }

  if (e.bonus > 0) lines.push({ code: 'bonus', label: 'Bonus', hours: 0, rate: 0, amount: round2(e.bonus) });
  if (e.commission > 0) lines.push({ code: 'commission', label: 'Commission', hours: 0, rate: 0, amount: round2(e.commission) });
  if (e.retro > 0) lines.push({ code: 'retro', label: 'Retro adjustment', hours: 0, rate: 0, amount: round2(e.retro) });
  return lines;
};

export const buildDeductionLines = (ctx: CalcContext, gross: number): DeductionLine[] => {
  const { enrollments, plans, garnishments, retirementPercent, frequency } = ctx;
  const periods = PERIODS_PER_YEAR[frequency];
  const out: DeductionLine[] = [];

  for (const en of enrollments) {
    if (en.status !== 'active' || en.tier === 'waived') continue;
    const plan = plans.find((p) => p.id === en.planId);
    if (!plan) continue;
    const preTax = plan.type !== 'life' && plan.type !== 'ltd';
    if (plan.type === 'retirement_401k') continue;
    if (plan.type === 'hsa' || plan.type === 'fsa') {
      const amt = round2(en.contributionAmount / periods);
      if (amt > 0) out.push({ code: plan.type.toUpperCase(), label: plan.name, amount: amt, employerAmount: round2(en.employerCostPerPay), preTax: true, category: 'benefit' });
      continue;
    }
    out.push({
      code: plan.type.toUpperCase(),
      label: plan.name,
      amount: round2(en.employeeCostPerPay),
      employerAmount: round2(en.employerCostPerPay),
      preTax,
      category: 'benefit',
    });
  }

  if (retirementPercent > 0) {
    const amt = round2(gross * (retirementPercent / 100));
    const match = round2(gross * (Math.min(retirementPercent, 4) / 100));
    out.push({ code: '401K', label: `401(k) pre-tax (${retirementPercent}%)`, amount: amt, employerAmount: match, preTax: true, category: 'retirement' });
  }

  for (const g of garnishments) {
    if (!g.active) continue;
    const amt = g.amountType === 'fixed' ? g.amount : round2(gross * (g.amount / 100));
    out.push({
      code: g.type.toUpperCase(),
      label: `${g.type.replace(/_/g, ' ')} — ${g.caseNumber}`,
      amount: Math.min(amt, round2(gross * (g.maxPercent / 100))),
      employerAmount: 0,
      preTax: false,
      category: 'garnishment',
    });
  }

  return out;
};

export const calculatePaycheck = (ctx: CalcContext): CalcResult => {
  const periods = PERIODS_PER_YEAR[ctx.frequency];
  const earningLines = buildEarningLines(ctx);
  const gross = round2(earningLines.reduce((s, l) => s + l.amount, 0));

  const deductions = buildDeductionLines(ctx, gross);
  const preTaxTotal = round2(deductions.filter((d) => d.preTax).reduce((s, d) => s + d.amount, 0));
  const postTaxTotal = round2(deductions.filter((d) => !d.preTax).reduce((s, d) => s + d.amount, 0));
  const employerBenefitTotal = round2(deductions.reduce((s, d) => s + d.employerAmount, 0));

  const filing = ctx.taxProfile?.filingStatus ?? 'single';
  const federalTaxable = Math.max(0, round2(gross - preTaxTotal));
  const annualized = federalTaxable * periods;

  const exempt = ctx.taxProfile?.exemptFederal ?? false;
  const allowanceReduction = (ctx.taxProfile?.federalAllowances ?? 0) * 2000;
  const fedAnnual = exempt ? 0 : annualFederalTax(Math.max(0, annualized - allowanceReduction), filing);
  const federalIncome = round2(fedAnnual / periods) + (ctx.taxProfile?.additionalFederal ?? 0);

  // Social Security respects the annual wage base using YTD gross carried in.
  const ssRemaining = Math.max(0, FICA.socialSecurityWageBase - ctx.ytdGrossBefore);
  const ssTaxable = Math.min(federalTaxable, ssRemaining);
  const socialSecurity = round2(ssTaxable * FICA.socialSecurityRate);

  const medicare = round2(federalTaxable * FICA.medicareRate);
  const addlMedicare =
    ctx.ytdGrossBefore + federalTaxable > FICA.additionalMedicareThreshold
      ? round2(
          Math.min(federalTaxable, ctx.ytdGrossBefore + federalTaxable - FICA.additionalMedicareThreshold) *
            FICA.additionalMedicareRate,
        )
      : 0;

  const stateCode = ctx.taxProfile?.stateCode ?? ctx.employee.state;
  const stateRate = STATE_TAX_RATES[stateCode] ?? 0.04;
  const stateIncome = round2(federalTaxable * stateRate) + (ctx.taxProfile?.additionalState ?? 0);

  const futaTaxable = Math.max(0, Math.min(federalTaxable, FICA.futaWageBase - ctx.ytdGrossBefore));
  const sutaTaxable = Math.max(0, Math.min(federalTaxable, FICA.sutaWageBase - ctx.ytdGrossBefore));

  const taxes: TaxLine[] = [
    { code: 'FIT', label: 'Federal income tax', taxable: federalTaxable, amount: round2(federalIncome), employerAmount: 0, jurisdiction: 'federal' },
    { code: 'SS', label: 'Social Security', taxable: ssTaxable, amount: socialSecurity, employerAmount: socialSecurity, jurisdiction: 'federal' },
    { code: 'MED', label: 'Medicare', taxable: federalTaxable, amount: round2(medicare + addlMedicare), employerAmount: medicare, jurisdiction: 'federal' },
    { code: 'FUTA', label: 'Federal unemployment', taxable: futaTaxable, amount: 0, employerAmount: round2(futaTaxable * FICA.futaRate), jurisdiction: 'federal' },
  ];
  if (stateRate > 0) {
    taxes.push({ code: `SIT-${stateCode}`, label: `${stateCode} income tax`, taxable: federalTaxable, amount: round2(stateIncome), employerAmount: 0, jurisdiction: 'state' });
  }
  taxes.push({ code: `SUTA-${stateCode}`, label: `${stateCode} unemployment`, taxable: sutaTaxable, amount: 0, employerAmount: round2(sutaTaxable * FICA.sutaRate), jurisdiction: 'state' });

  const employeeTaxTotal = round2(taxes.reduce((s, t) => s + t.amount, 0));
  const employerTaxTotal = round2(taxes.reduce((s, t) => s + t.employerAmount, 0));

  const reimbursement = round2(ctx.earnings.reimbursement);
  if (reimbursement > 0) {
    earningLines.push({ code: 'reimbursement', label: 'Expense reimbursement (non-taxable)', hours: 0, rate: 0, amount: reimbursement });
  }

  const net = round2(gross - preTaxTotal - employeeTaxTotal - postTaxTotal + reimbursement);
  const totalHours = round2(
    ctx.earnings.regularHours + ctx.earnings.overtimeHours + ctx.earnings.doubleTimeHours +
    ctx.earnings.ptoHours + ctx.earnings.holidayHours,
  );

  return {
    earnings: earningLines,
    deductions,
    taxes,
    grossPay: gross,
    netPay: net,
    totalHours,
    preTaxTotal,
    postTaxTotal,
    employeeTaxTotal,
    employerTaxTotal,
    employerBenefitTotal,
  };
};

export const blankTotals = () => ({
  grossPay: 0, netPay: 0, employeeTaxes: 0, employerTaxes: 0, preTaxDeductions: 0,
  postTaxDeductions: 0, reimbursements: 0, employerBenefits: 0, totalCost: 0, hours: 0,
});
