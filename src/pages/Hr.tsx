import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowRightLeft, Award, Briefcase, Building2, CheckCircle2, ClipboardList,
  LogOut, MapPin, Plane, TrendingUp, UserMinus, UserPlus, Users,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Column, DataTable, EmptyState, Field,
  Input, Modal, PermissionDenied, SectionHeader, Select, StatTile,
  Tabs, Textarea, Timeline, cx,
} from '@/components/ui';
import { BarChart, DonutChart } from '@/components/charts';
import { useApp, useLookups } from '@/lib/store';
import { usePeopleActions } from '@/lib/actions';
import { departmentHeadcount, headcountStats, locationHeadcount } from '@/lib/selectors';
import { currency, num, percent } from '@/lib/format';
import { addDays, fmtDate, tenureLabel, timeAgo } from '@/lib/dates';
import type { Employee, LifecycleAction } from '@/lib/types';

const ACTIONS: { id: LifecycleAction; label: string; icon: React.ComponentType<{ className?: string }>; blurb: string }[] = [
  { id: 'promotion', label: 'Promotion', icon: Award, blurb: 'New title, level and compensation.' },
  { id: 'compensation_change', label: 'Compensation change', icon: TrendingUp, blurb: 'Merit, market or equity adjustment.' },
  { id: 'transfer', label: 'Transfer', icon: ArrowRightLeft, blurb: 'Move to another department or location.' },
  { id: 'manager_change', label: 'Manager change', icon: Users, blurb: 'Reassign the reporting line.' },
  { id: 'leave_start', label: 'Start leave', icon: Plane, blurb: 'Record a leave of absence.' },
  { id: 'leave_return', label: 'Return from leave', icon: CheckCircle2, blurb: 'Reactivate an employee on leave.' },
  { id: 'termination', label: 'Termination', icon: UserMinus, blurb: 'Separation with final pay and access removal.' },
];

export const HrPage = () => {
  const { db, can, today } = useApp();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('actions');
  const [actionFor, setActionFor] = useState<{ action: LifecycleAction; employeeId: string } | null>(
    () => (params.get('employee') ? { action: 'compensation_change', employeeId: params.get('employee')! } : null),
  );

  if (!can('people.view.all', 'people.lifecycle.manage')) return <PermissionDenied what="HR operations" />;

  const stats = headcountStats(db, today);
  const tabs = [
    { id: 'actions', label: 'Personnel actions', icon: ClipboardList },
    { id: 'compliance', label: 'Compliance', icon: AlertTriangle },
    { id: 'org', label: 'Organization', icon: Building2 },
    { id: 'turnover', label: 'Movement', icon: TrendingUp },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="HR Operations"
        subtitle="Lifecycle actions, compliance tracking and organizational structure. Every action writes a permanent history record."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Headcount" value={num(stats.total)} icon={Users} hint={`${stats.active} active · ${stats.onLeave} on leave`} />
        <StatTile label="Hires this year" value={num(stats.hiresYtd)} icon={UserPlus} tone="teal" />
        <StatTile label="Separations (12 mo)" value={num(stats.separations)} icon={UserMinus} tone="warning"
          hint={`${stats.voluntary} voluntary`} />
        <StatTile label="Turnover" value={percent(stats.turnover, 1)} icon={TrendingUp}
          tone={stats.turnover > 18 ? 'danger' : 'success'} />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={(t) => { setTab(t); setParams({}, { replace: true }); }} />

      {tab === 'actions' ? <ActionsTab onStart={(action, employeeId) => setActionFor({ action, employeeId })} /> : null}
      {tab === 'compliance' ? <ComplianceTab /> : null}
      {tab === 'org' ? <OrgTab /> : null}
      {tab === 'turnover' ? <MovementTab /> : null}

      <LifecycleModal state={actionFor} onClose={() => setActionFor(null)} />
    </div>
  );
};

/* -------------------------------------------------------------- actions */

