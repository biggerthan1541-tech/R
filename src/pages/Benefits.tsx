import { useMemo, useState } from 'react';
import {
  ArrowRight, Check, CheckCircle2, HeartPulse, Info, PiggyBank, Plus, Settings2,
  ShieldCheck, Stethoscope, Users,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Column, DataTable, EmptyState, Field,
  Input, KeyValue, Modal, PermissionDenied, Progress, Radio, SectionHeader, Select,
  StatTile, StatusBadge, Tabs, cx,
} from '@/components/ui';
import { BarChart, DonutChart } from '@/components/charts';
import { useApp, useLookups } from '@/lib/store';
import { useAdminActions } from '@/lib/actions';
import { currency, num, percent } from '@/lib/format';
import { fmtDate, diffDays } from '@/lib/dates';
import type { BenefitPlan, CoverageTier, Employee } from '@/lib/types';

const TIER_LABEL: Record<CoverageTier, string> = {
  employee: 'Employee only',
  employee_spouse: 'Employee + spouse',
  employee_children: 'Employee + children',
  family: 'Family',
  waived: 'Waived',
};

export const BenefitsPage = () => {
  const { db, can } = useApp();
  const [tab, setTab] = useState(can('benefits.manage', 'benefits.view.all') ? 'admin' : 'mine');

  if (!can('benefits.view.self', 'benefits.view.all', 'benefits.manage')) {
    return <PermissionDenied what="benefits" />;
  }

  const window = db.enrollmentWindows.find((w) => w.type === 'open_enrollment');
  const tabs = [
    { id: 'mine', label: 'My benefits', icon: HeartPulse },
    { id: 'compare', label: 'Compare plans', icon: Stethoscope },
    ...(can('benefits.view.all', 'benefits.manage') ? [
      { id: 'admin', label: 'Enrollment', icon: Users },
      { id: 'plans', label: 'Plan setup', icon: Settings2 },
    ] : []),
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Benefits"
        subtitle="Elections drive payroll deductions automatically — one change here updates the next pay run."
        actions={window ? (
          <Badge tone={window.active ? 'success' : 'neutral'}>
            {window.name}: {fmtDate(window.startDate)} – {fmtDate(window.endDate)}
          </Badge>
        ) : null}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'mine' ? <MyBenefits onCompare={() => setTab('compare')} /> : null}
      {tab === 'compare' ? <ComparePlans /> : null}
      {tab === 'admin' ? <EnrollmentAdmin /> : null}
      {tab === 'plans' ? <PlanSetup /> : null}
    </div>
  );
};

/* --------------------------------------------------------- my benefits */

