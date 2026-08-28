import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Banknote, CheckCircle2, CreditCard, Download, FileText,
  Landmark, Plus, Receipt, Scale, Wallet,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Column, DataTable, EmptyState, Field,
  Input, KeyValue, Modal, PermissionDenied, SectionHeader, Select, StatTile, StatusBadge,
  Tabs, cx,
} from '@/components/ui';
import { BarChart, LineChart } from '@/components/charts';
import { useApp, useLookups } from '@/lib/store';
import { usePayrollActions } from '@/lib/actions';
import { issueCounts } from '@/lib/validation';
import { latestPaycheck, paychecksFor, payrollHistory } from '@/lib/selectors';
import { currency, downloadText, num, toCsv } from '@/lib/format';
import { fmtDate, fmtDateShort } from '@/lib/dates';
import type { Paycheck, PayrollRun } from '@/lib/types';

export const PayrollPage = () => {
  const { db, can } = useApp();
  const [params, setParams] = useSearchParams();
  const checkParam = params.get('check');
  const defaultTab = can('payroll.process', 'payroll.view.all') ? 'runs' : 'mine';
  const tab = params.get('tab') ?? (checkParam ? 'mine' : defaultTab);

  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  if (!can('payroll.view.self', 'payroll.view.all', 'payroll.process')) {
    return <PermissionDenied what="payroll" />;
  }

  const openIssues = db.payrollIssues.filter((i) => !i.resolved).length;

  const tabs = [
    { id: 'mine', label: 'My pay', icon: Wallet },
    ...(can('payroll.view.all', 'payroll.process') ? [
      { id: 'runs', label: 'Payroll runs', icon: Banknote },
      { id: 'register', label: 'Pay register', icon: FileText },
      { id: 'exceptions', label: 'Exceptions', count: openIssues, icon: AlertTriangle },
      { id: 'tax', label: 'Taxes & deductions', icon: Scale },
      { id: 'gl', label: 'General ledger', icon: Landmark },
    ] : []),
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Payroll"
        subtitle="Approved time, compensation, benefits and taxes converge here. Nothing funds until validation clears."
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'mine' ? <MyPay focusCheckId={checkParam} /> : null}
      {tab === 'runs' ? <PayrollRuns /> : null}
      {tab === 'register' ? <PayRegister /> : null}
      {tab === 'exceptions' ? <ExceptionsTab /> : null}
      {tab === 'tax' ? <TaxTab /> : null}
      {tab === 'gl' ? <GeneralLedger /> : null}
    </div>
  );
};

/* -------------------------------------------------------------- my pay */

