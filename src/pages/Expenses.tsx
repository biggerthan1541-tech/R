import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Check, CheckCircle2, Download, Landmark, Paperclip, Plus, Receipt,
  Trash2, X,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Column, DataTable, EmptyState, Field,
  Input, KeyValue, Modal, PermissionDenied, SectionHeader, Select, StageStepper, StatTile,
  StatusBadge, Tabs, Textarea, Timeline, cx,
} from '@/components/ui';
import { BarChart, DonutChart } from '@/components/charts';
import { useApp, useLookups } from '@/lib/store';
import { useAdminActions } from '@/lib/actions';
import { currency, downloadText, num, toCsv } from '@/lib/format';
import { fmtDate, fmtDateShort, timeAgo } from '@/lib/dates';
import type { ExpenseCategory, ExpenseReport } from '@/lib/types';

const CATEGORIES: ExpenseCategory[] = [
  'travel', 'meals', 'lodging', 'supplies', 'software', 'training', 'mileage', 'client_entertainment', 'other',
];

const STAGES = [
  { id: 'draft', label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'manager_approved', label: 'Manager approved' },
  { id: 'finance_review', label: 'Finance review' },
  { id: 'approved', label: 'Approved' },
  { id: 'reimbursed', label: 'Reimbursed' },
];

export const ExpensesPage = () => {
  const { db, can, employee } = useApp();
  const { reportId } = useParams();
  const [params, setParams] = useSearchParams();
  const [composing, setComposing] = useState(params.get('compose') === '1');
  const [detail, setDetail] = useState<string | null>(reportId ?? null);
  const tab = params.get('tab') ?? 'mine';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    next.delete('compose');
    setParams(next, { replace: true });
  };

  if (!can('expense.submit', 'expense.view.all', 'expense.approve.team')) {
    return <PermissionDenied what="expenses" />;
  }

  const teamQueue = db.expenseReports.filter((r) => r.status === 'submitted' && r.managerId === employee?.id);
  const financeQueue = db.expenseReports.filter((r) => ['manager_approved', 'finance_review'].includes(r.status));

  const tabs = [
    { id: 'mine', label: 'My expenses', icon: Receipt },
    ...(can('expense.approve.team') ? [{ id: 'approvals', label: 'Team approvals', count: teamQueue.length, icon: Check }] : []),
    ...(can('expense.approve.finance', 'expense.view.all') ? [{ id: 'finance', label: 'Finance review', count: financeQueue.length, icon: Landmark }] : []),
    ...(can('expense.view.all') ? [{ id: 'analytics', label: 'Spend analysis', icon: Receipt }] : []),
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Expenses"
        subtitle="Submit, approve and reimburse. Approved reimbursements are added to the next payroll run as non-taxable earnings."
        actions={can('expense.submit') ? <Button variant="primary" icon={Plus} onClick={() => setComposing(true)}>New expense report</Button> : null}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'mine' ? <MyExpenses onOpen={setDetail} /> : null}
      {tab === 'approvals' ? <ApprovalQueue rows={teamQueue} onOpen={setDetail} stage="manager" /> : null}
      {tab === 'finance' ? <ApprovalQueue rows={financeQueue} onOpen={setDetail} stage="finance" /> : null}
      {tab === 'analytics' ? <SpendAnalysis /> : null}

      <ComposeModal open={composing} onClose={() => setComposing(false)} />
      <ReportDrawer reportId={detail} onClose={() => setDetail(null)} />
    </div>
  );
};

/* ----------------------------------------------------------- my view */