const ActionsTab = ({ onStart }: { onStart: (action: LifecycleAction, employeeId: string) => void }) => {
  const { db, can } = useApp();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [picking, setPicking] = useState<LifecycleAction | null>(null);
  const [query, setQuery] = useState('');

  const events = [...db.employmentEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 14);
  const candidates = db.employees
    .filter((e) => (picking === 'leave_return' ? e.status === 'on_leave' : e.status === 'active'))
    .filter((e) => {
      const q = query.trim().toLowerCase();
      return !q || `${e.firstName} ${e.lastName} ${e.employeeNumber}`.toLowerCase().includes(q);
    })
    .slice(0, 40);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader title="Start a personnel action" icon={ClipboardList}
            subtitle="Each action records a dated event, updates the employee record and notifies the affected systems." />
          <div className="grid gap-3 sm:grid-cols-2">
            {ACTIONS.map((a) => (
              <button
                key={a.id}
                disabled={!can('people.lifecycle.manage')}
                onClick={() => { setPicking(a.id); setQuery(''); }}
                className={cx('flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all',
                  can('people.lifecycle.manage')
                    ? 'border-line hover:border-brand-300 hover:shadow-raised'
                    : 'border-line opacity-50')}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <a.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{a.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{a.blurb}</span>
                </span>
              </button>
            ))}
          </div>
          {!can('people.lifecycle.manage') ? (
            <Alert className="mt-4" tone="neutral" title="Read-only">Lifecycle actions require the HR Administrator role.</Alert>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Recent lifecycle activity" icon={TrendingUp} />
          <Timeline items={events.map((e) => {
            const emp = lookups.employee.get(e.employeeId);
            return {
              id: e.id,
              title: (
                <span>
                  {emp ? (
                    <button onClick={() => navigate(`/people/${emp.id}`)} className="font-medium hover:text-brand-700">
                      {emp.preferredName} {emp.lastName}
                    </button>
                  ) : 'Employee'}
                  <span className="font-normal text-muted"> — {e.summary}</span>
                </span>
              ),
              meta: `${fmtDate(e.effectiveDate)} · ${timeAgo(e.createdAt)}`,
              tone: e.action === 'termination' ? 'danger' : e.action === 'hire' ? 'success' : e.action === 'promotion' ? 'brand' : 'neutral',
              body: e.changes.length ? e.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join(' · ') : e.note,
            };
          })} />
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Starting soon" dense icon={UserPlus} />
          {db.employees.filter((e) => e.status === 'pending_hire').length === 0 ? (
            <p className="text-xs text-muted">No pre-start employees.</p>
          ) : (
            <ul className="space-y-2.5">
              {db.employees.filter((e) => e.status === 'pending_hire').map((e) => (
                <li key={e.id}>
                  <button onClick={() => navigate(`/people/${e.id}`)} className="flex w-full items-center gap-2.5 rounded-lg border border-line p-2.5 text-left hover:bg-sunken">
                    <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{e.firstName} {e.lastName}</span>
                      <span className="block truncate text-2xs text-muted">
                        {lookups.jobTitle.get(e.jobTitleId)?.name} · starts {fmtDate(e.hireDate)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Currently on leave" dense icon={Plane} />
          {db.employees.filter((e) => e.status === 'on_leave').length === 0 ? (
            <p className="text-xs text-muted">Nobody is on leave.</p>
          ) : (
            <ul className="space-y-2">
              {db.employees.filter((e) => e.status === 'on_leave').map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <button onClick={() => navigate(`/people/${e.id}`)} className="flex min-w-0 items-center gap-2 text-left">
                    <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={24} />
                    <span className="truncate text-xs">{e.preferredName} {e.lastName}</span>
                  </button>
                  <Button size="xs" onClick={() => onStart('leave_return', e.id)}>Return</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(picking)} onClose={() => setPicking(null)}
        title={`Select an employee — ${ACTIONS.find((a) => a.id === picking)?.label ?? ''}`}
        icon={Users}
      >
        <div className="space-y-3">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or employee number…" autoFocus />
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {candidates.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => { if (picking) onStart(picking, e.id); setPicking(null); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sunken"
                >
                  <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{e.firstName} {e.lastName}</span>
                    <span className="block truncate text-xs text-muted">
                      {lookups.jobTitle.get(e.jobTitleId)?.name} · {e.employeeNumber}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
};

/* ---------------------------------------------------------- compliance */

const ComplianceTab = () => {
  const { db, today } = useApp();
  const navigate = useNavigate();

  const active = db.employees.filter((e) => e.status === 'active' || e.status === 'pending_hire');
  const missingI9 = active.filter((e) => !e.i9Complete);
  const missingW4 = db.taxProfiles.filter((t) => !t.complete && active.some((e) => e.id === t.employeeId));
  const missingDd = active.filter((e) => !db.directDeposits.some((d) => d.employeeId === e.id && d.active));
  const overdueTraining = db.trainingAssignments.filter((a) => a.status === 'overdue');
  const expiringCerts = active.flatMap((e) =>
    e.certifications.filter((c) => c.expires && c.expires <= addDays(today, 60))
      .map((c) => ({ employee: e, cert: c })));

  const groups = [
    { title: 'Form I-9 incomplete', items: missingI9.length, tone: 'danger' as const, detail: 'Employment eligibility must be verified within three business days of the start date.' },
    { title: 'Form W-4 incomplete', items: missingW4.length, tone: 'danger' as const, detail: 'Withholding defaults to single with zero allowances until completed.' },
    { title: 'No direct deposit', items: missingDd.length, tone: 'warning' as const, detail: 'These employees are paid by physical check.' },
    { title: 'Overdue training', items: overdueTraining.length, tone: 'warning' as const, detail: 'Escalates to the manager after seven days overdue.' },
    { title: 'Certifications expiring', items: expiringCerts.length, tone: 'warning' as const, detail: 'Within the next 60 days.' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {groups.map((g) => (
          <Card key={g.title}>
            <p className="text-xs text-faint">{g.title}</p>
            <p className={cx('tnum mt-1 text-2xl font-semibold',
              g.items === 0 ? 'text-success-600' : g.tone === 'danger' ? 'text-danger-600' : 'text-warning-600')}>
              {num(g.items)}
            </p>
            <p className="mt-1 text-2xs leading-relaxed text-faint">{g.detail}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card padded={false}>
          <div className="p-4 sm:p-5"><CardHeader dense title="Employment eligibility gaps" icon={AlertTriangle} /></div>
          {missingI9.length === 0 ? <EmptyState compact icon={CheckCircle2} title="Every active employee has a completed I-9" /> : (
            <ul className="divide-y divide-line">
              {missingI9.slice(0, 12).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <button onClick={() => navigate(`/people/${e.id}`)} className="flex min-w-0 items-center gap-2.5 text-left">
                    <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={26} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{e.preferredName} {e.lastName}</span>
                      <span className="block truncate text-xs text-muted">Started {fmtDate(e.hireDate)}</span>
                    </span>
                  </button>
                  <Badge tone="danger">I-9 pending</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padded={false}>
          <div className="p-4 sm:p-5"><CardHeader dense title="Certifications expiring" icon={Award} /></div>
          {expiringCerts.length === 0 ? <EmptyState compact icon={CheckCircle2} title="No certifications expiring in the next 60 days" /> : (
            <ul className="divide-y divide-line">
              {expiringCerts.slice(0, 12).map(({ employee, cert }, i) => (
                <li key={`${employee.id}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <button onClick={() => navigate(`/people/${employee.id}`)} className="flex min-w-0 items-center gap-2.5 text-left">
                    <Avatar first={employee.firstName} last={employee.lastName} seed={employee.avatarSeed} size={26} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{employee.preferredName} {employee.lastName}</span>
                      <span className="block truncate text-xs text-muted">{cert.name}</span>
                    </span>
                  </button>
                  <Badge tone={cert.expires! < today ? 'danger' : 'warning'}>
                    {cert.expires! < today ? 'Expired' : fmtDate(cert.expires!)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Workforce demographics" icon={Users}
          subtitle="Aggregated for EEO reporting. Individual responses are voluntary and never shown to managers." />
        <div className="grid gap-5 md:grid-cols-3">
          <DonutChart size={140}
            data={['female', 'male', 'non_binary', 'undisclosed'].map((g) => ({
              label: g.replace(/_/g, ' '),
              value: active.filter((e) => e.gender === g).length,
            })).filter((d) => d.value > 0)}
            centerLabel="employees" centerValue={num(active.length)} />
          <div className="md:col-span-2">
            <BarChart
              categories={['full_time', 'part_time', 'temp', 'intern', 'contractor'].map((t) => t.replace(/_/g, ' '))}
              series={[{
                key: 'count', label: 'Employees',
                values: ['full_time', 'part_time', 'temp', 'intern', 'contractor'].map((t) => active.filter((e) => e.employmentType === t).length),
              }]}
              height={180} labelEvery={1}
            />
          </div>
        </div>
      </Card>
    </div>
  );
};

/* ---------------------------------------------------------------- org */

const OrgTab = () => {
  const { db } = useApp();
  const lookups = useLookups();
  const navigate = useNavigate();

  const depts = departmentHeadcount(db);
  const locs = locationHeadcount(db);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card padded={false}>
          <div className="p-4 sm:p-5"><CardHeader dense title="Departments" icon={Building2} subtitle={`${db.departments.length} cost centers`} /></div>
          <div className="scroll-x">
            <table className="dt">
              <thead><tr><th>Department</th><th>Cost center</th><th>GL account</th><th>Head</th><th className="text-right">Headcount</th></tr></thead>
              <tbody>
                {db.departments.map((d) => {
                  const head = d.headEmployeeId ? lookups.employee.get(d.headEmployeeId) : null;
                  return (
                    <tr key={d.id}>
                      <td className="text-sm font-medium">{d.name}</td>
                      <td className="font-mono text-xs text-muted">{d.costCenter}</td>
                      <td className="font-mono text-xs text-muted">{d.glAccount}</td>
                      <td>
                        {head ? (
                          <button onClick={() => navigate(`/people/${head.id}`)} className="text-sm hover:text-brand-700">
                            {head.preferredName} {head.lastName}
                          </button>
                        ) : <span className="text-xs text-faint">—</span>}
                      </td>
                      <td className="text-right tnum text-sm">{depts.find((x) => x.id === d.id)?.value ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card padded={false}>
          <div className="p-4 sm:p-5"><CardHeader dense title="Locations" icon={MapPin} subtitle={`${db.locations.filter((l) => l.active).length} active sites`} /></div>
          <div className="scroll-x">
            <table className="dt">
              <thead><tr><th>Location</th><th>City</th><th className="text-right">Geofence</th><th className="text-right">Headcount</th></tr></thead>
              <tbody>
                {db.locations.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <p className="text-sm font-medium">{l.name}</p>
                      <p className="text-xs text-muted">{l.code} · {l.timezone}</p>
                    </td>
                    <td className="text-sm">{l.city}, {l.state}</td>
                    <td className="text-right tnum text-sm">{l.geofenceMeters ? `${l.geofenceMeters} m` : '—'}</td>
                    <td className="text-right tnum text-sm">{locs.find((x) => x.id === l.id)?.value ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-5"><CardHeader dense title="Job architecture" icon={Briefcase} subtitle={`${db.jobTitles.length} job titles across ${db.departments.length} departments`} /></div>
        <div className="scroll-x">
          <table className="dt">
            <thead><tr><th>Job title</th><th>Code</th><th>Department</th><th>Level</th><th>FLSA</th><th className="text-right">Range</th><th className="text-right">Filled</th></tr></thead>
            <tbody>
              {db.jobTitles.map((j) => {
                const filled = db.employees.filter((e) => e.jobTitleId === j.id && e.status === 'active').length;
                return (
                  <tr key={j.id}>
                    <td className="text-sm font-medium">{j.name}</td>
                    <td className="font-mono text-xs text-muted">{j.code}</td>
                    <td className="text-sm">{lookups.department.get(j.departmentId)?.name}</td>
                    <td><Badge tone="neutral">{j.level}</Badge></td>
                    <td><Badge tone={j.flsa === 'exempt' ? 'brand' : 'teal'}>{j.flsa === 'exempt' ? 'Exempt' : 'Non-exempt'}</Badge></td>
                    <td className="text-right tnum text-sm">
                      {j.flsa === 'exempt'
                        ? `${currency(j.minSalary, { compact: true, cents: false })}–${currency(j.maxSalary, { compact: true, cents: false })}`
                        : `${currency(j.minSalary)}–${currency(j.maxSalary)}/hr`}
                    </td>
                    <td className="text-right tnum text-sm">{filled}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

/* ----------------------------------------------------------- movement */

const MovementTab = () => {
  const { db, today } = useApp();
  const lookups = useLookups();
  const navigate = useNavigate();

  const terminated = db.employees.filter((e) => e.status === 'terminated' && e.terminationDate)
    .sort((a, b) => (b.terminationDate ?? '').localeCompare(a.terminationDate ?? ''));

  const byReason = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of terminated) {
      const key = e.terminationReason?.startsWith('Voluntary') ? 'Voluntary'
        : e.terminationReason?.startsWith('Involuntary') ? 'Involuntary' : 'Other';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([label, value]) => ({ label, value }));
  }, [terminated]);

  const hiresByMonth = useMemo(() => {
    const map = new Map<string, { hires: number; exits: number }>();
    for (const e of db.employees) {
      if (e.hireDate <= today && e.hireDate >= addDays(today, -365)) {
        const k = e.hireDate.slice(0, 7);
        const cur = map.get(k) ?? { hires: 0, exits: 0 };
        cur.hires++;
        map.set(k, cur);
      }
      if (e.terminationDate && e.terminationDate >= addDays(today, -365)) {
        const k = e.terminationDate.slice(0, 7);
        const cur = map.get(k) ?? { hires: 0, exits: 0 };
        cur.exits++;
        map.set(k, cur);
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  }, [db.employees, today]);

  const columns: Column<Employee>[] = [
    {
      key: 'employee', header: 'Employee', sortValue: (e) => e.lastName,
      render: (e) => (
        <button className="flex items-center gap-2.5 text-left" onClick={() => navigate(`/people/${e.id}`)}>
          <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={26} />
          <span className="min-w-0">
            <span className="block truncate text-sm">{e.firstName} {e.lastName}</span>
            <span className="block truncate text-xs text-muted">{lookups.jobTitle.get(e.jobTitleId)?.name}</span>
          </span>
        </button>
      ),
    },
    { key: 'dept', header: 'Department', hideBelow: 'md', render: (e) => <span className="text-sm">{lookups.department.get(e.departmentId)?.name}</span> },
    { key: 'tenure', header: 'Tenure', align: 'right', hideBelow: 'sm', sortValue: (e) => e.hireDate, render: (e) => tenureLabel(e.hireDate, e.terminationDate ?? today) },
    { key: 'date', header: 'Separation date', sortValue: (e) => e.terminationDate ?? '', render: (e) => <span className="text-sm">{fmtDate(e.terminationDate!)}</span> },
    { key: 'reason', header: 'Reason', hideBelow: 'md', render: (e) => <span className="text-sm">{e.terminationReason}</span> },
    { key: 'rehire', header: 'Rehire', align: 'center', render: (e) => e.rehireEligible ? <Badge tone="success">Eligible</Badge> : <Badge tone="danger">Not eligible</Badge> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Hires and separations" subtitle="Rolling 12 months" icon={TrendingUp} />
          <BarChart
            categories={hiresByMonth.map(([m]) => m.slice(5) + '/' + m.slice(2, 4))}
            series={[
              { key: 'hires', label: 'Hires', values: hiresByMonth.map(([, v]) => v.hires) },
              { key: 'exits', label: 'Separations', values: hiresByMonth.map(([, v]) => v.exits) },
            ]}
            height={230}
          />
        </Card>
        <Card>
          <CardHeader title="Separation type" icon={LogOut} />
          <DonutChart data={byReason} centerLabel="separations" centerValue={num(terminated.length)} size={150} />
        </Card>
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-5"><CardHeader dense title="Separation history" icon={UserMinus} /></div>
        <DataTable rows={terminated} columns={columns} getRowId={(e) => e.id} pageSize={12}
          initialSort={{ key: 'date', dir: 'desc' }}
          empty={<EmptyState icon={UserMinus} title="No separations recorded" />} />
      </Card>
    </div>
  );
};

/* -------------------------------------------------- lifecycle modal */

const LifecycleModal = ({
  state, onClose,
}: { state: { action: LifecycleAction; employeeId: string } | null; onClose: () => void }) => {
  const { db, today } = useApp();
  const { lifecycleAction } = usePeopleActions();
  const lookups = useLookups();
  const emp = state ? db.employees.find((e) => e.id === state.employeeId) : null;

  const [form, setForm] = useState({
    effectiveDate: today, note: '',
    jobTitleId: '', departmentId: '', locationId: '', managerId: '',
    newSalary: 0, newHourlyRate: 0, changeReason: 'Merit increase',
    terminationReason: 'Voluntary — accepted another position', rehireEligible: true,
    leaveType: 'FMLA — medical leave',
  });
  const [initialised, setInitialised] = useState<string | null>(null);

  if (state && emp && initialised !== state.employeeId + state.action) {
    setInitialised(state.employeeId + state.action);
    setForm({
      effectiveDate: today, note: '',
      jobTitleId: emp.jobTitleId, departmentId: emp.departmentId, locationId: emp.locationId,
      managerId: emp.managerId ?? '',
      newSalary: emp.baseSalary, newHourlyRate: emp.hourlyRate,
      changeReason: 'Merit increase',
      terminationReason: 'Voluntary — accepted another position', rehireEligible: true,
      leaveType: 'FMLA — medical leave',
    });
  }

  if (!state || !emp) return null;
  const meta = ACTIONS.find((a) => a.id === state.action)!;
  const managers = db.employees.filter((e) => e.status === 'active' && e.id !== emp.id);

  const submit = () => {
    const patch: Partial<Employee> = {};
    let summary = meta.label;
    let newSalary: number | undefined;
    let newHourlyRate: number | undefined;

    switch (state.action) {
      case 'promotion':
        patch.jobTitleId = form.jobTitleId;
        patch.departmentId = form.departmentId;
        newSalary = form.newSalary;
        newHourlyRate = form.newHourlyRate;
        summary = `Promoted to ${lookups.jobTitle.get(form.jobTitleId)?.name}`;
        break;
      case 'compensation_change':
        newSalary = form.newSalary;
        newHourlyRate = form.newHourlyRate;
        summary = `${form.changeReason}`;
        break;
      case 'transfer':
        patch.departmentId = form.departmentId;
        patch.locationId = form.locationId;
        patch.payGroupId = ['loc_phx', 'loc_cmh', 'loc_sac'].includes(form.locationId) ? 'pg_field' : 'pg_corp';
        summary = `Transferred to ${lookups.department.get(form.departmentId)?.name}`;
        break;
      case 'manager_change':
        patch.managerId = form.managerId || null;
        summary = `Now reports to ${lookups.employee.get(form.managerId)?.lastName ?? 'no one'}`;
        break;
      case 'leave_start':
        patch.status = 'on_leave';
        summary = form.leaveType;
        break;
      case 'leave_return':
        patch.status = 'active';
        summary = 'Returned from leave';
        break;
      case 'termination':
        patch.status = 'terminated';
        patch.terminationDate = form.effectiveDate;
        patch.terminationReason = form.terminationReason;
        patch.rehireEligible = form.rehireEligible;
        summary = form.terminationReason;
        break;
      default:
        break;
    }

    lifecycleAction({
      employeeId: emp.id, action: state.action, effectiveDate: form.effectiveDate,
      note: form.note, patch, summary,
      newSalary: newSalary !== undefined && emp.payType === 'salary' ? newSalary : undefined,
      newHourlyRate: newHourlyRate !== undefined && emp.payType === 'hourly' ? newHourlyRate : undefined,
      changeReason: form.changeReason,
    });
    onClose();
  };

  const currentPay = emp.payType === 'salary' ? emp.baseSalary : emp.hourlyRate;
  const newPay = emp.payType === 'salary' ? form.newSalary : form.newHourlyRate;
  const delta = currentPay ? ((newPay - currentPay) / currentPay) * 100 : 0;

  return (
    <Modal
      open onClose={onClose} size="lg" icon={meta.icon}
      title={meta.label}
      subtitle={`${emp.firstName} ${emp.lastName} · ${lookups.jobTitle.get(emp.jobTitleId)?.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={state.action === 'termination' ? 'danger' : 'primary'} onClick={submit}>
            Record {meta.label.toLowerCase()}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-sunken p-3">
          <Avatar first={emp.firstName} last={emp.lastName} seed={emp.avatarSeed} size={38} />
          <div className="min-w-0">
            <p className="text-sm font-medium">{emp.firstName} {emp.lastName}</p>
            <p className="text-xs text-muted">
              {emp.employeeNumber} · {lookups.department.get(emp.departmentId)?.name} · {tenureLabel(emp.hireDate, today)} tenure
            </p>
          </div>
        </div>

        <Field label="Effective date" required>
          <Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
        </Field>

        {state.action === 'promotion' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New job title" required>
              <Select value={form.jobTitleId} onChange={(e) => setForm({ ...form, jobTitleId: e.target.value })}>
                {db.jobTitles.map((j) => <option key={j.id} value={j.id}>{j.name} ({j.level})</option>)}
              </Select>
            </Field>
            <Field label="Department">
              <Select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                {db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
          </div>
        ) : null}

        {['promotion', 'compensation_change'].includes(state.action) ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {emp.payType === 'salary' ? (
                <Field label="New annual salary" required>
                  <Input type="number" step="500" value={form.newSalary} onChange={(e) => setForm({ ...form, newSalary: Number(e.target.value) })} />
                </Field>
              ) : (
                <Field label="New hourly rate" required>
                  <Input type="number" step="0.25" value={form.newHourlyRate} onChange={(e) => setForm({ ...form, newHourlyRate: Number(e.target.value) })} />
                </Field>
              )}
              <Field label="Reason">
                <Select value={form.changeReason} onChange={(e) => setForm({ ...form, changeReason: e.target.value })}>
                  {['Merit increase', 'Promotion', 'Market adjustment', 'Equity adjustment', 'Role change', 'Correction'].map((r) => <option key={r}>{r}</option>)}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="well p-3"><p className="text-2xs text-faint">Current</p><p className="tnum text-sm font-semibold">{emp.payType === 'salary' ? currency(currentPay, { cents: false }) : `${currency(currentPay)}/hr`}</p></div>
              <div className="well p-3"><p className="text-2xs text-faint">New</p><p className="tnum text-sm font-semibold">{emp.payType === 'salary' ? currency(newPay, { cents: false }) : `${currency(newPay)}/hr`}</p></div>
              <div className="well p-3"><p className="text-2xs text-faint">Change</p><p className={cx('tnum text-sm font-semibold', delta > 0 ? 'text-success-600' : delta < 0 ? 'text-danger-600' : '')}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</p></div>
            </div>
          </>
        ) : null}

        {state.action === 'transfer' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New department" required>
              <Select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                {db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="New location" required hint="Changing location may change the pay group and tax jurisdiction.">
              <Select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                {db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          </div>
        ) : null}

        {state.action === 'manager_change' ? (
          <Field label="New manager" required>
            <Select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
              <option value="">No manager</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.preferredName} {m.lastName} — {lookups.jobTitle.get(m.jobTitleId)?.name}</option>)}
            </Select>
          </Field>
        ) : null}

        {state.action === 'leave_start' ? (
          <Field label="Leave type" required>
            <Select value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })}>
              {['FMLA — medical leave', 'Parental leave', 'Personal leave of absence', 'Military leave', 'Workers compensation'].map((l) => <option key={l}>{l}</option>)}
            </Select>
          </Field>
        ) : null}

        {state.action === 'termination' ? (
          <>
            <Field label="Separation reason" required>
              <Select value={form.terminationReason} onChange={(e) => setForm({ ...form, terminationReason: e.target.value })}>
                {[
                  'Voluntary — accepted another position', 'Voluntary — relocation', 'Voluntary — personal reasons',
                  'Voluntary — retirement', 'Involuntary — performance', 'Involuntary — attendance',
                  'Involuntary — policy violation', 'End of assignment', 'Reduction in force',
                ].map((r) => <option key={r}>{r}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.rehireEligible} onChange={(e) => setForm({ ...form, rehireEligible: e.target.checked })} className="h-4 w-4 accent-[#5B3FD6]" />
              Eligible for rehire
            </label>
            <Alert tone="warning" icon={AlertTriangle} title="This action has downstream effects">
              The user account is disabled and all sessions ended, benefits terminate at month end, the employee is
              excluded from future payroll runs, and their final pay is calculated on the next scheduled check date.
            </Alert>
          </>
        ) : null}

        <Field label="Note" hint="Stored with the employment event and visible in the employee's history.">
          <Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};
