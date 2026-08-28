import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Banknote, CalendarClock, Check, CheckCircle2, Cpu, Download,
  FileCheck2, Landmark, Lock, Send, ShieldCheck, Users,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Column, ConfirmDialog, DataTable,
  EmptyState, Field, Input, KeyValue, Modal, PermissionDenied, SectionHeader, StageStepper,
  StatusBadge, Tabs, Timeline, cx,
} from '@/components/ui';
import { DonutChart } from '@/components/charts';
import { useApp, useLookups } from '@/lib/store';
import { usePayrollActions } from '@/lib/actions';
import { issueCounts } from '@/lib/validation';
import { currency, downloadText, num, toCsv } from '@/lib/format';
import { fmtDate, fmtDateTime, timeAgo } from '@/lib/dates';
import type { Paycheck, PayrollIssue, PayrollRun } from '@/lib/types';
import { PaystubModal } from './Payroll';

const STAGES = [
  { id: 'gathering', label: 'Gather inputs' },
  { id: 'calculated', label: 'Calculate' },
  { id: 'validation', label: 'Validate' },
  { id: 'employee_review', label: 'Employee review' },
  { id: 'pending_approval', label: 'Approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'finalized', label: 'Finalize' },
  { id: 'paid', label: 'Paid' },
];

export const PayrollRunPage = () => {
  const { runId } = useParams();
  const { db, can } = useApp();
  const { calculateRun, runValidation, advanceRun, resolveIssue } = usePayrollActions();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [confirm, setConfirm] = useState<null | 'finalize' | 'pay'>(null);
  const [resolving, setResolving] = useState<PayrollIssue | null>(null);
  const [note, setNote] = useState('');
  const [stub, setStub] = useState<Paycheck | null>(null);

  const run = db.payrollRuns.find((r) => r.id === runId);
  if (!can('payroll.view.all', 'payroll.process')) return <PermissionDenied what="payroll runs" />;
  if (!run) return <EmptyState title="Payroll run not found" body="It may have been cancelled." />;

  const period = lookups.payPeriod.get(run.payPeriodId);
  const group = lookups.payGroup.get(run.payGroupId);
  const checks = db.paychecks.filter((c) => c.payrollRunId === run.id);
  const issues = db.payrollIssues.filter((i) => i.payrollRunId === run.id);
  const counts = issueCounts(issues);
  const canProcess = can('payroll.process');
  const canApprove = can('payroll.approve');

  const nextAction = (() => {
    switch (run.status) {
      case 'draft':
      case 'gathering':
        return { label: 'Calculate payroll', icon: Cpu, run: () => calculateRun(run.id), enabled: canProcess };
      case 'calculated':
        return { label: 'Run validation', icon: ShieldCheck, run: () => runValidation(run.id), enabled: canProcess };
      case 'validation':
        return counts.blocking
          ? { label: `Resolve ${counts.error} blocking error(s)`, icon: AlertTriangle, run: () => setTab('validation'), enabled: canProcess }
          : { label: 'Release for employee review', icon: Users, run: () => advanceRun(run.id, 'employee_review'), enabled: canProcess };
      case 'employee_review':
        return { label: 'Submit for approval', icon: Send, run: () => advanceRun(run.id, 'pending_approval'), enabled: canProcess };
      case 'pending_approval':
        return { label: 'Approve payroll', icon: Check, run: () => advanceRun(run.id, 'approved'), enabled: canApprove };
      case 'approved':
        return { label: 'Finalize and lock', icon: Lock, run: () => setConfirm('finalize'), enabled: canApprove };
      case 'finalized':
        return { label: 'Send payments', icon: Banknote, run: () => setConfirm('pay'), enabled: canApprove };
      default:
        return null;
    }
  })();

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Banknote },
    { id: 'validation', label: 'Validation', count: counts.total ? counts.error + counts.warning + counts.review : undefined, icon: ShieldCheck },
    { id: 'checks', label: 'Checks', count: checks.length, icon: FileCheck2 },
    { id: 'funding', label: 'Funding', icon: Landmark },
    { id: 'audit', label: 'Audit trail', icon: CalendarClock },
  ];

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/payroll?tab=runs')} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All payroll runs
      </button>

      <SectionHeader
        title={`Payroll run ${run.runNumber}`}
        subtitle={`${group?.name} · ${period ? `${fmtDate(period.start)} – ${fmtDate(period.end)}` : ''} · check date ${period ? fmtDate(period.checkDate) : '—'}`}
        actions={
          <>
            <StatusBadge status={run.status} />
            {nextAction ? (
              <Button variant="primary" size="md" icon={nextAction.icon} disabled={!nextAction.enabled} onClick={nextAction.run}>
                {nextAction.label}
              </Button>
            ) : <Badge tone="success">Complete</Badge>}
          </>
        }
      />

      {!canProcess && !canApprove ? (
        <Alert tone="neutral" icon={Lock} title="Read-only view">
          Your role can view payroll but not process or approve it.
        </Alert>
      ) : null}

      <Card>
        <StageStepper stages={STAGES} current={run.status === 'draft' ? 'gathering' : run.status} />
      </Card>

      {counts.blocking && ['validation', 'employee_review', 'pending_approval'].includes(run.status) ? (
        <Alert tone="danger" icon={AlertTriangle} title={`${counts.error} blocking error(s) must be resolved before approval`}
          action={<Button size="sm" variant="danger" onClick={() => setTab('validation')}>Review errors</Button>}>
          Meridian will not let a run with unresolved errors be approved or funded.
        </Alert>
      ) : null}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' ? <Overview run={run} checks={checks} counts={counts} /> : null}
      {tab === 'validation' ? (
        <Validation
          issues={issues}
          canProcess={canProcess}
          onResolve={(i) => setResolving(i)}
          onRerun={() => runValidation(run.id)}
        />
      ) : null}
      {tab === 'checks' ? <Checks checks={checks} onOpen={setStub} /> : null}
      {tab === 'funding' ? <Funding run={run} checks={checks} /> : null}
      {tab === 'audit' ? <AuditTrail run={run} /> : null}

      <PaystubModal check={stub} onClose={() => setStub(null)} />

      <ConfirmDialog
        open={confirm === 'finalize'} onClose={() => setConfirm(null)}
        title="Finalize and lock this payroll run"
        confirmLabel="Finalize payroll"
        body={
          <>
            <p>Finalizing issues {checks.length} pay statements, locks the underlying timecards and closes the pay period.
              This cannot be undone from the interface — a correction run would be required.</p>
            <p className="mt-2 font-medium text-ink">Total funding required: {currency(run.totals.netPay)} net plus {currency(run.totals.employerTaxes)} in employer taxes.</p>
          </>
        }
        onConfirm={() => advanceRun(run.id, 'finalized')}
      />

      <ConfirmDialog
        open={confirm === 'pay'} onClose={() => setConfirm(null)}
        title="Send payments"
        confirmLabel="Originate payments"
        body={`This originates the ACH file for ${checks.filter((c) => c.method === 'direct_deposit').length} direct deposits and notifies every employee that their statement is available.`}
        onConfirm={() => advanceRun(run.id, 'paid')}
      />

      <Modal
        open={Boolean(resolving)} onClose={() => setResolving(null)} title="Resolve exception" icon={CheckCircle2}
        subtitle={resolving?.title}
        footer={
          <>
            <Button onClick={() => setResolving(null)}>Cancel</Button>
            <Button variant="primary" disabled={!note} onClick={() => { if (resolving) resolveIssue(resolving.id, note); setResolving(null); setNote(''); }}>
              Mark resolved
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {resolving ? (
            <>
              <div className="well p-3">
                <p className="text-xs text-muted">{resolving.detail}</p>
                <p className="mt-1.5 text-xs text-brand-700">Suggested action: {resolving.suggestedAction}</p>
              </div>
              <Field label="What did you do?" required hint="Stored with your name and timestamp in the payroll audit trail.">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Manager confirmed the hours and approved the timecard." />
              </Field>
            </>
          ) : null}
        </div>
      </Modal>

    </div>
  );
};