const MyExpenses = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const { db, employee, today } = useApp();
  if (!employee) return null;

  const reports = db.expenseReports.filter((r) => r.employeeId === employee.id).sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));
  const year = today.slice(0, 4);
  const ytd = reports.filter((r) => (r.submittedAt ?? '').startsWith(year));
  const reimbursed = ytd.filter((r) => r.status === 'reimbursed').reduce((s, r) => s + r.total, 0);
  const pending = reports.filter((r) => !['reimbursed', 'rejected', 'draft'].includes(r.status)).reduce((s, r) => s + r.total, 0);

  const columns: Column<ExpenseReport>[] = [
    { key: 'title', header: 'Report', sortValue: (r) => r.title, render: (r) => (
      <span>
        <span className="block text-sm font-medium">{r.title}</span>
        <span className="block text-xs text-muted">{db.expenses.filter((e) => e.reportId === r.id).length} line items</span>
      </span>
    ) },
    { key: 'submitted', header: 'Submitted', hideBelow: 'sm', sortValue: (r) => r.submittedAt ?? '', render: (r) => <span className="text-sm">{r.submittedAt ? fmtDate(r.submittedAt.slice(0, 10)) : 'Not submitted'}</span> },
    { key: 'total', header: 'Total', align: 'right', sortValue: (r) => r.total, render: (r) => currency(r.total) },
    { key: 'flags', header: 'Policy', align: 'center', hideBelow: 'md', render: (r) => {
      const flags = db.expenses.filter((e) => e.reportId === r.id).flatMap((e) => e.policyFlags);
      return flags.length ? <Badge tone="warning">{flags.length}</Badge> : <Badge tone="success">Clean</Badge>;
    } },
    { key: 'status', header: 'Status', align: 'center', sortValue: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
    { key: 'go', header: '', align: 'right', render: (r) => <Button size="xs" onClick={() => onOpen(r.id)}>Open</Button> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label={`${year} reimbursed`} value={currency(reimbursed, { cents: false })} icon={CheckCircle2} tone="success" />
        <StatTile label="In flight" value={currency(pending, { cents: false })} icon={Receipt} tone="warning" hint={`${reports.filter((r) => !['reimbursed', 'rejected', 'draft'].includes(r.status)).length} report(s)`} />
        <StatTile label="Drafts" value={num(reports.filter((r) => r.status === 'draft').length)} icon={Paperclip} />
      </div>

      <Card padded={false}>
        <DataTable rows={reports} columns={columns} getRowId={(r) => r.id} pageSize={12}
          onRowClick={(r) => onOpen(r.id)}
          empty={<EmptyState icon={Receipt} title="No expense reports yet" body="Create a report, attach receipts and submit it for approval." />} />
      </Card>
    </div>
  );
};

/* --------------------------------------------------------- approvals */

const ApprovalQueue = ({
  rows, onOpen, stage,
}: { rows: ExpenseReport[]; onOpen: (id: string) => void; stage: 'manager' | 'finance' }) => {
  const { db } = useApp();
  const { decideExpenseReport } = useAdminActions();
  const lookups = useLookups();

  const columns: Column<ExpenseReport>[] = [
    {
      key: 'employee', header: 'Employee', sortValue: (r) => lookups.employee.get(r.employeeId)?.lastName ?? '',
      render: (r) => {
        const e = lookups.employee.get(r.employeeId);
        return e ? (
          <span className="flex items-center gap-2.5">
            <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={26} />
            <span className="min-w-0">
              <span className="block truncate text-sm">{e.preferredName} {e.lastName}</span>
              <span className="block truncate text-xs text-muted">{lookups.department.get(e.departmentId)?.name}</span>
            </span>
          </span>
        ) : '—';
      },
    },
    { key: 'title', header: 'Report', sortValue: (r) => r.title, render: (r) => <span className="text-sm">{r.title}</span> },
    { key: 'submitted', header: 'Submitted', hideBelow: 'md', sortValue: (r) => r.submittedAt ?? '', render: (r) => <span className="text-sm">{r.submittedAt ? timeAgo(r.submittedAt) : '—'}</span> },
    { key: 'total', header: 'Total', align: 'right', sortValue: (r) => r.total, render: (r) => <span className={cx(r.total > 2500 && 'font-semibold text-warning-700')}>{currency(r.total)}</span> },
    {
      key: 'flags', header: 'Policy', align: 'center', hideBelow: 'md',
      render: (r) => {
        const flags = db.expenses.filter((e) => e.reportId === r.id).flatMap((e) => e.policyFlags);
        return flags.length ? <Badge tone="warning">{flags.length} flag{flags.length === 1 ? '' : 's'}</Badge> : <Badge tone="success">Clean</Badge>;
      },
    },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => (
        <span className="flex justify-end gap-1.5">
          <Button size="xs" onClick={() => onOpen(r.id)}>Review</Button>
          <Button size="xs" variant="ghost" icon={X} aria-label="Reject"
            onClick={() => decideExpenseReport(r.id, 'rejected', 'Returned for missing documentation.')} />
          <Button size="xs" variant="primary" icon={Check} aria-label="Approve"
            onClick={() => decideExpenseReport(r.id, stage === 'manager' ? 'manager_approved' : 'approved')} />
        </span>
      ),
    },
  ];

  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5">
        <CardHeader
          dense
          title={stage === 'manager' ? 'Team expense reports' : 'Finance review queue'}
          subtitle={stage === 'manager'
            ? 'Approve to route to Finance for reimbursement.'
            : 'Reports above $2,500 require a secondary Finance approval before reimbursement.'}
          icon={stage === 'manager' ? Check : Landmark}
        />
      </div>
      <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} pageSize={12}
        empty={<EmptyState icon={CheckCircle2} title="Queue is clear" body="Reports needing your decision appear here." />} />
    </Card>
  );
};