const MyBenefits = ({ onCompare }: { onCompare: () => void }) => {
  const { db, employee, today } = useApp();
  const lookups = useLookups();
  const [enrolling, setEnrolling] = useState(false);
  if (!employee) return null;

  const enrollments = db.benefitEnrollments.filter((e) => e.employeeId === employee.id);
  const dependents = db.dependents.filter((d) => d.employeeId === employee.id);
  const perPay = enrollments.reduce((s, e) => s + e.employeeCostPerPay, 0);
  const employerPerPay = enrollments.reduce((s, e) => s + e.employerCostPerPay, 0);
  const window = db.enrollmentWindows.find((w) => w.type === 'open_enrollment');
  const newHireWindow = diffDays(employee.hireDate, today) <= 30;
  const canEnroll = window?.active || newHireWindow;
  const k401 = enrollments.find((e) => e.planId === 'plan_401k');

  return (
    <div className="space-y-5">
      {canEnroll ? (
        <Alert tone="brand" icon={Info}
          title={newHireWindow ? 'Your new-hire enrollment window is open' : 'Open enrollment is live'}
          action={<Button variant="primary" size="sm" onClick={() => setEnrolling(true)}>Make elections</Button>}>
          {newHireWindow
            ? `You have ${30 - diffDays(employee.hireDate, today)} days left to elect coverage. Elections take effect on your 31st day.`
            : `Elections you make now take effect ${window ? fmtDate(`${window.planYear}-01-01`) : 'at the start of the plan year'}.`}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Your cost per pay" value={currency(perPay)} icon={HeartPulse} />
        <StatTile label="Employer contribution" value={currency(employerPerPay)} icon={PiggyBank} tone="teal" />
        <StatTile label="Total benefit value" value={currency((perPay + employerPerPay) * 26, { cents: false })} icon={ShieldCheck} tone="accent" hint="Annualized" />
        <StatTile label="Retirement contribution" value={k401 ? `${k401.contributionAmount}%` : 'Not enrolled'} icon={PiggyBank} tone="brand" hint="Match up to 4%" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Your elections" icon={HeartPulse}
              subtitle={`Plan year ${enrollments[0]?.planYear ?? today.slice(0, 4)}`}
              actions={<Button size="sm" onClick={onCompare} iconRight={ArrowRight}>Compare plans</Button>} />
            {enrollments.length === 0 ? (
              <EmptyState icon={HeartPulse} title="No elections on file"
                body="You have not elected coverage yet."
                action={<Button variant="primary" onClick={() => setEnrolling(true)}>Start enrollment</Button>} />
            ) : (
              <ul className="divide-y divide-line">
                {enrollments.map((e) => {
                  const plan = lookups.plan.get(e.planId);
                  if (!plan) return null;
                  return (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{plan.name}</p>
                          <Badge tone="neutral" className="capitalize">{plan.type.replace(/_/g, ' ')}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {plan.carrier} · {TIER_LABEL[e.tier]} · effective {fmtDate(e.effectiveDate)}
                        </p>
                        {e.contributionAmount > 0 ? (
                          <p className="mt-0.5 text-xs text-teal-700">
                            {plan.type === 'retirement_401k' ? `${e.contributionAmount}% of pay` : `${currency(e.contributionAmount, { cents: false })} annual contribution`}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="tnum text-sm font-medium">{currency(e.employeeCostPerPay)}<span className="text-xs font-normal text-faint">/pay</span></p>
                        <p className="text-2xs text-faint">employer {currency(e.employerCostPerPay)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Covered dependents" icon={Users}
              actions={<Button size="xs" icon={Plus} disabled>Add dependent</Button>} />
            {dependents.length === 0 ? (
              <EmptyState compact title="No dependents on file" body="Add a dependent during enrollment or after a qualifying life event." />
            ) : (
              <ul className="divide-y divide-line">
                {dependents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm">{d.firstName} {d.lastName}</p>
                      <p className="text-xs capitalize text-muted">{d.relationship.replace(/_/g, ' ')} · born {fmtDate(d.dob)}</p>
                    </div>
                    {d.isCovered ? <Badge tone="success">Covered</Badge> : <Badge tone="neutral">Not covered</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Cost split" dense />
            <DonutChart
              size={150}
              data={[
                { label: 'You pay', value: perPay },
                { label: 'Cardinal Peak pays', value: employerPerPay },
              ]}
              centerLabel="per pay period"
              centerValue={currency(perPay + employerPerPay)}
              format={(n) => currency(n)}
            />
          </Card>

          <Card>
            <CardHeader title="Qualifying life events" dense icon={Info} />
            <p className="text-xs leading-relaxed text-muted">
              Outside open enrollment you can change elections within 30 days of a qualifying event —
              marriage, birth or adoption, loss of other coverage, or a change in employment status.
            </p>
            <Button className="mt-3" size="sm" block disabled>Report a life event</Button>
          </Card>
        </div>
      </div>

      <EnrollmentWizard open={enrolling} onClose={() => setEnrolling(false)} employee={employee} />
    </div>
  );
};

/* --------------------------------------------------------- enrollment */

const ENROLL_STEPS = ['Medical', 'Dental & vision', 'Savings', 'Review'];

const EnrollmentWizard = ({ open, onClose, employee }: { open: boolean; onClose: () => void; employee: Employee }) => {
  const { db } = useApp();
  const { saveEnrollments } = useAdminActions();
  const existing = db.benefitEnrollments.filter((e) => e.employeeId === employee.id);
  const dependents = db.dependents.filter((d) => d.employeeId === employee.id);

  const [step, setStep] = useState(0);
  const [medical, setMedical] = useState(() => existing.find((e) => ['plan_med_ppo', 'plan_med_hdhp', 'plan_med_hmo'].includes(e.planId))?.planId ?? 'plan_med_ppo');
  const [tier, setTier] = useState<CoverageTier>(() => existing.find((e) => e.planId.startsWith('plan_med'))?.tier ?? 'employee');
  const [dental, setDental] = useState(() => existing.some((e) => e.planId === 'plan_den'));
  const [vision, setVision] = useState(() => existing.some((e) => e.planId === 'plan_vis'));
  const [hsa, setHsa] = useState(() => existing.find((e) => e.planId === 'plan_hsa')?.contributionAmount ?? 0);
  const [fsa, setFsa] = useState(() => existing.find((e) => e.planId === 'plan_fsa')?.contributionAmount ?? 0);
  const [retirement, setRetirement] = useState(() => existing.find((e) => e.planId === 'plan_401k')?.contributionAmount ?? 4);

  const plans = db.benefitPlans;
  const pg = db.payGroups.find((p) => p.id === employee.payGroupId)!;
  const periods = pg.frequency === 'semimonthly' ? 24 : pg.frequency === 'biweekly' ? 26 : pg.frequency === 'weekly' ? 52 : 12;
  const perPay = (planId: string, t: CoverageTier) => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan || t === 'waived') return 0;
    return (plan.employeeCostMonthly[t] * 12) / periods;
  };

  const isHdhp = medical === 'plan_med_hdhp';
  const elections = useMemo(() => {
    const out: { planId: string; tier: CoverageTier; contributionAmount?: number }[] = [];
    out.push({ planId: medical, tier });
    if (dental) out.push({ planId: 'plan_den', tier });
    if (vision) out.push({ planId: 'plan_vis', tier });
    out.push({ planId: 'plan_life', tier: 'employee' });
    if (isHdhp && hsa > 0) out.push({ planId: 'plan_hsa', tier: tier === 'family' ? 'family' : 'employee', contributionAmount: hsa });
    if (!isHdhp && fsa > 0) out.push({ planId: 'plan_fsa', tier: 'employee', contributionAmount: fsa });
    if (retirement > 0) out.push({ planId: 'plan_401k', tier: 'employee', contributionAmount: retirement });
    return out;
  }, [medical, tier, dental, vision, isHdhp, hsa, fsa, retirement]);

  const totalPerPay = elections.reduce((s, e) => {
    if (e.planId === 'plan_401k') return s;
    if (e.planId === 'plan_hsa' || e.planId === 'plan_fsa') return s + (e.contributionAmount ?? 0) / periods;
    return s + perPay(e.planId, e.tier);
  }, 0);
  const retirementPerPay = (employee.baseSalary / periods) * (retirement / 100);

  return (
    <Modal
      open={open} onClose={onClose} size="xl" icon={HeartPulse}
      title="Benefits enrollment"
      subtitle={`Step ${step + 1} of ${ENROLL_STEPS.length} · ${ENROLL_STEPS[step]}`}
      footer={
        <>
          {step > 0 ? <Button onClick={() => setStep(step - 1)}>Back</Button> : <Button onClick={onClose}>Cancel</Button>}
          <div className="flex-1" />
          <div className="mr-3 text-right">
            <p className="text-2xs uppercase tracking-wide text-faint">Per paycheck</p>
            <p className="tnum text-sm font-semibold">{currency(totalPerPay + retirementPerPay)}</p>
          </div>
          {step < ENROLL_STEPS.length - 1 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)}>Continue</Button>
          ) : (
            <Button variant="primary" icon={Check} onClick={() => { saveEnrollments(employee.id, elections); onClose(); setStep(0); }}>
              Confirm elections
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-1">
          {ENROLL_STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={cx('h-1 rounded-full', i <= step ? 'bg-brand-600' : 'bg-line')} />
              <p className={cx('mt-1.5 text-2xs', i === step ? 'font-medium text-brand-700' : 'text-faint')}>{s}</p>
            </div>
          ))}
        </div>

        {step === 0 ? (
          <div className="space-y-4">
            <Field label="Who are you covering?">
              <Select value={tier} onChange={(e) => setTier(e.target.value as CoverageTier)}>
                {(['employee', 'employee_spouse', 'employee_children', 'family'] as CoverageTier[]).map((t) => (
                  <option key={t} value={t}>{TIER_LABEL[t]}</option>
                ))}
              </Select>
            </Field>
            {tier !== 'employee' && dependents.length === 0 ? (
              <Alert tone="warning" title="No dependents on file">
                Add dependents before choosing a family tier, or your coverage will apply to you alone.
              </Alert>
            ) : null}
            <div className="space-y-3">
              {plans.filter((p) => p.type === 'medical').map((p) => (
                <Radio
                  key={p.id}
                  checked={medical === p.id}
                  onChange={() => setMedical(p.id)}
                  label={
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span>{p.name}</span>
                      <span className="tnum text-sm font-semibold text-brand-700">{currency(perPay(p.id, tier))}/pay</span>
                    </span>
                  }
                  description={
                    <span className="block space-y-1">
                      <span className="block">{p.summary}</span>
                      <span className="block text-2xs text-faint">
                        {currency(p.deductibleIndividual, { cents: false })} deductible · {p.coinsurance}% coinsurance ·
                        {p.pcpCopay ? ` ${currency(p.pcpCopay, { cents: false })} PCP copay` : ' no copays'} ·
                        {' '}{currency(p.oopMaxIndividual, { cents: false })} out-of-pocket max
                      </span>
                    </span>
                  }
                />
              ))}
              <Radio checked={medical === 'waive'} onChange={() => setMedical('waive')}
                label="Waive medical coverage"
                description="Choose this only if you have coverage elsewhere. You will be asked to confirm the source." />
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            {plans.filter((p) => p.type === 'dental' || p.type === 'vision').map((p) => {
              const on = p.type === 'dental' ? dental : vision;
              const setOn = p.type === 'dental' ? setDental : setVision;
              return (
                <div key={p.id} className={cx('rounded-lg border p-3.5 transition-colors', on ? 'border-brand-500 bg-brand-50/50' : 'border-line')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{p.summary}</p>
                      <p className="mt-1 text-2xs text-faint">{p.carrier}</p>
                    </div>
                    <div className="text-right">
                      <p className="tnum text-sm font-semibold">{currency(perPay(p.id, tier))}<span className="text-xs font-normal text-faint">/pay</span></p>
                      <Button size="xs" className="mt-1.5" variant={on ? 'primary' : 'secondary'} onClick={() => setOn(!on)}>
                        {on ? 'Elected' : 'Elect'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            <Alert tone="info" title="Company-paid coverage included automatically">
              Basic life and AD&amp;D at 2× salary is provided at no cost. Short- and long-term disability
              are available as voluntary elections through People Operations.
            </Alert>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <Card padded>
              <CardHeader title="401(k) retirement" dense icon={PiggyBank}
                subtitle="Cardinal Peak matches dollar-for-dollar on the first 4% of pay." />
              <Field label={`Contribution: ${retirement}% of eligible pay`}>
                <input type="range" min={0} max={20} step={1} value={retirement}
                  onChange={(e) => setRetirement(Number(e.target.value))}
                  className="w-full accent-[#5B3FD6]" />
              </Field>
              <div className="mt-2 grid grid-cols-3 gap-3 text-center">
                <div className="well p-2.5">
                  <p className="text-2xs text-faint">Your contribution</p>
                  <p className="tnum text-sm font-semibold">{currency(retirementPerPay)}</p>
                </div>
                <div className="well p-2.5">
                  <p className="text-2xs text-faint">Employer match</p>
                  <p className="tnum text-sm font-semibold text-teal-700">
                    {currency((employee.baseSalary / periods) * (Math.min(retirement, 4) / 100))}
                  </p>
                </div>
                <div className="well p-2.5">
                  <p className="text-2xs text-faint">Annual total</p>
                  <p className="tnum text-sm font-semibold">
                    {currency((employee.baseSalary * (retirement + Math.min(retirement, 4)) / 100), { cents: false })}
                  </p>
                </div>
              </div>
              {retirement < 4 ? (
                <Alert className="mt-3" tone="warning" title="You are leaving match on the table">
                  Contributing at least 4% captures the full employer match.
                </Alert>
              ) : null}
            </Card>

            {isHdhp ? (
              <Field label="Health Savings Account (annual contribution)" hint="Employer seeds $750 individual / $1,500 family. 2026 IRS limits apply.">
                <Input type="number" min={0} max={8300} step={100} value={hsa} onChange={(e) => setHsa(Number(e.target.value))} />
              </Field>
            ) : (
              <Field label="Healthcare FSA (annual contribution)" hint="Use-it-or-lose-it, up to $3,300 for the plan year.">
                <Input type="number" min={0} max={3300} step={100} value={fsa} onChange={(e) => setFsa(Number(e.target.value))} />
              </Field>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div className="scroll-x rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="bg-sunken">
                  <tr>
                    <th className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-faint">Plan</th>
                    <th className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-faint">Coverage</th>
                    <th className="px-3 py-2 text-right text-2xs font-semibold uppercase tracking-wider text-faint">Per pay</th>
                  </tr>
                </thead>
                <tbody>
                  {elections.map((e) => {
                    const plan = plans.find((p) => p.id === e.planId);
                    const cost = e.planId === 'plan_401k' ? retirementPerPay
                      : e.planId === 'plan_hsa' || e.planId === 'plan_fsa' ? (e.contributionAmount ?? 0) / periods
                      : perPay(e.planId, e.tier);
                    return (
                      <tr key={e.planId} className="border-t border-line">
                        <td className="px-3 py-2">{plan?.name}</td>
                        <td className="px-3 py-2 text-muted">{TIER_LABEL[e.tier]}</td>
                        <td className="px-3 py-2 text-right tnum">{currency(cost)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-line-strong bg-sunken/60 font-semibold">
                    <td className="px-3 py-2.5" colSpan={2}>Total per paycheck</td>
                    <td className="px-3 py-2.5 text-right tnum">{currency(totalPerPay + retirementPerPay)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Alert tone="success" icon={CheckCircle2} title="What happens when you confirm">
              Your elections are written to your employee record, deductions start on the next payroll run,
              and an enrollment confirmation is filed to your documents. The carrier feed picks up the change
              in the next weekly EDI transmission.
            </Alert>
          </div>
        ) : null}
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------- plan compare */

const ComparePlans = () => {
  const { db, employee } = useApp();
  const [tier, setTier] = useState<CoverageTier>('employee');
  const medical = db.benefitPlans.filter((p) => p.type === 'medical');
  const pg = db.payGroups.find((p) => p.id === employee?.payGroupId);
  const periods = pg?.frequency === 'semimonthly' ? 24 : pg?.frequency === 'biweekly' ? 26 : 12;

  const rows: { label: string; get: (p: BenefitPlan) => string }[] = [
    { label: 'Carrier', get: (p) => p.carrier },
    { label: 'Network', get: (p) => p.network },
    { label: 'Your cost per pay', get: (p) => currency((p.employeeCostMonthly[tier === 'waived' ? 'employee' : tier] * 12) / periods) },
    { label: 'Employer cost per pay', get: (p) => currency((p.employerCostMonthly[tier === 'waived' ? 'employee' : tier] * 12) / periods) },
    { label: 'Individual deductible', get: (p) => currency(p.deductibleIndividual, { cents: false }) },
    { label: 'Family deductible', get: (p) => currency(p.deductibleFamily, { cents: false }) },
    { label: 'Out-of-pocket max', get: (p) => currency(p.oopMaxIndividual, { cents: false }) },
    { label: 'Coinsurance', get: (p) => `${p.coinsurance}%` },
    { label: 'Primary care copay', get: (p) => (p.pcpCopay ? currency(p.pcpCopay, { cents: false }) : 'Deductible then coinsurance') },
    { label: 'Prescription copay', get: (p) => (p.rxCopay ? currency(p.rxCopay, { cents: false }) : 'Deductible then coinsurance') },
    { label: 'HSA eligible', get: (p) => (p.id === 'plan_med_hdhp' ? 'Yes' : 'No') },
    { label: 'Waiting period', get: (p) => `${p.eligibility.waitingPeriodDays} days` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Costs shown per paycheck for your pay frequency.</p>
        <Select value={tier} onChange={(e) => setTier(e.target.value as CoverageTier)} className="w-auto">
          {(['employee', 'employee_spouse', 'employee_children', 'family'] as CoverageTier[]).map((t) => (
            <option key={t} value={t}>{TIER_LABEL[t]}</option>
          ))}
        </Select>
      </div>

      <Card padded={false}>
        <div className="scroll-x">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-sunken px-3 py-3 text-left text-2xs font-semibold uppercase tracking-wider text-faint">Feature</th>
                {medical.map((p) => (
                  <th key={p.id} className="bg-sunken px-3 py-3 text-left">
                    <p className="text-sm font-semibold text-ink">{p.name}</p>
                    <p className="mt-0.5 text-2xs font-normal text-muted">{p.summary}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} className={cx(i % 2 === 1 && 'bg-sunken/40')}>
                  <td className="sticky left-0 z-10 border-t border-line bg-surface px-3 py-2.5 text-xs font-medium text-muted">{r.label}</td>
                  {medical.map((p) => (
                    <td key={p.id} className="border-t border-line px-3 py-2.5 tnum">{r.get(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

/* ---------------------------------------------------- enrollment admin */

const EnrollmentAdmin = () => {
  const { db } = useApp();
  const lookups = useLookups();
  const [planFilter, setPlanFilter] = useState('all');

  const eligible = db.employees.filter(
    (e) => e.status === 'active' && e.standardHoursPerWeek >= 30 && ['full_time', 'part_time'].includes(e.employmentType),
  );
  const enrolledIds = new Set(db.benefitEnrollments.filter((e) => e.status === 'active').map((e) => e.employeeId));
  const participation = eligible.length ? (enrolledIds.size / eligible.length) * 100 : 0;

  const byPlan = db.benefitPlans
    .filter((p) => ['medical', 'dental', 'vision'].includes(p.type))
    .map((p) => ({
      label: p.name,
      value: db.benefitEnrollments.filter((e) => e.planId === p.id && e.status === 'active').length,
    }))
    .filter((p) => p.value > 0);

  const monthlyEmployerCost = db.benefitEnrollments
    .filter((e) => e.status === 'active')
    .reduce((s, e) => s + e.employerCostPerPay * 2.17, 0);

  const rows = eligible.filter((e) => {
    if (planFilter === 'all') return true;
    if (planFilter === 'waived') return !enrolledIds.has(e.id) || db.benefitEnrollments.some((x) => x.employeeId === e.id && x.status === 'waived');
    return db.benefitEnrollments.some((x) => x.employeeId === e.id && x.planId === planFilter && x.status === 'active');
  });

  const columns: Column<Employee>[] = [
    {
      key: 'employee', header: 'Employee', sortValue: (e) => e.lastName,
      render: (e) => (
        <span className="flex items-center gap-2.5">
          <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={26} />
          <span className="min-w-0">
            <span className="block truncate text-sm">{e.preferredName} {e.lastName}</span>
            <span className="block truncate text-xs text-muted">{lookups.department.get(e.departmentId)?.name}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'medical', header: 'Medical', hideBelow: 'sm',
      render: (e) => {
        const en = db.benefitEnrollments.find((x) => x.employeeId === e.id && lookups.plan.get(x.planId)?.type === 'medical');
        if (!en) return <Badge tone="danger">Not enrolled</Badge>;
        if (en.tier === 'waived') return <Badge tone="neutral">Waived</Badge>;
        return <span className="text-sm">{lookups.plan.get(en.planId)?.name}</span>;
      },
    },
    {
      key: 'tier', header: 'Tier', hideBelow: 'md',
      render: (e) => {
        const en = db.benefitEnrollments.find((x) => x.employeeId === e.id && lookups.plan.get(x.planId)?.type === 'medical');
        return <span className="text-sm">{en ? TIER_LABEL[en.tier] : '—'}</span>;
      },
    },
    {
      key: 'cost', header: 'Employee / pay', align: 'right', hideBelow: 'md',
      sortValue: (e) => db.benefitEnrollments.filter((x) => x.employeeId === e.id).reduce((s, x) => s + x.employeeCostPerPay, 0),
      render: (e) => currency(db.benefitEnrollments.filter((x) => x.employeeId === e.id).reduce((s, x) => s + x.employeeCostPerPay, 0)),
    },
    {
      key: 'ercost', header: 'Employer / pay', align: 'right', hideBelow: 'lg',
      sortValue: (e) => db.benefitEnrollments.filter((x) => x.employeeId === e.id).reduce((s, x) => s + x.employerCostPerPay, 0),
      render: (e) => currency(db.benefitEnrollments.filter((x) => x.employeeId === e.id).reduce((s, x) => s + x.employerCostPerPay, 0)),
    },
    {
      key: 'deps', header: 'Dependents', align: 'center', hideBelow: 'lg',
      render: (e) => num(db.dependents.filter((d) => d.employeeId === e.id && d.isCovered).length),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Eligible employees" value={num(eligible.length)} icon={Users} />
        <StatTile label="Participation" value={percent(participation, 0)} icon={CheckCircle2} tone="success"
          footer={<Progress value={participation} tone="success" size="sm" />} />
        <StatTile label="Employer cost / month" value={currency(monthlyEmployerCost, { cents: false })} icon={PiggyBank} tone="teal" />
        <StatTile label="Covered dependents" value={num(db.dependents.filter((d) => d.isCovered).length)} icon={Users} tone="accent" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Enrollment by plan" icon={HeartPulse} />
          <BarChart
            categories={byPlan.map((p) => p.label.split(' ')[0])}
            series={[{ key: 'enrolled', label: 'Enrolled', values: byPlan.map((p) => p.value) }]}
            height={200} labelEvery={1}
          />
        </Card>
        <Card>
          <CardHeader title="Medical tier mix" icon={Users} />
          <DonutChart
            data={(['employee', 'employee_spouse', 'employee_children', 'family'] as CoverageTier[]).map((t) => ({
              label: TIER_LABEL[t],
              value: db.benefitEnrollments.filter((e) => e.tier === t && lookups.plan.get(e.planId)?.type === 'medical').length,
            })).filter((d) => d.value > 0)}
            centerLabel="enrolled"
            centerValue={num(db.benefitEnrollments.filter((e) => lookups.plan.get(e.planId)?.type === 'medical' && e.status === 'active').length)}
          />
        </Card>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <h3 className="flex-1 text-sm font-semibold">Enrollment roster</h3>
          <Select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="w-auto">
            <option value="all">All eligible employees</option>
            <option value="waived">Waived or not enrolled</option>
            {db.benefitPlans.filter((p) => p.type === 'medical').map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <DataTable rows={rows} columns={columns} getRowId={(e) => e.id} pageSize={14}
          empty={<EmptyState icon={Users} title="No employees match this filter" />} />
      </Card>
    </div>
  );
};

/* ---------------------------------------------------------- plan setup */

const PlanSetup = () => {
  const { db, can } = useApp();
  return (
    <div className="space-y-5">
      {!can('benefits.manage') ? (
        <Alert tone="neutral" icon={ShieldCheck} title="Read-only">Plan configuration requires the Benefits Administrator role.</Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {db.benefitPlans.map((p) => (
          <Card key={p.id}>
            <CardHeader
              title={p.name} dense
              subtitle={`${p.carrier} · plan year ${p.planYear}`}
              actions={<StatusBadge status={p.active ? 'active' : 'closed'} />}
            />
            <p className="text-xs leading-relaxed text-muted">{p.summary}</p>
            <KeyValue className="mt-3" columns={1} items={[
              { label: 'Type', value: <span className="capitalize">{p.type.replace(/_/g, ' ')}</span> },
              { label: 'Enrolled', value: num(db.benefitEnrollments.filter((e) => e.planId === p.id && e.status === 'active').length) },
              { label: 'Employee cost (EE only)', value: `${currency(p.employeeCostMonthly.employee)}/mo` },
              { label: 'Employer cost (EE only)', value: `${currency(p.employerCostMonthly.employee)}/mo` },
              { label: 'Minimum hours', value: `${p.eligibility.minHoursPerWeek}/week` },
              { label: 'Waiting period', value: `${p.eligibility.waitingPeriodDays} days` },
            ]} />
          </Card>
        ))}
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-5"><CardHeader title="Enrollment windows" dense icon={Settings2} /></div>
        <ul className="divide-y divide-line">
          {db.enrollmentWindows.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div>
                <p className="text-sm font-medium">{w.name}</p>
                <p className="text-xs capitalize text-muted">{w.type.replace(/_/g, ' ')} · plan year {w.planYear}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">{fmtDate(w.startDate)} – {fmtDate(w.endDate)}</span>
                <StatusBadge status={w.active ? 'active' : 'closed'} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};