const MyPay = ({ focusCheckId }: { focusCheckId: string | null }) => {
  const { db, employee } = useApp();
  const { acknowledgePaycheck } = usePayrollActions();
  const [open, setOpen] = useState<Paycheck | null>(
    () => (focusCheckId ? db.paychecks.find((c) => c.id === focusCheckId) ?? null : null),
  );
  if (!employee) return null;

  const checks = paychecksFor(db, employee.id);
  const latest = latestPaycheck(db, employee.id);
  const year = db.meta.today.slice(0, 4);
  const ytd = checks.filter((c) => c.checkDate.startsWith(year));
  const ytdGross = ytd.reduce((s, c) => s + c.grossPay, 0);
  const ytdNet = ytd.reduce((s, c) => s + c.netPay, 0);
  const ytdTaxes = ytd.reduce((s, c) => s + c.taxes.reduce((t, x) => t + x.amount, 0), 0);
  const ytdDeductions = ytd.reduce((s, c) => s + c.deductions.reduce((t, x) => t + x.amount, 0), 0);
  const deposits = db.directDeposits.filter((d) => d.employeeId === employee.id);
  const trend = [...checks].reverse().slice(-10);

  if (!latest) {
    return (
      <Card>
        <EmptyState icon={Wallet} title="No pay statements yet"
          body="Your first statement will appear here after your first pay date." />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Most recent net pay" value={currency(latest.netPay)} icon={Wallet} hint={`Paid ${fmtDate(latest.checkDate)}`} />
        <StatTile label={`${year} gross`} value={currency(ytdGross, { cents: false })} icon={Banknote} tone="teal" />
        <StatTile label={`${year} taxes withheld`} value={currency(ytdTaxes, { cents: false })} icon={Scale} tone="warning" />
        <StatTile label={`${year} deductions`} value={currency(ytdDeductions, { cents: false })} icon={Receipt} tone="accent" hint={`${currency(ytdNet, { cents: false })} net`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {trend.length > 2 ? (
            <Card>
              <CardHeader title="Pay trend" subtitle="Gross versus net across recent statements" icon={Wallet} />
              <LineChart
                area
                categories={trend.map((c) => fmtDateShort(c.checkDate))}
                series={[
                  { key: 'gross', label: 'Gross', values: trend.map((c) => c.grossPay) },
                  { key: 'net', label: 'Net', values: trend.map((c) => c.netPay) },
                ]}
                format={(n) => currency(n, { compact: true, cents: false })}
                height={210}
              />
            </Card>
          ) : null}

          <Card padded={false}>
            <div className="p-4 sm:p-5"><CardHeader title="Pay statements" dense icon={FileText} /></div>
            <div className="scroll-x">
              <table className="dt">
                <thead>
                  <tr>
                    <th>Check date</th><th className="text-right">Hours</th><th className="text-right">Gross</th>
                    <th className="text-right">Net</th><th className="text-center">Status</th><th />
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.id}>
                      <td className="text-sm">{fmtDate(c.checkDate)}</td>
                      <td className="text-right tnum text-sm">{num(c.totalHours, 2)}</td>
                      <td className="text-right tnum text-sm">{currency(c.grossPay)}</td>
                      <td className="text-right tnum text-sm font-semibold">{currency(c.netPay)}</td>
                      <td className="text-center">
                        {c.employeeAcknowledged ? <Badge tone="success">Reviewed</Badge> : <StatusBadge status={c.status} />}
                      </td>
                      <td className="text-right">
                        <Button size="xs" onClick={() => setOpen(c)}>View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Direct deposit" dense icon={CreditCard} />
            {deposits.length === 0 ? (
              <Alert tone="warning" title="No account on file">You will be paid by physical check until you add an account.</Alert>
            ) : (
              <ul className="space-y-2.5">
                {deposits.map((d) => (
                  <li key={d.id} className="rounded-lg border border-line p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{d.nickname}</p>
                      {d.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Pending</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{d.bankName} · ••••{d.accountLast4}</p>
                    <p className="mt-0.5 text-2xs text-faint">
                      {d.allocationType === 'remainder' ? 'Remainder of net pay'
                        : d.allocationType === 'percent' ? `${d.allocationValue}% of net pay`
                        : `${currency(d.allocationValue)} per check`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Year-end documents" dense icon={FileText} />
            <ul className="space-y-2">
              {db.documents.filter((d) => d.employeeId === employee.id && d.category === 'tax').map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{d.name}</span>
                  <Badge tone="neutral">{d.fileType.toUpperCase()}</Badge>
                </li>
              ))}
              {db.documents.filter((d) => d.employeeId === employee.id && d.category === 'tax').length === 0 ? (
                <li className="text-xs text-muted">Your W-2 will be posted here in January.</li>
              ) : null}
            </ul>
          </Card>
        </div>
      </div>

      <PaystubModal check={open} onClose={() => setOpen(null)} onAcknowledge={acknowledgePaycheck} />
    </div>
  );
};

export const PaystubModal = ({
  check, onClose, onAcknowledge,
}: { check: Paycheck | null; onClose: () => void; onAcknowledge?: (id: string) => void }) => {
  const { db } = useApp();
  const lookups = useLookups();
  if (!check) return null;
  const emp = lookups.employee.get(check.employeeId);
  const period = lookups.payPeriod.get(check.payPeriodId);
  const taxTotal = check.taxes.reduce((s, t) => s + t.amount, 0);
  const dedTotal = check.deductions.reduce((s, d) => s + d.amount, 0);

  return (
    <Modal
      open onClose={onClose} size="lg" icon={Wallet}
      title="Pay statement"
      subtitle={`${emp?.firstName} ${emp?.lastName} · check ${check.checkNumber} · ${fmtDate(check.checkDate)}`}
      footer={
        <>
          <Button icon={Download} onClick={() => downloadText(
            `paystub-${check.checkNumber}.csv`,
            toCsv([
              ...check.earnings.map((e) => ({ section: 'Earnings', code: e.code, description: e.label, hours: e.hours, rate: e.rate, amount: e.amount })),
              ...check.deductions.map((d) => ({ section: 'Deductions', code: d.code, description: d.label, hours: '', rate: '', amount: -d.amount })),
              ...check.taxes.map((t) => ({ section: 'Taxes', code: t.code, description: t.label, hours: '', rate: '', amount: -t.amount })),
              { section: 'Summary', code: 'NET', description: 'Net pay', hours: check.totalHours, rate: '', amount: check.netPay },
            ]),
          )}>Download</Button>
          <div className="flex-1" />
          {onAcknowledge && !check.employeeAcknowledged ? (
            <Button variant="primary" onClick={() => { onAcknowledge(check.id); onClose(); }}>Acknowledge</Button>
          ) : <Button onClick={onClose}>Close</Button>}
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ['Gross pay', currency(check.grossPay)],
            ['Taxes', `−${currency(taxTotal)}`],
            ['Deductions', `−${currency(dedTotal)}`],
            ['Net pay', currency(check.netPay)],
          ].map(([label, value], i) => (
            <div key={label} className={cx('rounded-lg border p-3', i === 3 ? 'border-brand-200 bg-brand-50' : 'border-line bg-sunken')}>
              <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
              <p className={cx('tnum mt-1 text-lg font-semibold', i === 3 && 'text-brand-800')}>{value}</p>
            </div>
          ))}
        </div>

        <KeyValue columns={3} items={[
          { label: 'Pay period', value: period ? `${fmtDate(period.start)} – ${fmtDate(period.end)}` : '—' },
          { label: 'Payment method', value: check.method.replace(/_/g, ' ') },
          { label: 'Total hours', value: num(check.totalHours, 2) },
        ]} />

        <Section title="Earnings">
          <StubTable
            head={['Description', 'Hours', 'Rate', 'Amount']}
            rows={check.earnings.map((e) => [e.label, e.hours ? num(e.hours, 2) : '—', e.rate ? currency(e.rate) : '—', currency(e.amount)])}
            total={['Total earnings', '', '', currency(check.grossPay)]}
          />
        </Section>

        <Section title="Taxes withheld">
          <StubTable
            head={['Tax', 'Jurisdiction', 'Taxable wages', 'Amount']}
            rows={check.taxes.filter((t) => t.amount > 0).map((t) => [t.label, t.jurisdiction, currency(t.taxable, { cents: false }), currency(t.amount)])}
            total={['Total taxes', '', '', currency(taxTotal)]}
          />
        </Section>

        {check.deductions.length ? (
          <Section title="Deductions">
            <StubTable
              head={['Deduction', 'Type', 'Employer paid', 'Amount']}
              rows={check.deductions.map((d) => [d.label, d.preTax ? 'Pre-tax' : 'Post-tax', d.employerAmount ? currency(d.employerAmount) : '—', currency(d.amount)])}
              total={['Total deductions', '', '', currency(dedTotal)]}
            />
          </Section>
        ) : null}

        <Section title="Year to date">
          <KeyValue columns={3} items={[
            { label: 'YTD gross', value: currency(check.ytdGross, { cents: false }) },
            { label: 'YTD taxes', value: currency(check.ytdTaxes, { cents: false }) },
            { label: 'YTD net', value: currency(check.ytdNet, { cents: false }) },
          ]} />
        </Section>

        <p className="text-2xs leading-relaxed text-faint">
          {db.organization.legalName} · EIN {db.organization.ein} · {db.organization.addressLine1},
          {' '}{db.organization.city}, {db.organization.state} {db.organization.postalCode}
        </p>
      </div>
    </Modal>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h4 className="mb-2 text-2xs font-semibold uppercase tracking-[0.14em] text-faint">{title}</h4>
    {children}
  </div>
);

const StubTable = ({ head, rows, total }: { head: string[]; rows: string[][]; total?: string[] }) => (
  <div className="scroll-x rounded-lg border border-line">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-sunken">
          {head.map((h, i) => (
            <th key={h} className={cx('px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-faint', i === 0 ? 'text-left' : 'text-right')}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-t border-line">
            {r.map((c, ci) => (
              <td key={ci} className={cx('px-3 py-2', ci === 0 ? 'text-left' : 'text-right tnum')}>{c}</td>
            ))}
          </tr>
        ))}
        {total ? (
          <tr className="border-t-2 border-line-strong bg-sunken/60 font-medium">
            {total.map((c, ci) => (
              <td key={ci} className={cx('px-3 py-2', ci === 0 ? 'text-left' : 'text-right tnum')}>{c}</td>
            ))}
          </tr>
        ) : null}
      </tbody>
    </table>
  </div>
);

/* ------------------------------------------------------------ payroll runs */

const PayrollRuns = () => {
  const { db, can, today } = useApp();
  const { createRun } = usePayrollActions();
  const navigate = useNavigate();
  const lookups = useLookups();
  const [creating, setCreating] = useState(false);
  const [payGroupId, setPayGroupId] = useState(db.payGroups[0]?.id ?? '');
  const [payPeriodId, setPayPeriodId] = useState('');

  const runs = [...db.payrollRuns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const history = payrollHistory(db, 10);
  const active = runs.filter((r) => !['paid', 'cancelled'].includes(r.status));

  const availablePeriods = db.payPeriods
    .filter((p) => p.payGroupId === payGroupId && p.start <= today)
    .filter((p) => !db.payrollRuns.some((r) => r.payPeriodId === p.id && r.type === 'regular'))
    .sort((a, b) => b.start.localeCompare(a.start));

  const columns: Column<PayrollRun>[] = [
    {
      key: 'run', header: 'Run', sortValue: (r) => r.runNumber,
      render: (r) => {
        const period = lookups.payPeriod.get(r.payPeriodId);
        return (
          <span>
            <span className="block text-sm font-medium">{r.runNumber}</span>
            <span className="block text-xs text-muted">
              {period ? `${fmtDateShort(period.start)} – ${fmtDateShort(period.end)}` : '—'} · {lookups.payGroup.get(r.payGroupId)?.name}
            </span>
          </span>
        );
      },
    },
    { key: 'check', header: 'Check date', hideBelow: 'sm', sortValue: (r) => lookups.payPeriod.get(r.payPeriodId)?.checkDate ?? '', render: (r) => <span className="text-sm">{fmtDate(lookups.payPeriod.get(r.payPeriodId)?.checkDate ?? '')}</span> },
    { key: 'employees', header: 'Employees', align: 'right', hideBelow: 'md', sortValue: (r) => r.employeeCount, render: (r) => num(r.employeeCount) },
    { key: 'hours', header: 'Hours', align: 'right', hideBelow: 'lg', sortValue: (r) => r.totals.hours, render: (r) => num(r.totals.hours, 1) },
    { key: 'gross', header: 'Gross', align: 'right', sortValue: (r) => r.totals.grossPay, render: (r) => currency(r.totals.grossPay, { cents: false }) },
    { key: 'net', header: 'Net', align: 'right', hideBelow: 'md', sortValue: (r) => r.totals.netPay, render: (r) => currency(r.totals.netPay, { cents: false }) },
    { key: 'cost', header: 'Employer cost', align: 'right', hideBelow: 'lg', sortValue: (r) => r.totals.totalCost, render: (r) => currency(r.totals.totalCost, { cents: false }) },
    {
      key: 'issues', header: 'Validation', align: 'center', hideBelow: 'md',
      render: (r) => {
        const counts = issueCounts(db.payrollIssues.filter((i) => i.payrollRunId === r.id));
        if (!counts.total) return <Badge tone="neutral">—</Badge>;
        return counts.error ? <Badge tone="danger">{counts.error} errors</Badge>
          : counts.warning ? <Badge tone="warning">{counts.warning} warnings</Badge>
          : <Badge tone="success">Ready</Badge>;
      },
    },
    { key: 'status', header: 'Status', align: 'center', sortValue: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
    { key: 'go', header: '', align: 'right', render: (r) => <Button size="xs" iconRight={ArrowRight} onClick={() => navigate(`/payroll/runs/${r.id}`)}>Open</Button> },
  ];

  return (
    <div className="space-y-5">
      {active.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {active.map((r) => {
            const counts = issueCounts(db.payrollIssues.filter((i) => i.payrollRunId === r.id));
            const period = lookups.payPeriod.get(r.payPeriodId);
            return (
              <Card key={r.id}>
                <CardHeader
                  title={`Run ${r.runNumber}`}
                  subtitle={period ? `${fmtDate(period.start)} – ${fmtDate(period.end)} · check ${fmtDate(period.checkDate)}` : ''}
                  icon={Banknote}
                  actions={<StatusBadge status={r.status} />}
                />
                <div className="grid grid-cols-3 gap-3">
                  <div><p className="text-xs text-faint">Gross</p><p className="tnum text-lg font-semibold">{currency(r.totals.grossPay, { cents: false })}</p></div>
                  <div><p className="text-xs text-faint">Net</p><p className="tnum text-lg font-semibold">{currency(r.totals.netPay, { cents: false })}</p></div>
                  <div><p className="text-xs text-faint">Employees</p><p className="tnum text-lg font-semibold">{num(r.employeeCount)}</p></div>
                </div>
                {counts.total ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {counts.error ? <Badge tone="danger">{counts.error} errors</Badge> : null}
                    {counts.warning ? <Badge tone="warning">{counts.warning} warnings</Badge> : null}
                    {counts.review ? <Badge tone="info">{counts.review} to review</Badge> : null}
                    {counts.resolved ? <Badge tone="success">{counts.resolved} resolved</Badge> : null}
                  </div>
                ) : null}
                <Button className="mt-4" variant="primary" block iconRight={ArrowRight} onClick={() => navigate(`/payroll/runs/${r.id}`)}>
                  Continue this run
                </Button>
              </Card>
            );
          })}
        </div>
      ) : null}

      {history.length > 2 ? (
        <Card>
          <CardHeader title="Payroll cost by month" subtitle="Gross pay and fully-loaded employer cost" icon={Banknote} />
          <BarChart
            categories={history.map((h) => h.month.slice(5) + '/' + h.month.slice(2, 4))}
            series={[
              { key: 'gross', label: 'Gross pay', values: history.map((h) => h.gross) },
              { key: 'cost', label: 'Employer cost', values: history.map((h) => h.cost) },
            ]}
            format={(n) => currency(n, { compact: true, cents: false })}
            height={220}
          />
        </Card>
      ) : null}

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <div>
            <h3 className="text-sm font-semibold">Payroll runs</h3>
            <p className="text-xs text-muted">Every run keeps a full audit trail from creation through funding.</p>
          </div>
          {can('payroll.process') ? (
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New payroll run</Button>
          ) : null}
        </div>
        <DataTable rows={runs} columns={columns} getRowId={(r) => r.id} pageSize={12}
          onRowClick={(r) => navigate(`/payroll/runs/${r.id}`)}
          empty={<EmptyState icon={Banknote} title="No payroll runs yet" />} />
      </Card>

      <Modal
        open={creating} onClose={() => setCreating(false)} title="Start a payroll run" icon={Banknote}
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" disabled={!payPeriodId}
              onClick={() => { const id = createRun(payGroupId, payPeriodId); setCreating(false); navigate(`/payroll/runs/${id}`); }}>
              Create run
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Pay group" required>
            <Select value={payGroupId} onChange={(e) => { setPayGroupId(e.target.value); setPayPeriodId(''); }}>
              {db.payGroups.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Pay period" required hint="Only periods without an existing regular run are listed.">
            <Select value={payPeriodId} onChange={(e) => setPayPeriodId(e.target.value)}>
              <option value="">Select a period…</option>
              {availablePeriods.map((p) => (
                <option key={p.id} value={p.id}>{fmtDate(p.start)} – {fmtDate(p.end)} · check {fmtDate(p.checkDate)}</option>
              ))}
            </Select>
          </Field>
          <Alert tone="info" title="What happens next">
            Meridian gathers approved time, active compensation, benefit deductions, garnishments and tax
            elections, calculates gross-to-net for every employee, then runs validation before anything can be approved.
          </Alert>
        </div>
      </Modal>
    </div>
  );
};

/* ------------------------------------------------------------ register */

const PayRegister = () => {
  const { db } = useApp();
  const lookups = useLookups();
  const [runId, setRunId] = useState(() => db.payrollRuns.find((r) => db.paychecks.some((c) => c.payrollRunId === r.id))?.id ?? '');
  const [open, setOpen] = useState<Paycheck | null>(null);

  const checks = db.paychecks.filter((c) => c.payrollRunId === runId);
  const run = db.payrollRuns.find((r) => r.id === runId);
  const runsWithChecks = db.payrollRuns.filter((r) => db.paychecks.some((c) => c.payrollRunId === r.id));

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
              <span className="block truncate text-xs text-muted">{e.employeeNumber}</span>
            </span>
          </span>
        ) : '—';
      },
    },
    { key: 'dept', header: 'Department', hideBelow: 'lg', sortValue: (c) => lookups.department.get(lookups.employee.get(c.employeeId)?.departmentId ?? '')?.name ?? '', render: (c) => <span className="text-sm">{lookups.department.get(lookups.employee.get(c.employeeId)?.departmentId ?? '')?.name}</span> },
    { key: 'hours', header: 'Hours', align: 'right', sortValue: (c) => c.totalHours, render: (c) => num(c.totalHours, 2) },
    { key: 'gross', header: 'Gross', align: 'right', sortValue: (c) => c.grossPay, render: (c) => currency(c.grossPay) },
    { key: 'taxes', header: 'Taxes', align: 'right', hideBelow: 'md', sortValue: (c) => c.taxes.reduce((s, t) => s + t.amount, 0), render: (c) => currency(c.taxes.reduce((s, t) => s + t.amount, 0)) },
    { key: 'deductions', header: 'Deductions', align: 'right', hideBelow: 'md', sortValue: (c) => c.deductions.reduce((s, d) => s + d.amount, 0), render: (c) => currency(c.deductions.reduce((s, d) => s + d.amount, 0)) },
    { key: 'net', header: 'Net', align: 'right', sortValue: (c) => c.netPay, render: (c) => <span className="font-semibold">{currency(c.netPay)}</span> },
    { key: 'method', header: 'Method', align: 'center', hideBelow: 'lg', render: (c) => <Badge tone="neutral">{c.method.replace(/_/g, ' ')}</Badge> },
    { key: 'go', header: '', align: 'right', render: (c) => <Button size="xs" onClick={() => setOpen(c)}>Stub</Button> },
  ];

  const exportRegister = () => {
    downloadText(`pay-register-${run?.runNumber ?? 'run'}.csv`, toCsv(checks.map((c) => {
      const e = lookups.employee.get(c.employeeId);
      return {
        employee_number: e?.employeeNumber ?? '',
        name: e ? `${e.firstName} ${e.lastName}` : '',
        department: lookups.department.get(e?.departmentId ?? '')?.name ?? '',
        check_number: c.checkNumber,
        check_date: c.checkDate,
        hours: c.totalHours,
        gross: c.grossPay,
        taxes: c.taxes.reduce((s, t) => s + t.amount, 0),
        deductions: c.deductions.reduce((s, d) => s + d.amount, 0),
        net: c.netPay,
        method: c.method,
      };
    })));
  };

  return (
    <div className="space-y-4">
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Select value={runId} onChange={(e) => setRunId(e.target.value)} className="w-auto min-w-[16rem]">
            {runsWithChecks.map((r) => {
              const p = lookups.payPeriod.get(r.payPeriodId);
              return <option key={r.id} value={r.id}>{r.runNumber} · check {p ? fmtDate(p.checkDate) : ''}</option>;
            })}
          </Select>
          <div className="flex-1" />
          <Button icon={Download} onClick={exportRegister}>Export register</Button>
        </div>

        {run ? (
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
            {[
              ['Gross', run.totals.grossPay], ['Employee taxes', run.totals.employeeTaxes],
              ['Deductions', run.totals.preTaxDeductions + run.totals.postTaxDeductions],
              ['Net', run.totals.netPay], ['Employer cost', run.totals.totalCost],
            ].map(([label, v]) => (
              <div key={label as string} className="bg-surface p-4">
                <p className="text-xs text-faint">{label}</p>
                <p className="tnum mt-0.5 text-base font-semibold">{currency(v as number, { cents: false })}</p>
              </div>
            ))}
          </div>
        ) : null}

        <DataTable rows={checks} columns={columns} getRowId={(c) => c.id} pageSize={15}
          empty={<EmptyState icon={FileText} title="No checks in this run" />} />
      </Card>

      <PaystubModal check={open} onClose={() => setOpen(null)} />
    </div>
  );
};

/* ---------------------------------------------------------- exceptions */

const ExceptionsTab = () => {
  const { db } = useApp();
  const { resolveIssue } = usePayrollActions();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [level, setLevel] = useState('all');
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const issues = db.payrollIssues
    .filter((i) => (level === 'all' ? true : level === 'resolved' ? i.resolved : i.level === level && !i.resolved))
    .sort((a, b) => Number(b.level === 'error') - Number(a.level === 'error'));
  const counts = issueCounts(db.payrollIssues);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Errors" value={num(counts.error)} tone="danger" icon={AlertTriangle} hint="Block finalization" onClick={() => setLevel('error')} />
        <StatTile label="Warnings" value={num(counts.warning)} tone="warning" icon={AlertTriangle} onClick={() => setLevel('warning')} />
        <StatTile label="Review required" value={num(counts.review)} tone="info" icon={AlertTriangle} onClick={() => setLevel('review')} />
        <StatTile label="Resolved" value={num(counts.resolved)} tone="success" icon={CheckCircle2} onClick={() => setLevel('resolved')} />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <h3 className="flex-1 text-sm font-semibold">Payroll validation findings</h3>
          <Select value={level} onChange={(e) => setLevel(e.target.value)} className="w-auto">
            <option value="all">All findings</option>
            <option value="error">Errors only</option>
            <option value="warning">Warnings only</option>
            <option value="review">Review required</option>
            <option value="resolved">Resolved</option>
          </Select>
        </div>
        {issues.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nothing to resolve" body="Validation findings appear here after a payroll run is calculated." />
        ) : (
          <ul className="divide-y divide-line">
            {issues.slice(0, 60).map((i) => {
              const emp = i.employeeId ? lookups.employee.get(i.employeeId) : null;
              return (
                <li key={i.id} className={cx('px-4 py-3.5 sm:px-5', i.resolved && 'opacity-60')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={i.level === 'error' ? 'danger' : i.level === 'warning' ? 'warning' : i.level === 'review' ? 'info' : 'success'}>
                          {i.level === 'review' ? 'Review required' : i.level}
                        </Badge>
                        <span className="text-2xs font-mono text-faint">{i.code}</span>
                        <p className="text-sm font-medium">{i.title}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted">{i.detail}</p>
                      <p className="mt-1 text-xs text-brand-700">→ {i.suggestedAction}</p>
                      {i.resolved ? <p className="mt-1 text-2xs text-faint">Resolved: {i.resolutionNote}</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {emp ? (
                        <Button size="xs" variant="ghost" onClick={() => navigate(`/people/${emp.id}`)}>
                          <Avatar first={emp.firstName} last={emp.lastName} seed={emp.avatarSeed} size={20} />
                          <span className="ml-1.5">{emp.lastName}</span>
                        </Button>
                      ) : null}
                      {!i.resolved ? <Button size="xs" variant="primary" onClick={() => setResolving(i.id)}>Resolve</Button> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(resolving)} onClose={() => setResolving(null)} title="Resolve payroll exception" icon={CheckCircle2}
        footer={
          <>
            <Button onClick={() => setResolving(null)}>Cancel</Button>
            <Button variant="primary" disabled={!note} onClick={() => { if (resolving) resolveIssue(resolving, note); setResolving(null); setNote(''); }}>
              Mark resolved
            </Button>
          </>
        }
      >
        <Field label="Resolution note" required hint="Recorded in the payroll audit trail alongside your name and timestamp.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Confirmed with the manager — hours are correct." />
        </Field>
      </Modal>
    </div>
  );
};

/* ---------------------------------------------------------------- tax */

const TaxTab = () => {
  const { db } = useApp();
  const lookups = useLookups();
  const year = db.meta.today.slice(0, 4);
  const checks = db.paychecks.filter((c) => c.checkDate.startsWith(year));

  const byTax = useMemo(() => {
    const map = new Map<string, { label: string; employee: number; employer: number }>();
    for (const c of checks) {
      for (const t of c.taxes) {
        const cur = map.get(t.code) ?? { label: t.label, employee: 0, employer: 0 };
        cur.employee += t.amount;
        cur.employer += t.employerAmount;
        map.set(t.code, cur);
      }
    }
    return [...map.entries()].map(([code, v]) => ({ code, ...v })).sort((a, b) => (b.employee + b.employer) - (a.employee + a.employer));
  }, [checks]);

  const byDeduction = useMemo(() => {
    const map = new Map<string, { label: string; employee: number; employer: number; count: number }>();
    for (const c of checks) {
      for (const d of c.deductions) {
        const cur = map.get(d.code) ?? { label: d.label, employee: 0, employer: 0, count: 0 };
        cur.employee += d.amount;
        cur.employer += d.employerAmount;
        cur.count += 1;
        map.set(d.code, cur);
      }
    }
    return [...map.entries()].map(([code, v]) => ({ code, ...v })).sort((a, b) => b.employee - a.employee);
  }, [checks]);

  const incompleteTax = db.taxProfiles.filter((t) => !t.complete);
  const garnishments = db.garnishments.filter((g) => g.active);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card padded={false}>
          <div className="p-4 sm:p-5"><CardHeader title={`${year} tax liability`} dense icon={Scale} subtitle="Withheld from employees and owed by the employer" /></div>
          <div className="scroll-x">
            <table className="dt">
              <thead><tr><th>Tax</th><th className="text-right">Employee</th><th className="text-right">Employer</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {byTax.map((t) => (
                  <tr key={t.code}>
                    <td><span className="text-sm">{t.label}</span><span className="ml-2 text-2xs font-mono text-faint">{t.code}</span></td>
                    <td className="text-right tnum text-sm">{currency(t.employee, { cents: false })}</td>
                    <td className="text-right tnum text-sm">{currency(t.employer, { cents: false })}</td>
                    <td className="text-right tnum text-sm font-medium">{currency(t.employee + t.employer, { cents: false })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card padded={false}>
          <div className="p-4 sm:p-5"><CardHeader title={`${year} deductions`} dense icon={Receipt} subtitle="Benefit, retirement and garnishment withholding" /></div>
          <div className="scroll-x">
            <table className="dt">
              <thead><tr><th>Deduction</th><th className="text-right">Checks</th><th className="text-right">Employee</th><th className="text-right">Employer</th></tr></thead>
              <tbody>
                {byDeduction.map((d) => (
                  <tr key={d.code}>
                    <td className="text-sm">{d.label}</td>
                    <td className="text-right tnum text-sm">{num(d.count)}</td>
                    <td className="text-right tnum text-sm">{currency(d.employee, { cents: false })}</td>
                    <td className="text-right tnum text-sm">{currency(d.employer, { cents: false })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Incomplete tax setup" icon={AlertTriangle}
            subtitle={`${incompleteTax.length} employee(s) without a completed W-4`} />
          {incompleteTax.length === 0 ? (
            <EmptyState compact icon={CheckCircle2} title="Every employee has a completed W-4" />
          ) : (
            <ul className="divide-y divide-line">
              {incompleteTax.slice(0, 8).map((t) => {
                const e = lookups.employee.get(t.employeeId);
                return e ? (
                  <li key={t.employeeId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="flex items-center gap-2.5">
                      <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={26} />
                      <span className="text-sm">{e.preferredName} {e.lastName}</span>
                    </span>
                    <Badge tone="danger">Defaults to single / zero</Badge>
                  </li>
                ) : null;
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Active garnishments" icon={Scale} subtitle="Court and agency orders applied at calculation time" />
          {garnishments.length === 0 ? <EmptyState compact title="No active garnishments" /> : (
            <ul className="divide-y divide-line">
              {garnishments.map((g) => {
                const e = lookups.employee.get(g.employeeId);
                return (
                  <li key={g.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{e?.preferredName} {e?.lastName}</p>
                      <Badge tone="neutral" className="capitalize">{g.type.replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{g.agency} · {g.caseNumber}</p>
                    <p className="text-2xs text-faint">
                      {g.amountType === 'fixed' ? `${currency(g.amount)} per check` : `${g.amount}% of disposable earnings`} · capped at {g.maxPercent}%
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

/* ----------------------------------------------------- general ledger */

const GeneralLedger = () => {
  const { db, can } = useApp();
  const lookups = useLookups();
  const [runId, setRunId] = useState(() => db.payrollRuns.find((r) => db.paychecks.some((c) => c.payrollRunId === r.id))?.id ?? '');
  const run = db.payrollRuns.find((r) => r.id === runId);
  const checks = db.paychecks.filter((c) => c.payrollRunId === runId);

  const lines = useMemo(() => {
    if (!run) return [];
    const byDept = new Map<string, { wages: number; taxes: number; benefits: number }>();
    for (const c of checks) {
      const emp = lookups.employee.get(c.employeeId);
      if (!emp) continue;
      const cur = byDept.get(emp.departmentId) ?? { wages: 0, taxes: 0, benefits: 0 };
      cur.wages += c.grossPay;
      cur.taxes += c.taxes.reduce((s, t) => s + t.employerAmount, 0);
      cur.benefits += c.deductions.reduce((s, d) => s + d.employerAmount, 0);
      byDept.set(emp.departmentId, cur);
    }
    const out: { account: string; costCenter: string; description: string; debit: number; credit: number }[] = [];
    for (const [deptId, v] of byDept) {
      const d = lookups.department.get(deptId);
      if (!d) continue;
      out.push({ account: d.glAccount, costCenter: d.costCenter, description: `${d.name} — salaries and wages`, debit: v.wages, credit: 0 });
      out.push({ account: '6900-TAX', costCenter: d.costCenter, description: `${d.name} — employer payroll taxes`, debit: v.taxes, credit: 0 });
      out.push({ account: '6910-BEN', costCenter: d.costCenter, description: `${d.name} — employer benefit contributions`, debit: v.benefits, credit: 0 });
    }
    const totalTaxWithheld = checks.reduce((s, c) => s + c.taxes.reduce((t, x) => t + x.amount, 0), 0);
    const totalDeductions = checks.reduce((s, c) => s + c.deductions.reduce((t, x) => t + x.amount, 0), 0);
    out.push({ account: '2100-NET', costCenter: '—', description: 'Net payroll payable (ACH)', debit: 0, credit: run.totals.netPay });
    out.push({ account: '2110-TXW', costCenter: '—', description: 'Payroll taxes withheld — payable', debit: 0, credit: totalTaxWithheld });
    out.push({ account: '2120-DED', costCenter: '—', description: 'Employee deductions — payable', debit: 0, credit: totalDeductions });
    out.push({ account: '2130-ERT', costCenter: '—', description: 'Employer taxes — payable', debit: 0, credit: run.totals.employerTaxes });
    out.push({ account: '2140-ERB', costCenter: '—', description: 'Employer benefits — payable', debit: 0, credit: run.totals.employerBenefits });
    return out;
  }, [run, checks, lookups]);

  const debits = lines.reduce((s, l) => s + l.debit, 0);
  const credits = lines.reduce((s, l) => s + l.credit, 0);
  const balanced = Math.abs(debits - credits) < 1;

  return (
    <div className="space-y-4">
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Select value={runId} onChange={(e) => setRunId(e.target.value)} className="w-auto min-w-[16rem]">
            {db.payrollRuns.filter((r) => db.paychecks.some((c) => c.payrollRunId === r.id)).map((r) => (
              <option key={r.id} value={r.id}>{r.runNumber}</option>
            ))}
          </Select>
          <div className="flex-1" />
          <Badge tone={balanced ? 'success' : 'danger'}>{balanced ? 'Balanced' : 'Out of balance'}</Badge>
          {can('payroll.gl.export') ? (
            <Button icon={Download} onClick={() => downloadText(`gl-export-${run?.runNumber ?? 'run'}.csv`, toCsv(lines))}>
              Export journal
            </Button>
          ) : null}
        </div>

        <div className="scroll-x">
          <table className="dt">
            <thead><tr><th>Account</th><th>Cost center</th><th>Description</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="font-mono text-xs">{l.account}</td>
                  <td className="font-mono text-xs text-muted">{l.costCenter}</td>
                  <td className="text-sm">{l.description}</td>
                  <td className="text-right tnum text-sm">{l.debit ? currency(l.debit) : '—'}</td>
                  <td className="text-right tnum text-sm">{l.credit ? currency(l.credit) : '—'}</td>
                </tr>
              ))}
              <tr className="bg-sunken font-medium">
                <td colSpan={3} className="text-sm">Totals</td>
                <td className="text-right tnum text-sm">{currency(debits)}</td>
                <td className="text-right tnum text-sm">{currency(credits)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Alert tone="info" icon={Landmark} title="Posting to the general ledger">
        Journal entries are grouped by cost center and posted to Ledgerline Accounting on payroll close.
        Wage, employer tax and employer benefit expense are debited; net pay and withholding liabilities are credited.
      </Alert>
    </div>
  );
};