/* ------------------------------------------------------ report drawer */

const ReportDrawer = ({ reportId, onClose }: { reportId: string | null; onClose: () => void }) => {
  const { db, can, employee } = useApp();
  const { decideExpenseReport } = useAdminActions();
  const lookups = useLookups();
  const [note, setNote] = useState('');

  const report = reportId ? db.expenseReports.find((r) => r.id === reportId) : null;
  if (!report) return null;
  const lines = db.expenses.filter((e) => e.reportId === report.id);
  const emp = lookups.employee.get(report.employeeId);
  const isManager = report.managerId === employee?.id && report.status === 'submitted';
  const isFinance = can('expense.approve.finance') && ['manager_approved', 'finance_review'].includes(report.status);
  const flags = lines.flatMap((l) => l.policyFlags);

  return (
    <Modal
      open onClose={onClose} size="lg" icon={Receipt}
      title={report.title}
      subtitle={emp ? `${emp.firstName} ${emp.lastName} · ${currency(report.total)}` : ''}
      footer={
        isManager || isFinance ? (
          <>
            <Button variant="danger" onClick={() => { decideExpenseReport(report.id, 'rejected', note || 'Returned for correction.'); onClose(); }}>
              Return
            </Button>
            <div className="flex-1" />
            <Button variant="primary" icon={Check}
              onClick={() => { decideExpenseReport(report.id, isManager ? 'manager_approved' : 'approved', note); onClose(); }}>
              {isManager ? 'Approve and send to Finance' : 'Approve for reimbursement'}
            </Button>
          </>
        ) : report.status === 'approved' && can('expense.approve.finance') ? (
          <Button variant="primary" onClick={() => { decideExpenseReport(report.id, 'reimbursed'); onClose(); }}>
            Mark reimbursed on next payroll
          </Button>
        ) : <Button onClick={onClose}>Close</Button>
      }
    >
      <div className="space-y-5">
        <StageStepper stages={STAGES} current={report.status === 'rejected' ? 'submitted' : report.status} />

        <KeyValue columns={3} items={[
          { label: 'Purpose', value: report.purpose },
          { label: 'Submitted', value: report.submittedAt ? fmtDate(report.submittedAt.slice(0, 10)) : 'Not submitted' },
          { label: 'Status', value: <StatusBadge status={report.status} /> },
        ]} />

        {flags.length ? (
          <Alert tone="warning" icon={AlertTriangle} title={`${flags.length} policy flag(s)`}>
            <ul className="list-disc pl-4">{[...new Set(flags)].map((f) => <li key={f}>{f}</li>)}</ul>
          </Alert>
        ) : (
          <Alert tone="success" icon={CheckCircle2} title="No policy exceptions">Every line item is within policy.</Alert>
        )}

        <div className="scroll-x rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-sunken">
              <tr>
                {['Date', 'Category', 'Merchant', 'Project', 'Receipt', 'Amount'].map((h, i) => (
                  <th key={h} className={cx('px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-faint', i === 5 ? 'text-right' : 'text-left')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-3 py-2">{fmtDateShort(l.date)}</td>
                  <td className="px-3 py-2 capitalize">{l.category.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2">
                    {l.merchant}
                    {l.policyFlags.length ? <Badge tone="warning" className="ml-2">{l.policyFlags[0]}</Badge> : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">{l.projectCode}</td>
                  <td className="px-3 py-2">
                    {l.receiptFileName ? (
                      <span className="flex items-center gap-1 text-xs text-teal-700"><Paperclip className="h-3 w-3" />Attached</span>
                    ) : <span className="text-xs text-danger-600">Missing</span>}
                  </td>
                  <td className="px-3 py-2 text-right tnum">{currency(l.amount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line-strong bg-sunken/60 font-semibold">
                <td className="px-3 py-2.5" colSpan={5}>Total</td>
                <td className="px-3 py-2.5 text-right tnum">{currency(report.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Timeline items={[
          { id: 'sub', title: 'Submitted by employee', meta: report.submittedAt ? fmtDate(report.submittedAt.slice(0, 10)) : '—', tone: 'brand' },
          ...(report.managerDecisionAt ? [{ id: 'mgr', title: 'Manager decision', meta: fmtDate(report.managerDecisionAt.slice(0, 10)), tone: 'success' as const }] : []),
          ...(report.financeDecisionAt ? [{ id: 'fin', title: 'Finance decision', meta: fmtDate(report.financeDecisionAt.slice(0, 10)), tone: 'success' as const }] : []),
          ...(report.status === 'reimbursed' ? [{ id: 'reim', title: 'Reimbursed through payroll', meta: 'Non-taxable earning line', tone: 'success' as const }] : []),
        ]} />

        {isManager || isFinance ? (
          <Field label="Decision note (optional)">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Approved — client visit was pre-authorized." />
          </Field>
        ) : report.decisionNote ? (
          <Alert tone="neutral" title="Decision note">{report.decisionNote}</Alert>
        ) : null}
      </div>
    </Modal>
  );
};

/* -------------------------------------------------------------- compose */

interface DraftLine {
  date: string;
  category: ExpenseCategory;
  merchant: string;
  amount: number;
  description: string;
  currency: string;
  billable: boolean;
  projectCode: string;
  receiptFileName: string | null;
}

const ComposeModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { today } = useApp();
  const { saveExpenseReport } = useAdminActions();
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { date: today, category: 'meals', merchant: '', amount: 0, description: '', currency: 'USD', billable: false, projectCode: 'OPEX', receiptFileName: null },
  ]);

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const flags = lines.flatMap((l) => {
    const out: string[] = [];
    if (l.category === 'meals' && l.amount > 75) out.push(`${l.merchant || 'Meal'} exceeds the $75 per-diem cap`);
    if (l.amount > 25 && !l.receiptFileName) out.push(`${l.merchant || 'Line item'} is missing a receipt`);
    return out;
  });

  const update = (i: number, patch: Partial<DraftLine>) =>
    setLines(lines.map((l, li) => (li === i ? { ...l, ...patch } : l)));

  const submit = (send: boolean) => {
    saveExpenseReport({
      title: title || 'Expense report',
      purpose,
      submit: send,
      lines: lines.map((l) => ({
        date: l.date, category: l.category, merchant: l.merchant, amount: Number(l.amount) || 0,
        currency: 'USD', description: l.description, receiptFileName: l.receiptFileName,
        billable: l.billable, projectCode: l.projectCode,
      })),
    });
    onClose();
    setTitle(''); setPurpose('');
    setLines([{ date: today, category: 'meals', merchant: '', amount: 0, description: '', currency: 'USD', billable: false, projectCode: 'OPEX', receiptFileName: null }]);
  };

  return (
    <Modal
      open={open} onClose={onClose} size="xl" icon={Receipt}
      title="New expense report"
      subtitle="Attach receipts for anything above $25. Meals are capped at $75 per day."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <div className="flex-1" />
          <div className="mr-3 text-right">
            <p className="text-2xs uppercase tracking-wide text-faint">Total</p>
            <p className="tnum text-sm font-semibold">{currency(total)}</p>
          </div>
          <Button onClick={() => submit(false)}>Save draft</Button>
          <Button variant="primary" disabled={!title || total <= 0} onClick={() => submit(true)}>Submit for approval</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Report title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Columbus site visit" />
          </Field>
          <Field label="Business purpose">
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Customer install support" />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium">Line items</h4>
            <Button size="xs" icon={Plus} onClick={() => setLines([...lines, {
              date: today, category: 'travel', merchant: '', amount: 0, description: '',
              currency: 'USD', billable: false, projectCode: 'OPEX', receiptFileName: null,
            }])}>Add line</Button>
          </div>

          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={i} className="rounded-lg border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Date"><Input type="date" value={l.date} onChange={(e) => update(i, { date: e.target.value })} /></Field>
                  <Field label="Category">
                    <Select value={l.category} onChange={(e) => update(i, { category: e.target.value as ExpenseCategory })}>
                      {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c.replace(/_/g, ' ')}</option>)}
                    </Select>
                  </Field>
                  <Field label="Merchant"><Input value={l.merchant} onChange={(e) => update(i, { merchant: e.target.value })} placeholder="Riverbend Cafe" /></Field>
                  <Field label="Amount (USD)">
                    <Input type="number" min="0" step="0.01" value={l.amount || ''} onChange={(e) => update(i, { amount: Number(e.target.value) })} />
                  </Field>
                  <Field label="Description" className="sm:col-span-2">
                    <Input value={l.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="Dinner with the Columbus install crew" />
                  </Field>
                  <Field label="Project code">
                    <Select value={l.projectCode} onChange={(e) => update(i, { projectCode: e.target.value })}>
                      {['OPEX', 'PRJ-1041', 'PRJ-2288', 'PRJ-3310'].map((p) => <option key={p}>{p}</option>)}
                    </Select>
                  </Field>
                  <Field label="Receipt">
                    <Button size="sm" block variant={l.receiptFileName ? 'subtle' : 'secondary'} icon={Paperclip}
                      onClick={() => update(i, { receiptFileName: l.receiptFileName ? null : `receipt_${Date.now()}.jpg` })}>
                      {l.receiptFileName ? 'Attached' : 'Attach receipt'}
                    </Button>
                  </Field>
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={l.billable} onChange={(e) => update(i, { billable: e.target.checked })} className="h-3.5 w-3.5 accent-[#5B3FD6]" />
                    Billable to customer
                  </label>
                  {lines.length > 1 ? (
                    <Button size="xs" variant="ghost" icon={Trash2} onClick={() => setLines(lines.filter((_, li) => li !== i))}>Remove</Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {flags.length ? (
          <Alert tone="warning" icon={AlertTriangle} title="Policy checks">
            <ul className="list-disc pl-4">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
            You can still submit — flagged items are surfaced to your approver.
          </Alert>
        ) : null}

        {total > 2500 ? (
          <Alert tone="info" title="Secondary approval required">
            Reports above $2,500 route to Finance after your manager approves, per the expense policy automation rule.
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
};

/* --------------------------------------------------------- analytics */

const SpendAnalysis = () => {
  const { db, today } = useApp();
  const lookups = useLookups();
  const year = today.slice(0, 4);
  const expenses = db.expenses.filter((e) => e.date.startsWith(year));

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return [...map.entries()]
      .map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: Math.round(v) }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const key = e.date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-9);
  }, [expenses]);

  const byDept = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const emp = lookups.employee.get(e.employeeId);
      if (!emp) continue;
      map.set(emp.departmentId, (map.get(emp.departmentId) ?? 0) + e.amount);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ label: lookups.department.get(id)?.name ?? id, value: Math.round(v) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [expenses, lookups]);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const flagged = expenses.filter((e) => e.policyFlags.length);
  const reimbursed = db.expenseReports.filter((r) => r.status === 'reimbursed').reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={`${year} spend`} value={currency(total, { cents: false })} icon={Receipt} />
        <StatTile label="Reimbursed" value={currency(reimbursed, { cents: false })} icon={CheckCircle2} tone="success" />
        <StatTile label="Policy exceptions" value={num(flagged.length)} icon={AlertTriangle} tone="warning"
          hint={`${currency(flagged.reduce((s, e) => s + e.amount, 0), { cents: false })} affected`} />
        <StatTile label="Average report" value={currency(db.expenseReports.length ? total / db.expenseReports.length : 0)} icon={Receipt} tone="teal" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Spend by month" icon={Receipt} />
          <BarChart
            categories={byMonth.map(([m]) => m.slice(5) + '/' + m.slice(2, 4))}
            series={[{ key: 'spend', label: 'Spend', values: byMonth.map(([, v]) => Math.round(v)) }]}
            format={(n) => currency(n, { compact: true, cents: false })}
            height={220}
          />
        </Card>
        <Card>
          <CardHeader title="Spend by category" icon={Receipt} />
          <DonutChart data={byCategory.slice(0, 6)} centerLabel={`${year} total`}
            centerValue={currency(total, { compact: true, cents: false })}
            format={(n) => currency(n, { compact: true, cents: false })} />
        </Card>
      </div>

      <Card>
        <CardHeader title="Spend by department" icon={Landmark}
          actions={<Button size="xs" icon={Download} onClick={() => downloadText(`expense-spend-${year}.csv`, toCsv(
            expenses.map((e) => {
              const emp = lookups.employee.get(e.employeeId);
              return {
                date: e.date, employee: emp ? `${emp.firstName} ${emp.lastName}` : '',
                department: lookups.department.get(emp?.departmentId ?? '')?.name ?? '',
                category: e.category, merchant: e.merchant, amount: e.amount,
                project: e.projectCode, status: e.status, flags: e.policyFlags.join('; '),
              };
            }),
          ))}>Export</Button>} />
        <ul className="space-y-2.5">
          {byDept.map((d) => (
            <li key={d.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs">{d.label}</span>
                <span className="tnum text-xs font-medium text-muted">{currency(d.value, { cents: false })}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full" style={{ width: `${(d.value / (byDept[0]?.value || 1)) * 100}%`, background: 'var(--chart-3)' }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};