/* ------------------------------------------------------------ overview */

const Overview = ({ run, checks, counts }: { run: PayrollRun; checks: Paycheck[]; counts: ReturnType<typeof issueCounts> }) => {
  const { db } = useApp();
  const lookups = useLookups();

  const byDept = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of checks) {
      const emp = lookups.employee.get(c.employeeId);
      if (!emp) continue;
      map.set(emp.departmentId, (map.get(emp.departmentId) ?? 0) + c.grossPay);
    }
    return [...map.entries()]
      .map(([id, value]) => ({ label: lookups.department.get(id)?.name ?? id, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [checks, lookups]);

  const costBreakdown = [
    { label: 'Net pay', value: run.totals.netPay },
    { label: 'Employee taxes', value: run.totals.employeeTaxes },
    { label: 'Employee deductions', value: run.totals.preTaxDeductions + run.totals.postTaxDeductions },
    { label: 'Employer taxes', value: run.totals.employerTaxes },
    { label: 'Employer benefits', value: run.totals.employerBenefits },
  ].filter((c) => c.value > 0);

  const hourly = checks.filter((c) => lookups.employee.get(c.employeeId)?.payType === 'hourly').length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Gross pay', currency(run.totals.grossPay, { cents: false }), `${num(run.totals.hours, 1)} hours`],
          ['Net pay', currency(run.totals.netPay, { cents: false }), `${checks.length} statements`],
          ['Employer cost', currency(run.totals.totalCost, { cents: false }), 'Fully loaded'],
          ['Employees', num(run.employeeCount), `${hourly} hourly · ${run.employeeCount - hourly} salaried`],
        ].map(([label, value, hint]) => (
          <Card key={label}>
            <p className="text-xs text-faint">{label}</p>
            <p className="tnum mt-1 text-2xl font-semibold tracking-[-0.02em]">{value}</p>
            <p className="mt-0.5 text-2xs text-faint">{hint}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Where the money goes" subtitle="Total employer cost for this run" icon={Banknote} />
          <DonutChart
            data={costBreakdown}
            centerLabel="employer cost"
            centerValue={currency(run.totals.totalCost, { compact: true, cents: false })}
            format={(n) => currency(n, { compact: true, cents: false })}
          />
        </Card>

        <Card>
          <CardHeader title="Gross pay by department" icon={Users} />
          <ul className="space-y-2.5">
            {byDept.map((d) => {
              const max = byDept[0]?.value || 1;
              return (
                <li key={d.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-xs">{d.label}</span>
                    <span className="tnum text-xs font-medium text-muted">{currency(d.value, { cents: false })}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: 'var(--chart-1)' }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Inputs feeding this run" icon={Cpu} subtitle="Everything the calculation read from the shared employee record" />
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              ['Approved time', `${num(run.totals.hours, 1)} hours from ${db.timecards.filter((t) => t.payPeriodId === run.payPeriodId).length} timecards`],
              ['Compensation', `${run.employeeCount} active compensation records`],
              ['Benefit deductions', `${currency(run.totals.preTaxDeductions + run.totals.postTaxDeductions, { cents: false })} across active elections`],
              ['Tax elections', `${db.taxProfiles.filter((t) => t.complete).length} completed W-4s`],
              ['Garnishments', `${db.garnishments.filter((g) => g.active).length} active orders`],
              ['Reimbursements', `${currency(run.totals.reimbursements)} from approved expense reports`],
            ].map(([title, detail]) => (
              <li key={title} className="rounded-lg border border-line p-3">
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-0.5 text-xs text-muted">{detail}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Validation summary" icon={ShieldCheck} />
          {counts.total === 0 ? (
            <EmptyState compact icon={ShieldCheck} title="Not yet validated" body="Run validation once the payroll is calculated." />
          ) : (
            <ul className="space-y-2.5">
              {[
                ['Errors', counts.error, 'danger'],
                ['Warnings', counts.warning, 'warning'],
                ['Review required', counts.review, 'info'],
                ['Resolved', counts.resolved, 'success'],
              ].map(([label, value, tone]) => (
                <li key={label as string} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted">{label}</span>
                  <Badge tone={tone as 'danger'}>{value as number}</Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 rounded-lg border border-line bg-sunken p-3">
            <p className="text-xs font-medium">{counts.blocking ? 'Blocked' : counts.total ? 'Ready to advance' : 'Awaiting validation'}</p>
            <p className="mt-1 text-2xs text-muted">
              {counts.blocking
                ? 'Errors must be resolved before this run can be approved.'
                : counts.total
                  ? 'No blocking errors. Warnings and review items are advisory.'
                  : 'Validation has not run against this calculation yet.'}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------- validation */

const Validation = ({
  issues, canProcess, onResolve, onRerun,
}: { issues: PayrollIssue[]; canProcess: boolean; onResolve: (i: PayrollIssue) => void; onRerun: () => void }) => {
  const lookups = useLookups();
  const navigate = useNavigate();
  const order = { error: 0, warning: 1, review: 2, ready: 3 } as const;
  const sorted = [...issues].sort((a, b) => Number(a.resolved) - Number(b.resolved) || order[a.level] - order[b.level]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Validation runs eleven classes of check across time, setup, deductions and amounts before payroll can advance.
        </p>
        {canProcess ? <Button icon={ShieldCheck} onClick={onRerun}>Re-run validation</Button> : null}
      </div>

      {sorted.length === 0 ? (
        <Card><EmptyState icon={ShieldCheck} title="No findings" body="Either validation has not run yet, or this payroll is clean." /></Card>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {sorted.map((i) => {
              const emp = i.employeeId ? lookups.employee.get(i.employeeId) : null;
              return (
                <li key={i.id} className={cx('px-4 py-4 sm:px-5', i.resolved && 'bg-sunken/40')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={i.resolved ? 'success' : i.level === 'error' ? 'danger' : i.level === 'warning' ? 'warning' : 'info'}>
                          {i.resolved ? 'Resolved' : i.level === 'review' ? 'Review required' : i.level}
                        </Badge>
                        <span className="font-mono text-2xs text-faint">{i.code}</span>
                        <p className="text-sm font-medium">{i.title}</p>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted">{i.detail}</p>
                      <p className="mt-1 text-xs text-brand-700">→ {i.suggestedAction}</p>
                      {i.resolved ? (
                        <p className="mt-1.5 text-2xs text-success-700">Resolved {timeAgo(i.resolvedAt)} · {i.resolutionNote}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {emp ? (
                        <button onClick={() => navigate(`/people/${emp.id}`)} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs hover:bg-sunken">
                          <Avatar first={emp.firstName} last={emp.lastName} seed={emp.avatarSeed} size={18} />
                          {emp.preferredName} {emp.lastName}
                        </button>
                      ) : null}
                      {!i.resolved && canProcess ? (
                        <Button size="xs" variant="primary" onClick={() => onResolve(i)}>Resolve</Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
};

/* --------------------------------------------------------------- checks */

const Checks = ({ checks, onOpen }: { checks: Paycheck[]; onOpen: (c: Paycheck) => void }) => {
  const lookups = useLookups();

  const columns: Column<Paycheck>[] = [
    {
      key: 'employee', header: 'Employee', sortValue: (c) => lookups.employee.get(c.employeeId)?.lastName ?? '',
      render: (c) => {
        const e = lookups.employee.get(c.employeeId);
        return e ? (
          <span className="flex items-center gap-2.5">
            <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={26} />
            <span className="min-w-0">
              <span className="block truncate text-sm">{e.preferredName} {e.lastName}</span>
              <span className="block truncate text-xs text-muted">{e.employeeNumber} · {lookups.department.get(e.departmentId)?.name}</span>
            </span>
          </span>
        ) : '—';
      },
    },
    { key: 'check', header: 'Check #', hideBelow: 'lg', sortValue: (c) => c.checkNumber, render: (c) => <span className="font-mono text-xs">{c.checkNumber}</span> },
    { key: 'hours', header: 'Hours', align: 'right', sortValue: (c) => c.totalHours, render: (c) => num(c.totalHours, 2) },
    { key: 'gross', header: 'Gross', align: 'right', sortValue: (c) => c.grossPay, render: (c) => currency(c.grossPay) },
    { key: 'taxes', header: 'Taxes', align: 'right', hideBelow: 'md', sortValue: (c) => c.taxes.reduce((s, t) => s + t.amount, 0), render: (c) => currency(c.taxes.reduce((s, t) => s + t.amount, 0)) },
    { key: 'ded', header: 'Deductions', align: 'right', hideBelow: 'md', sortValue: (c) => c.deductions.reduce((s, d) => s + d.amount, 0), render: (c) => currency(c.deductions.reduce((s, d) => s + d.amount, 0)) },
    { key: 'net', header: 'Net', align: 'right', sortValue: (c) => c.netPay, render: (c) => <span className="font-semibold">{currency(c.netPay)}</span> },
    { key: 'method', header: 'Method', align: 'center', hideBelow: 'lg', render: (c) => <Badge tone={c.method === 'direct_deposit' ? 'success' : 'warning'}>{c.method.replace(/_/g, ' ')}</Badge> },
    { key: 'go', header: '', align: 'right', render: (c) => <Button size="xs" onClick={() => onOpen(c)}>Stub</Button> },
  ];

  return (
    <Card padded={false}>
      <DataTable rows={checks} columns={columns} getRowId={(c) => c.id} pageSize={15}
        initialSort={{ key: 'net', dir: 'desc' }}
        empty={<EmptyState icon={FileCheck2} title="No checks calculated yet" body="Calculate the payroll run to generate pay statements." />} />
    </Card>
  );
};

/* -------------------------------------------------------------- funding */

const Funding = ({ run, checks }: { run: PayrollRun; checks: Paycheck[] }) => {
  const { db, can } = useApp();
  const lookups = useLookups();
  const period = lookups.payPeriod.get(run.payPeriodId);
  const ach = checks.filter((c) => c.method === 'direct_deposit');
  const paper = checks.filter((c) => c.method !== 'direct_deposit');
  const achTotal = ach.reduce((s, c) => s + c.netPay, 0);
  const paperTotal = paper.reduce((s, c) => s + c.netPay, 0);
  const taxDeposit = run.totals.employeeTaxes + run.totals.employerTaxes;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader title="Funding requirement" icon={Landmark}
            subtitle={period ? `Debited two banking days before the ${fmtDate(period.checkDate)} check date` : ''} />
          <div className="scroll-x rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-sunken">
                <tr>
                  <th className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-faint">Item</th>
                  <th className="px-3 py-2 text-right text-2xs font-semibold uppercase tracking-wider text-faint">Count</th>
                  <th className="px-3 py-2 text-right text-2xs font-semibold uppercase tracking-wider text-faint">Amount</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Direct deposit (ACH)', ach.length, achTotal],
                  ['Physical checks', paper.length, paperTotal],
                  ['Payroll tax deposit', checks.length, taxDeposit],
                  ['Employer benefit contributions', checks.length, run.totals.employerBenefits],
                ].map(([label, count, amount]) => (
                  <tr key={label as string} className="border-t border-line">
                    <td className="px-3 py-2">{label}</td>
                    <td className="px-3 py-2 text-right tnum">{num(count as number)}</td>
                    <td className="px-3 py-2 text-right tnum">{currency(amount as number)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line-strong bg-sunken/60 font-semibold">
                  <td className="px-3 py-2.5">Total to fund</td>
                  <td className="px-3 py-2.5 text-right tnum">{num(checks.length)}</td>
                  <td className="px-3 py-2.5 text-right tnum">{currency(achTotal + paperTotal + taxDeposit + run.totals.employerBenefits)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {can('payroll.gl.export') ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button icon={Download} onClick={() => downloadText(`ach-${run.runNumber}.csv`, toCsv(ach.map((c) => {
                const e = lookups.employee.get(c.employeeId);
                const dd = db.directDeposits.find((d) => d.employeeId === c.employeeId && d.active);
                return {
                  employee_number: e?.employeeNumber ?? '', name: e ? `${e.firstName} ${e.lastName}` : '',
                  bank: dd?.bankName ?? '', account_last4: dd?.accountLast4 ?? '',
                  amount: c.netPay, effective_date: c.checkDate,
                };
              })))}>Export ACH file</Button>
              <Button icon={Download} onClick={() => downloadText(`tax-deposit-${run.runNumber}.csv`, toCsv(
                Object.entries(checks.reduce<Record<string, number>>((acc, c) => {
                  for (const t of c.taxes) acc[t.code] = (acc[t.code] ?? 0) + t.amount + t.employerAmount;
                  return acc;
                }, {})).map(([code, amount]) => ({ tax_code: code, amount: amount.toFixed(2), check_date: period?.checkDate ?? '' })),
              ))}>Export tax deposit</Button>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Payment methods" dense icon={Banknote} />
          <DonutChart
            size={140}
            data={[{ label: 'Direct deposit', value: achTotal }, { label: 'Physical check', value: paperTotal }].filter((d) => d.value > 0)}
            centerLabel="net pay"
            centerValue={currency(achTotal + paperTotal, { compact: true, cents: false })}
            format={(n) => currency(n, { compact: true, cents: false })}
          />
        </Card>
        <Card>
          <CardHeader title="Banking" dense icon={Landmark} />
          <KeyValue columns={1} items={[
            { label: 'Originating bank', value: 'Front Range Bank' },
            { label: 'Settlement', value: 'ACH, 2 banking days' },
            { label: 'Tax filing agent', value: 'Statute Tax Services' },
            { label: 'Check date', value: period ? fmtDate(period.checkDate) : '—' },
          ]} />
        </Card>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------- audit trail */

const AuditTrail = ({ run }: { run: PayrollRun }) => {
  const { db } = useApp();
  const lookups = useLookups();
  const entries = db.auditLog.filter((a) => a.objectId === run.id || a.module === 'Payroll').slice(0, 25);
  const approver = run.approvedBy ? lookups.employee.get(run.approvedBy) : null;

  const milestones = [
    { id: 'created', title: 'Run created', at: run.createdAt, tone: 'brand' as const },
    ...(run.calculatedAt ? [{ id: 'calc', title: 'Gross-to-net calculated', at: run.calculatedAt, tone: 'brand' as const }] : []),
    ...(run.approvedAt ? [{ id: 'appr', title: `Approved${approver ? ` by ${approver.preferredName} ${approver.lastName}` : ''}`, at: run.approvedAt, tone: 'success' as const }] : []),
    ...(run.finalizedAt ? [{ id: 'fin', title: 'Finalized and locked', at: run.finalizedAt, tone: 'success' as const }] : []),
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Run milestones" icon={CalendarClock} />
        <Timeline items={milestones.map((m) => ({ id: m.id, title: m.title, meta: fmtDateTime(m.at), tone: m.tone }))} />
      </Card>
      <Card padded={false}>
        <div className="p-4 sm:p-5"><CardHeader title="Payroll audit entries" dense icon={ShieldCheck} /></div>
        {entries.length === 0 ? <EmptyState compact title="No audit entries yet" /> : (
          <ul className="divide-y divide-line">
            {entries.map((a) => (
              <li key={a.id} className="px-4 py-2.5 sm:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm">{a.action}</p>
                  <p className="text-2xs text-faint">{timeAgo(a.at)}</p>
                </div>
                <p className="text-xs text-muted">{a.actorName} · {a.objectLabel} · {a.ipAddress}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
