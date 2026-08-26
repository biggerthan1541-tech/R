import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Award, Briefcase, Building2, Calendar, ChevronRight, Clock, CreditCard,
  FileText, GraduationCap, HeartPulse, Mail, Pencil, Phone, Plane, Shield,
  Target, TrendingUp, User, Users, Wallet,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input,
  KeyValue, Modal, PermissionDenied, Progress, Select, StatusBadge, Tabs,
  Timeline, cx,
} from '@/components/ui';
import { LineChart } from '@/components/charts';
import { useApp, useLookups } from '@/lib/store';
import { usePeopleActions } from '@/lib/actions';
import { goalsFor, paychecksFor, ptoSummary, trainingFor, upcomingShifts } from '@/lib/selectors';
import { currency, maskAccount, num, phoneFmt } from '@/lib/format';
import { fmtDate, fmtDateShort, fmtTime, tenureLabel, timeAgo } from '@/lib/dates';
import type { EmergencyContact } from '@/lib/types';

export const EmployeeProfilePage = () => {
  const { employeeId } = useParams();
  const { db, can, visibleIds, employee: me, today } = useApp();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);

  const emp = db.employees.find((e) => e.id === employeeId);
  const scope = visibleIds('people');
  if (!emp) return <EmptyState title="Employee not found" body="This record may have been removed." />;
  if (!scope.has(emp.id)) return <PermissionDenied what="this employee record" />;

  const isSelf = me?.id === emp.id;
  const canSeeSensitive = can('people.sensitive.view') || isSelf;
  const canEdit = can('people.edit.all') || (isSelf && can('people.edit.self'));
  const job = lookups.jobTitle.get(emp.jobTitleId);
  const dept = lookups.department.get(emp.departmentId);
  const loc = lookups.location.get(emp.locationId);
  const manager = lookups.employee.get(emp.managerId ?? '');
  const reports = db.employees.filter((e) => e.managerId === emp.id && e.status === 'active');

  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'job', label: 'Job & pay', icon: Briefcase },
    { id: 'time', label: 'Time', icon: Clock },
    { id: 'timeoff', label: 'Time off', icon: Plane },
    ...(canSeeSensitive ? [{ id: 'benefits', label: 'Benefits', icon: HeartPulse }] : []),
    ...(canSeeSensitive ? [{ id: 'pay', label: 'Pay history', icon: Wallet }] : []),
    { id: 'performance', label: 'Performance', icon: Target },
    { id: 'learning', label: 'Training', icon: GraduationCap },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'history', label: 'History', icon: TrendingUp },
  ];

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {/* -------------------------------------------------------- header */}
      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <Avatar first={emp.firstName} last={emp.lastName} seed={emp.avatarSeed} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-[-0.015em]">{emp.firstName} {emp.lastName}</h1>
              <StatusBadge status={emp.status} />
              {emp.remote ? <Badge tone="teal">Remote</Badge> : null}
              {isSelf ? <Badge tone="brand">You</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted">
              {job?.name} · {dept?.name} · {loc?.name}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted">
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-faint" />{emp.email}</span>
              <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-faint" />{phoneFmt(emp.phone)}</span>
              <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-faint" />{emp.employeeNumber}</span>
              <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-faint" />Joined {fmtDate(emp.hireDate)} · {tenureLabel(emp.hireDate, today)}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {canEdit ? <Button icon={Pencil} onClick={() => setEditOpen(true)}>Edit profile</Button> : null}
            {can('people.lifecycle.manage') && !isSelf ? (
              <Button variant="primary" onClick={() => navigate(`/hr?employee=${emp.id}`)}>Personnel action</Button>
            ) : null}
          </div>
        </div>

        {manager || reports.length ? (
          <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-line pt-4">
            {manager ? (
              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-faint">Reports to</p>
                <button onClick={() => navigate(`/people/${manager.id}`)} className="mt-1 flex items-center gap-2 text-sm hover:text-brand-700">
                  <Avatar first={manager.firstName} last={manager.lastName} seed={manager.avatarSeed} size={22} />
                  {manager.preferredName} {manager.lastName}
                </button>
              </div>
            ) : null}
            {reports.length ? (
              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-faint">Direct reports</p>
                <div className="mt-1 flex items-center -space-x-1.5">
                  {reports.slice(0, 8).map((r) => (
                    <button key={r.id} onClick={() => navigate(`/people/${r.id}`)} title={`${r.firstName} ${r.lastName}`}>
                      <Avatar first={r.firstName} last={r.lastName} seed={r.avatarSeed} size={26} ring />
                    </button>
                  ))}
                  {reports.length > 8 ? (
                    <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-sunken text-2xs font-medium text-muted ring-2 ring-surface">
                      +{reports.length - 8}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' ? <OverviewTab emp={emp} canSeeSensitive={canSeeSensitive} /> : null}
      {tab === 'job' ? <JobTab emp={emp} canSeeSensitive={canSeeSensitive} /> : null}
      {tab === 'time' ? <TimeTab emp={emp} /> : null}
      {tab === 'timeoff' ? <TimeOffTab emp={emp} /> : null}
      {tab === 'benefits' ? <BenefitsTab emp={emp} /> : null}
      {tab === 'pay' ? <PayTab emp={emp} /> : null}
      {tab === 'performance' ? <PerformanceTab emp={emp} /> : null}
      {tab === 'learning' ? <LearningTab emp={emp} /> : null}
      {tab === 'documents' ? <DocumentsTab emp={emp} /> : null}
      {tab === 'history' ? <HistoryTab emp={emp} /> : null}

      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} employeeId={emp.id} />
    </div>
  );
};

/* ------------------------------------------------------------- overview */

const OverviewTab = ({ emp, canSeeSensitive }: { emp: import('@/lib/types').Employee; canSeeSensitive: boolean }) => {
  const { db, today } = useApp();
  const lookups = useLookups();
  const pto = ptoSummary(db, emp.id);
  const shifts = upcomingShifts(db, emp.id, today, 7).slice(0, 3);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader title="Personal information" icon={User} />
          <KeyValue items={[
            { label: 'Legal name', value: `${emp.firstName} ${emp.lastName}` },
            { label: 'Preferred name', value: emp.preferredName },
            { label: 'Work email', value: emp.email },
            { label: 'Personal email', value: canSeeSensitive ? emp.personalEmail : '••••••' },
            { label: 'Phone', value: phoneFmt(emp.phone) },
            { label: 'Date of birth', value: canSeeSensitive ? fmtDate(emp.dob) : '••/••/••••' },
            { label: 'SSN', value: canSeeSensitive ? `•••-••-${emp.ssnLast4}` : '•••-••-••••' },
            { label: 'Address', value: canSeeSensitive ? `${emp.addressLine1}, ${emp.city}, ${emp.state} ${emp.postalCode}` : `${emp.city}, ${emp.state}`, span: true },
          ]} />
        </Card>

        <Card>
          <CardHeader title="Emergency contacts" icon={Shield} />
          {emp.emergencyContacts.length === 0 ? (
            <EmptyState compact title="No emergency contacts on file" body="Add at least one contact from the edit profile screen." />
          ) : (
            <ul className="divide-y divide-line">
              {emp.emergencyContacts.map((c, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">{c.name} {c.isPrimary ? <Badge tone="brand" className="ml-1">Primary</Badge> : null}</p>
                    <p className="text-xs text-muted">{c.relationship}</p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p>{phoneFmt(c.phone)}</p>
                    <p>{c.email}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Skills & certifications" icon={Award} />
          <div className="flex flex-wrap gap-1.5">
            {emp.skills.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
          </div>
          {emp.certifications.length ? (
            <ul className="mt-4 space-y-2 border-t border-line pt-3">
              {emp.certifications.map((c, i) => {
                const expired = c.expires && c.expires < today;
                const soon = c.expires && !expired && c.expires <= `${Number(today.slice(0, 4))}-${today.slice(5)}` && c.expires <= addDaysStr(today, 60);
                return (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm">{c.name}</p>
                      <p className="text-xs text-muted">{c.issuer} · issued {fmtDate(c.issued)}</p>
                    </div>
                    {c.expires ? (
                      <Badge tone={expired ? 'danger' : soon ? 'warning' : 'success'}>
                        {expired ? 'Expired' : 'Expires'} {fmtDate(c.expires)}
                      </Badge>
                    ) : <Badge tone="neutral">No expiration</Badge>}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Time off balances" icon={Plane} dense />
          <ul className="space-y-3">
            {pto.map((p) => (
              <li key={p.kind}>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs capitalize text-muted">{p.kind}</span>
                  <span className="tnum text-sm font-semibold">{num(p.available, 1)}h</span>
                </div>
                <Progress className="mt-1" size="sm" tone="teal" value={p.accrued ? ((p.accrued - p.available) / p.accrued) * 100 : 0} />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Upcoming shifts" icon={Calendar} dense />
          {shifts.length === 0 ? (
            <p className="text-xs text-muted">No shifts scheduled in the next week.</p>
          ) : (
            <ul className="space-y-2">
              {shifts.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted">{fmtDateShort(s.date)}</span>
                  <span className="font-medium">{fmtTime(s.start)} – {fmtTime(s.end)}</span>
                  <span className="text-faint">{lookups.location.get(s.locationId)?.code}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Employment" icon={Briefcase} dense />
          <KeyValue columns={1} items={[
            { label: 'Employee number', value: emp.employeeNumber },
            { label: 'Employment type', value: emp.employmentType.replace(/_/g, ' ') },
            { label: 'Standard hours', value: `${emp.standardHoursPerWeek}/week` },
            { label: 'Badge ID', value: emp.badgeId },
            { label: 'Work authorization', value: emp.workAuthorized ? 'Verified' : 'Not verified' },
            { label: 'Form I-9', value: emp.i9Complete ? <Badge tone="success">Complete</Badge> : <Badge tone="danger">Incomplete</Badge> },
          ]} />
        </Card>
      </div>
    </div>
  );
};

const addDaysStr = (d: string, n: number) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};

/* ------------------------------------------------------------ job & pay */

const JobTab = ({ emp, canSeeSensitive }: { emp: import('@/lib/types').Employee; canSeeSensitive: boolean }) => {
  const { db } = useApp();
  const lookups = useLookups();
  const comp = db.compensation.filter((c) => c.employeeId === emp.id).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const job = lookups.jobTitle.get(emp.jobTitleId);
  const deposits = db.directDeposits.filter((d) => d.employeeId === emp.id);
  const tax = db.taxProfiles.find((t) => t.employeeId === emp.id);
  const garnishments = db.garnishments.filter((g) => g.employeeId === emp.id);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader title="Position" icon={Briefcase} />
          <KeyValue items={[
            { label: 'Job title', value: job?.name },
            { label: 'Job code', value: job?.code },
            { label: 'Level', value: job?.level },
            { label: 'FLSA classification', value: job?.flsa === 'exempt' ? 'Exempt (salaried)' : 'Non-exempt (overtime eligible)' },
            { label: 'Department', value: lookups.department.get(emp.departmentId)?.name },
            { label: 'Cost center', value: lookups.department.get(emp.departmentId)?.costCenter },
            { label: 'Location', value: lookups.location.get(emp.locationId)?.name },
            { label: 'Pay group', value: lookups.payGroup.get(emp.payGroupId)?.name },
            { label: 'EEO category', value: job?.eeoCategory, span: true },
          ]} />
        </Card>

        {canSeeSensitive ? (
          <Card>
            <CardHeader title="Compensation history" icon={TrendingUp} subtitle="Every change is retained as an audit record" />
            <ul className="divide-y divide-line">
              {comp.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">
                      {c.payType === 'salary' ? currency(c.annualSalary, { cents: false }) : `${currency(c.hourlyRate)}/hr`}
                      {c.changePercent ? (
                        <span className={cx('ml-2 text-xs font-medium', c.changePercent > 0 ? 'text-success-600' : 'text-danger-600')}>
                          {c.changePercent > 0 ? '+' : ''}{c.changePercent}%
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">{c.changeReason}</p>
                  </div>
                  <p className="text-xs text-faint">Effective {fmtDate(c.effectiveDate)}</p>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Alert tone="neutral" icon={Shield} title="Compensation is restricted">
            Your role does not include permission to view compensation detail for other employees.
          </Alert>
        )}
      </div>

      <div className="space-y-5">
        {canSeeSensitive ? (
          <>
            <Card>
              <CardHeader title="Current pay" icon={Wallet} dense />
              <KeyValue columns={1} items={[
                { label: 'Pay type', value: emp.payType === 'salary' ? 'Salary' : 'Hourly' },
                { label: emp.payType === 'salary' ? 'Annual salary' : 'Hourly rate', value: emp.payType === 'salary' ? currency(emp.baseSalary, { cents: false }) : currency(emp.hourlyRate) },
                { label: 'Band', value: job ? `${currency(job.minSalary, { cents: false })} – ${currency(job.maxSalary, { cents: false })}` : '—' },
              ]} />
            </Card>

            <Card>
              <CardHeader title="Direct deposit" icon={CreditCard} dense />
              {deposits.length === 0 ? (
                <Alert tone="warning" title="No account on file">Pay will be issued by physical check.</Alert>
              ) : (
                <ul className="space-y-2.5">
                  {deposits.map((d) => (
                    <li key={d.id} className="rounded-lg border border-line p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{d.nickname}</p>
                        {d.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Prenote pending</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{d.bankName} · {d.accountType} {maskAccount(d.accountLast4)}</p>
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
              <CardHeader title="Tax withholding" icon={FileText} dense />
              {tax ? (
                <KeyValue columns={1} items={[
                  { label: 'Filing status', value: tax.filingStatus.replace(/_/g, ' ') },
                  { label: 'Dependent credits', value: num(tax.federalAllowances) },
                  { label: 'Extra federal', value: currency(tax.additionalFederal) },
                  { label: 'Work state', value: tax.stateCode },
                  { label: 'W-4 status', value: tax.complete ? <Badge tone="success">Complete</Badge> : <Badge tone="danger">Incomplete</Badge> },
                ]} />
              ) : <p className="text-xs text-muted">No tax profile on file.</p>}
            </Card>

            {garnishments.length ? (
              <Card>
                <CardHeader title="Garnishments" icon={Shield} dense />
                <ul className="space-y-2">
                  {garnishments.map((g) => (
                    <li key={g.id} className="text-xs">
                      <p className="font-medium capitalize">{g.type.replace(/_/g, ' ')}</p>
                      <p className="text-muted">{g.agency} · {g.caseNumber}</p>
                      <p className="text-faint">
                        {g.amountType === 'fixed' ? `${currency(g.amount)} per check` : `${g.amount}% of disposable earnings`} · max {g.maxPercent}%
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- tabs */

const TimeTab = ({ emp }: { emp: import('@/lib/types').Employee }) => {
  const { db } = useApp();
  const cards = db.timecards.filter((t) => t.employeeId === emp.id).sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  if (!cards.length) return <Card><EmptyState icon={Clock} title="No timecards yet" body="Timecards appear once the employee starts recording time." /></Card>;
  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5"><CardHeader title="Timecards" subtitle="Most recent pay periods" icon={Clock} dense /></div>
      <div className="scroll-x">
        <table className="dt">
          <thead>
            <tr>
              <th>Pay period</th><th className="text-right">Regular</th><th className="text-right">Overtime</th>
              <th className="text-right">PTO</th><th className="text-right">Holiday</th><th className="text-right">Total</th>
              <th className="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((t) => (
              <tr key={t.id}>
                <td className="text-sm">{fmtDateShort(t.periodStart)} – {fmtDateShort(t.periodEnd)}</td>
                <td className="text-right tnum text-sm">{num(t.totalRegular, 2)}</td>
                <td className={cx('text-right tnum text-sm', t.totalOvertime > 0 && 'text-warning-600 font-medium')}>{num(t.totalOvertime, 2)}</td>
                <td className="text-right tnum text-sm">{num(t.totalPto, 2)}</td>
                <td className="text-right tnum text-sm">{num(t.totalHoliday, 2)}</td>
                <td className="text-right tnum text-sm font-medium">{num(t.totalRegular + t.totalOvertime + t.totalDoubleTime + t.totalPto + t.totalHoliday, 2)}</td>
                <td className="text-center"><StatusBadge status={t.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const TimeOffTab = ({ emp }: { emp: import('@/lib/types').Employee }) => {
  const { db } = useApp();
  const requests = db.ptoRequests.filter((r) => r.employeeId === emp.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const balances = ptoSummary(db, emp.id);
  const policy = db.ptoPolicies.find((p) => p.id === emp.ptoPolicyId);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card padded={false}>
          <div className="p-4 sm:p-5"><CardHeader title="Request history" icon={Plane} dense /></div>
          {requests.length === 0 ? <EmptyState compact title="No time-off requests" /> : (
            <div className="scroll-x">
              <table className="dt">
                <thead><tr><th>Dates</th><th>Type</th><th className="text-right">Hours</th><th className="text-center">Status</th><th>Note</th></tr></thead>
                <tbody>
                  {requests.slice(0, 20).map((r) => (
                    <tr key={r.id}>
                      <td className="text-sm">{fmtDateShort(r.startDate)} – {fmtDateShort(r.endDate)}</td>
                      <td className="text-sm capitalize">{r.kind.replace(/_/g, ' ')}</td>
                      <td className="text-right tnum text-sm">{num(r.hours, 1)}</td>
                      <td className="text-center"><StatusBadge status={r.status} /></td>
                      <td className="max-w-[16rem] truncate text-xs text-muted">{r.note || r.decisionNote || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Balances" icon={Plane} dense />
          <ul className="space-y-3.5">
            {balances.map((b) => (
              <li key={b.kind}>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs capitalize text-muted">{b.kind}</span>
                  <span className="tnum text-sm font-semibold">{num(b.available, 1)}h</span>
                </div>
                <Progress className="mt-1" size="sm" tone="teal" value={b.accrued ? ((b.accrued - b.available) / b.accrued) * 100 : 0} />
                <p className="mt-1 text-2xs text-faint">{num(b.accrued, 1)}h accrued · {num(b.used, 1)}h used · {num(b.pending, 1)}h pending</p>
              </li>
            ))}
          </ul>
        </Card>
        {policy ? (
          <Card>
            <CardHeader title="Policy" icon={FileText} dense />
            <p className="text-sm font-medium">{policy.name}</p>
            <p className="mt-1 text-xs text-muted">{policy.description}</p>
            <KeyValue className="mt-3" columns={1} items={[
              { label: 'Accrual', value: policy.accrualMethod.replace(/_/g, ' ') },
              { label: 'Annual grant', value: policy.hoursPerYear ? `${policy.hoursPerYear}h` : 'Unlimited' },
              { label: 'Carryover cap', value: `${policy.maxCarryoverHours}h` },
              { label: 'Notice required', value: `${policy.minNoticeDays} days` },
            ]} />
          </Card>
        ) : null}
      </div>
    </div>
  );
};

const BenefitsTab = ({ emp }: { emp: import('@/lib/types').Employee }) => {
  const { db } = useApp();
  const lookups = useLookups();
  const enrollments = db.benefitEnrollments.filter((e) => e.employeeId === emp.id);
  const dependents = db.dependents.filter((d) => d.employeeId === emp.id);
  const perPay = enrollments.reduce((s, e) => s + e.employeeCostPerPay, 0);
  const employerPerPay = enrollments.reduce((s, e) => s + e.employerCostPerPay, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader title="Elections" subtitle={`${enrollments.filter((e) => e.status === 'active').length} active plans`} icon={HeartPulse} />
          {enrollments.length === 0 ? <EmptyState compact title="No elections on file" /> : (
            <ul className="divide-y divide-line">
              {enrollments.map((e) => {
                const plan = lookups.plan.get(e.planId);
                return (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{plan?.name}</p>
                      <p className="text-xs text-muted capitalize">
                        {plan?.type.replace(/_/g, ' ')} · {e.tier.replace(/_/g, ' ')} · effective {fmtDate(e.effectiveDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tnum text-sm font-medium">{currency(e.employeeCostPerPay)}<span className="text-xs font-normal text-faint">/pay</span></p>
                      <StatusBadge status={e.status} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Cost summary" icon={Wallet} dense />
          <KeyValue columns={1} items={[
            { label: 'Employee cost per pay', value: currency(perPay) },
            { label: 'Employer contribution per pay', value: currency(employerPerPay) },
            { label: 'Total benefit value per pay', value: currency(perPay + employerPerPay) },
          ]} />
        </Card>
        <Card>
          <CardHeader title="Dependents" icon={Users} dense />
          {dependents.length === 0 ? <p className="text-xs text-muted">No dependents on file.</p> : (
            <ul className="space-y-2">
              {dependents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                  <span>{d.firstName} {d.lastName}</span>
                  <span className="capitalize text-muted">{d.relationship.replace(/_/g, ' ')}</span>
                  {d.isCovered ? <Badge tone="success">Covered</Badge> : <Badge tone="neutral">Not covered</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

const PayTab = ({ emp }: { emp: import('@/lib/types').Employee }) => {
  const { db } = useApp();
  const navigate = useNavigate();
  const checks = paychecksFor(db, emp.id);
  const series = [...checks].reverse().slice(-12);

  return (
    <div className="space-y-5">
      {series.length > 2 ? (
        <Card>
          <CardHeader title="Net pay trend" subtitle="Last 12 pay statements" icon={TrendingUp} />
          <LineChart
            area
            categories={series.map((c) => fmtDateShort(c.checkDate))}
            series={[
              { key: 'gross', label: 'Gross', values: series.map((c) => c.grossPay) },
              { key: 'net', label: 'Net', values: series.map((c) => c.netPay) },
            ]}
            format={(n) => currency(n, { compact: true, cents: false })}
            height={210}
          />
        </Card>
      ) : null}
      <Card padded={false}>
        <div className="p-4 sm:p-5"><CardHeader title="Pay statements" icon={Wallet} dense /></div>
        {checks.length === 0 ? <EmptyState compact title="No pay statements" /> : (
          <div className="scroll-x">
            <table className="dt">
              <thead><tr><th>Check date</th><th className="text-right">Hours</th><th className="text-right">Gross</th><th className="text-right">Taxes</th><th className="text-right">Deductions</th><th className="text-right">Net</th><th /></tr></thead>
              <tbody>
                {checks.slice(0, 26).map((c) => (
                  <tr key={c.id}>
                    <td className="text-sm">{fmtDate(c.checkDate)}</td>
                    <td className="text-right tnum text-sm">{num(c.totalHours, 2)}</td>
                    <td className="text-right tnum text-sm">{currency(c.grossPay)}</td>
                    <td className="text-right tnum text-sm text-danger-600">−{currency(c.taxes.reduce((s, t) => s + t.amount, 0))}</td>
                    <td className="text-right tnum text-sm text-danger-600">−{currency(c.deductions.reduce((s, d) => s + d.amount, 0))}</td>
                    <td className="text-right tnum text-sm font-semibold">{currency(c.netPay)}</td>
                    <td className="text-right">
                      <Button size="xs" variant="ghost" iconRight={ChevronRight} onClick={() => navigate(`/payroll?check=${c.id}`)}>View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

const PerformanceTab = ({ emp }: { emp: import('@/lib/types').Employee }) => {
  const { db } = useApp();
  const goals = goalsFor(db, emp.id);
  const reviews = db.reviews.filter((r) => r.employeeId === emp.id).sort((a, b) => b.cycleId.localeCompare(a.cycleId));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Goals" icon={Target} subtitle={`${goals.length} tracked this year`} />
        {goals.length === 0 ? <EmptyState compact title="No goals set" /> : (
          <ul className="space-y-4">
            {goals.map((g) => (
              <li key={g.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{g.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{g.metric} · weight {g.weight}%</p>
                  </div>
                  <StatusBadge status={g.status} />
                </div>
                <Progress className="mt-2" value={g.target ? (g.current / g.target) * 100 : 0} showValue
                  tone={g.status === 'completed' ? 'success' : g.status === 'behind' ? 'danger' : g.status === 'at_risk' ? 'warning' : 'brand'} />
                <p className="mt-1 text-2xs text-faint">{num(g.current, 1)} of {num(g.target, 1)} {g.unit} · due {fmtDate(g.dueDate)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Reviews" icon={Award} />
        {reviews.length === 0 ? <EmptyState compact title="No reviews on record" /> : (
          <ul className="divide-y divide-line">
            {reviews.map((r) => {
              const cycle = db.reviewCycles.find((c) => c.id === r.cycleId);
              return (
                <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{cycle?.name}</p>
                    <StatusBadge status={r.stage} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                    <span>Self: {r.selfRating ?? '—'}</span>
                    <span>Manager: {r.managerRating ?? '—'}</span>
                    <span>Final: {r.finalRating ?? '—'}</span>
                    {r.merit ? <span className="text-success-600">Merit +{r.merit.increasePercent}%</span> : null}
                  </div>
                  {r.managerComments ? <p className="mt-2 text-xs leading-relaxed text-muted">{r.managerComments}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};

const LearningTab = ({ emp }: { emp: import('@/lib/types').Employee }) => {
  const { db } = useApp();
  const lookups = useLookups();
  const assignments = trainingFor(db, emp.id);
  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5"><CardHeader title="Training record" icon={GraduationCap} dense /></div>
      {assignments.length === 0 ? <EmptyState compact title="No training assigned" /> : (
        <div className="scroll-x">
          <table className="dt">
            <thead><tr><th>Course</th><th>Category</th><th>Due</th><th className="w-40">Progress</th><th className="text-center">Status</th><th className="text-right">Score</th></tr></thead>
            <tbody>
              {assignments.map((a) => {
                const c = lookups.course.get(a.courseId);
                return (
                  <tr key={a.id}>
                    <td>
                      <p className="text-sm">{c?.title}</p>
                      <p className="text-xs text-muted">{c?.code} · {c?.durationMinutes} min</p>
                    </td>
                    <td className="text-sm capitalize">{c?.category}</td>
                    <td className="text-sm">{fmtDate(a.dueDate)}</td>
                    <td><Progress value={a.progressPercent} size="sm" tone={a.status === 'overdue' ? 'danger' : 'brand'} showValue /></td>
                    <td className="text-center"><StatusBadge status={a.status} /></td>
                    <td className="text-right tnum text-sm">{a.score ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

const DocumentsTab = ({ emp }: { emp: import('@/lib/types').Employee }) => {
  const { db, can, employee: me } = useApp();
  const isSelf = me?.id === emp.id;
  const docs = db.documents.filter((d) =>
    d.employeeId === emp.id && (can('documents.view.all') || isSelf || (can('documents.view.team') && !d.confidential)));

  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5"><CardHeader title="Documents" icon={FileText} dense subtitle="Confidential records are visible only to HR and the employee" /></div>
      {docs.length === 0 ? <EmptyState compact icon={FileText} title="No documents visible" body="You may not have permission to view this employee's documents." /> : (
        <ul className="divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sunken text-muted"><FileText className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-muted capitalize">{d.category} · {d.sizeKb} KB · uploaded {fmtDate(d.uploadedAt.slice(0, 10))}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {d.confidential ? <Badge tone="warning">Confidential</Badge> : null}
                {d.expiresOn ? <Badge tone="neutral">Expires {fmtDateShort(d.expiresOn)}</Badge> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const HistoryTab = ({ emp }: { emp: import('@/lib/types').Employee }) => {
  const { db } = useApp();
  const events = db.employmentEvents
    .filter((e) => e.employeeId === emp.id)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const audits = db.auditLog.filter((a) => a.objectId === emp.id).slice(0, 12);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Employment history" icon={TrendingUp} subtitle="Every lifecycle action, retained permanently" />
        <Timeline items={events.map((e) => ({
          id: e.id,
          title: e.summary,
          meta: fmtDate(e.effectiveDate),
          tone: e.action === 'termination' ? 'danger' : e.action === 'promotion' ? 'success' : 'brand',
          body: (
            <>
              {e.changes.map((c, i) => (
                <p key={i}>{c.field}: <span className="text-faint">{c.from}</span> → <span className="text-ink">{c.to}</span></p>
              ))}
              {e.note ? <p className="mt-1 italic">{e.note}</p> : null}
            </>
          ),
        }))} />
      </Card>
      <Card>
        <CardHeader title="Recent record access" icon={Shield} subtitle="Audit entries touching this record" />
        {audits.length === 0 ? <EmptyState compact title="No audit entries" /> : (
          <ul className="divide-y divide-line">
            {audits.map((a) => (
              <li key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm">{a.action}</p>
                  <p className="text-2xs text-faint">{timeAgo(a.at)}</p>
                </div>
                <p className="text-xs text-muted">{a.actorName} · {a.module} · {a.device}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

/* --------------------------------------------------------- edit profile */

const EditProfileModal = ({ open, onClose, employeeId }: { open: boolean; onClose: () => void; employeeId: string }) => {
  const { db } = useApp();
  const { updateEmployee } = usePeopleActions();
  const emp = db.employees.find((e) => e.id === employeeId)!;
  const [form, setForm] = useState({
    preferredName: emp.preferredName, phone: emp.phone, personalEmail: emp.personalEmail,
    addressLine1: emp.addressLine1, city: emp.city, state: emp.state, postalCode: emp.postalCode,
  });
  const [contacts, setContacts] = useState<EmergencyContact[]>(emp.emergencyContacts);

  const save = () => {
    updateEmployee(employeeId, { ...form, emergencyContacts: contacts }, { module: 'Self-service', action: 'Updated personal information' });
    onClose();
  };

  return (
    <Modal
      open={open} onClose={onClose} title="Edit profile" icon={Pencil} size="lg"
      subtitle="Changes are recorded in the audit trail and flow to payroll and benefits where relevant."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save changes</Button></>}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred name"><Input value={form.preferredName} onChange={(e) => setForm({ ...form, preferredName: e.target.value })} /></Field>
          <Field label="Mobile phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Personal email" className="sm:col-span-2"><Input value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} /></Field>
          <Field label="Street address" className="sm:col-span-2"><Input value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} /></Field>
          <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State"><Input value={form.state} maxLength={2} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} /></Field>
            <Field label="ZIP"><Input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} /></Field>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium">Emergency contacts</h4>
            <Button size="xs" onClick={() => setContacts([...contacts, { name: '', relationship: 'Spouse', phone: '', email: '', isPrimary: contacts.length === 0 }])}>
              Add contact
            </Button>
          </div>
          <div className="space-y-3">
            {contacts.map((c, i) => (
              <div key={i} className="rounded-lg border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name"><Input value={c.name} onChange={(e) => setContacts(contacts.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} /></Field>
                  <Field label="Relationship">
                    <Select value={c.relationship} onChange={(e) => setContacts(contacts.map((x, xi) => xi === i ? { ...x, relationship: e.target.value } : x))}>
                      {['Spouse', 'Partner', 'Parent', 'Sibling', 'Child', 'Friend', 'Other'].map((r) => <option key={r}>{r}</option>)}
                    </Select>
                  </Field>
                  <Field label="Phone"><Input value={c.phone} onChange={(e) => setContacts(contacts.map((x, xi) => xi === i ? { ...x, phone: e.target.value } : x))} /></Field>
                  <Field label="Email"><Input value={c.email} onChange={(e) => setContacts(contacts.map((x, xi) => xi === i ? { ...x, email: e.target.value } : x))} /></Field>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Checkbox
                    label="Primary contact" checked={c.isPrimary}
                    onChange={(v) => setContacts(contacts.map((x, xi) => ({ ...x, isPrimary: xi === i ? v : v ? false : x.isPrimary })))}
                  />
                  <Button size="xs" variant="ghost" onClick={() => setContacts(contacts.filter((_, xi) => xi !== i))}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Alert tone="info" icon={Shield} title="What happens next">
          Address changes update your tax jurisdiction on the next payroll run. Contact People Operations
          for legal name or Social Security number changes — those require documentation.
        </Alert>
      </div>
    </Modal>
  );
};
