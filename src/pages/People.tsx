import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2, Download, MapPin, Network, Plus, Users,
} from 'lucide-react';
import {
  Avatar, Badge, Button, Card, Column, DataTable, EmptyState, FilterBar,
  PermissionDenied, SearchInput, SectionHeader, Select, SegmentedControl, StatTile,
  StatusBadge, cx,
} from '@/components/ui';
import { useApp, useLookups } from '@/lib/store';
import { headcountStats } from '@/lib/selectors';
import { currency, num, phoneFmt, toCsv, downloadText } from '@/lib/format';
import { fmtDate, tenureLabel } from '@/lib/dates';
import type { Employee } from '@/lib/types';

type View = 'table' | 'cards' | 'org';

export const PeoplePage = () => {
  const { db, can, visibleIds, today, employee } = useApp();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('table');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [type, setType] = useState('all');

  const department = params.get('department') ?? 'all';
  const location = params.get('location') ?? 'all';
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };

  const scope = visibleIds('people');
  if (!can('people.view.self', 'people.view.team', 'people.view.all')) {
    return <PermissionDenied what="the employee directory" />;
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.employees
      .filter((e) => scope.has(e.id))
      .filter((e) => (status === 'all' ? true : e.status === status))
      .filter((e) => (department === 'all' ? true : e.departmentId === department))
      .filter((e) => (location === 'all' ? true : e.locationId === location))
      .filter((e) => (type === 'all' ? true : e.employmentType === type))
      .filter((e) => !q ||
        `${e.firstName} ${e.lastName} ${e.preferredName} ${e.email} ${e.employeeNumber} ${lookups.jobTitle.get(e.jobTitleId)?.name ?? ''}`
          .toLowerCase().includes(q))
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  }, [db.employees, scope, status, department, location, type, query, lookups]);

  const stats = headcountStats(db, today);
  const canSeePay = can('people.sensitive.view');

  const columns: Column<Employee>[] = [
    {
      key: 'name', header: 'Employee', width: '24%',
      sortValue: (e) => `${e.lastName} ${e.firstName}`,
      render: (e) => (
        <span className="flex items-center gap-2.5">
          <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={30} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{e.firstName} {e.lastName}</span>
            <span className="block truncate text-xs text-muted">{e.employeeNumber} · {e.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'title', header: 'Job title', sortValue: (e) => lookups.jobTitle.get(e.jobTitleId)?.name ?? '',
      render: (e) => (
        <span>
          <span className="block text-sm">{lookups.jobTitle.get(e.jobTitleId)?.name}</span>
          <span className="block text-xs text-muted">{lookups.jobTitle.get(e.jobTitleId)?.level}</span>
        </span>
      ),
    },
    {
      key: 'department', header: 'Department', hideBelow: 'md',
      sortValue: (e) => lookups.department.get(e.departmentId)?.name ?? '',
      render: (e) => <span className="text-sm">{lookups.department.get(e.departmentId)?.name}</span>,
    },
    {
      key: 'location', header: 'Location', hideBelow: 'lg',
      sortValue: (e) => lookups.location.get(e.locationId)?.code ?? '',
      render: (e) => (
        <span className="flex items-center gap-1.5 text-sm">
          <MapPin className="h-3 w-3 text-faint" />
          {lookups.location.get(e.locationId)?.code}
          {e.remote ? <Badge tone="teal">Remote</Badge> : null}
        </span>
      ),
    },
    {
      key: 'manager', header: 'Manager', hideBelow: 'lg',
      sortValue: (e) => lookups.employee.get(e.managerId ?? '')?.lastName ?? '',
      render: (e) => {
        const m = lookups.employee.get(e.managerId ?? '');
        return <span className="text-sm">{m ? `${m.preferredName} ${m.lastName}` : '—'}</span>;
      },
    },
    ...(canSeePay ? [{
      key: 'pay', header: 'Compensation', align: 'right' as const, hideBelow: 'lg' as const,
      sortValue: (e: Employee) => (e.payType === 'salary' ? e.baseSalary : e.hourlyRate * 2080),
      render: (e: Employee) => (
        <span className="text-sm">
          {e.payType === 'salary' ? currency(e.baseSalary, { cents: false }) : `${currency(e.hourlyRate)}/hr`}
        </span>
      ),
    }] : []),
    {
      key: 'tenure', header: 'Tenure', align: 'right', hideBelow: 'md',
      sortValue: (e) => e.hireDate,
      render: (e) => (
        <span>
          <span className="block text-sm">{tenureLabel(e.hireDate, today)}</span>
          <span className="block text-xs text-muted">{fmtDate(e.hireDate)}</span>
        </span>
      ),
    },
    {
      key: 'status', header: 'Status', align: 'center',
      sortValue: (e) => e.status,
      render: (e) => <StatusBadge status={e.status} />,
    },
  ];

  const exportCsv = () => {
    downloadText(
      `meridian-directory-${today}.csv`,
      toCsv(rows.map((e) => ({
        employee_number: e.employeeNumber,
        first_name: e.firstName,
        last_name: e.lastName,
        email: e.email,
        job_title: lookups.jobTitle.get(e.jobTitleId)?.name ?? '',
        department: lookups.department.get(e.departmentId)?.name ?? '',
        location: lookups.location.get(e.locationId)?.name ?? '',
        manager: lookups.employee.get(e.managerId ?? '')
          ? `${lookups.employee.get(e.managerId ?? '')!.firstName} ${lookups.employee.get(e.managerId ?? '')!.lastName}` : '',
        status: e.status,
        employment_type: e.employmentType,
        hire_date: e.hireDate,
        ...(canSeePay ? { pay_type: e.payType, annual_salary: e.baseSalary, hourly_rate: e.hourlyRate } : {}),
      }))),
    );
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="People"
        subtitle={can('people.view.all')
          ? 'Every employee record in the organization, filtered to what your role allows.'
          : 'Your team. Records outside your reporting line are hidden by permission.'}
        actions={
          <>
            <Button icon={Download} onClick={exportCsv}>Export</Button>
            {can('people.lifecycle.manage') ? (
              <Button variant="primary" icon={Plus} onClick={() => navigate('/hr?action=hire')}>Add employee</Button>
            ) : null}
          </>
        }
      />

      {can('people.view.all') ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Active" value={num(stats.active)} icon={Users} />
          <StatTile label="On leave" value={num(stats.onLeave)} icon={Users} tone="warning" />
          <StatTile label="Starting soon" value={num(stats.pending)} icon={Users} tone="teal" hint="Pre-start records" />
          <StatTile label="New in 90 days" value={num(stats.newHires90)} icon={Users} tone="accent" />
        </div>
      ) : null}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search name, email, employee number…" className="min-w-[15rem] flex-1" />
          <FilterBar>
            <Select value={department} onChange={(e) => setParam('department', e.target.value)} className="w-auto">
              <option value="all">All departments</option>
              {db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Select value={location} onChange={(e) => setParam('location', e.target.value)} className="w-auto">
              <option value="all">All locations</option>
              {db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
              <option value="active">Active</option>
              <option value="on_leave">On leave</option>
              <option value="pending_hire">Pre-start</option>
              <option value="terminated">Terminated</option>
              <option value="all">All statuses</option>
            </Select>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto">
              <option value="all">All types</option>
              <option value="full_time">Full time</option>
              <option value="part_time">Part time</option>
              <option value="temp">Temporary</option>
              <option value="intern">Intern</option>
            </Select>
            <SegmentedControl
              value={view}
              onChange={setView}
              options={[{ value: 'table', label: 'Table' }, { value: 'cards', label: 'Cards' }, { value: 'org', label: 'Org' }]}
            />
          </FilterBar>
        </div>

        {view === 'table' ? (
          <DataTable
            rows={rows}
            columns={columns}
            getRowId={(e) => e.id}
            onRowClick={(e) => navigate(`/people/${e.id}`)}
            pageSize={16}
            initialSort={{ key: 'name', dir: 'asc' }}
            empty={<EmptyState icon={Users} title="No people match those filters" body="Try clearing a filter or searching a different name." />}
          />
        ) : null}

        {view === 'cards' ? (
          rows.length === 0
            ? <EmptyState icon={Users} title="No people match those filters" />
            : (
              <ul className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                {rows.slice(0, 60).map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => navigate(`/people/${e.id}`)}
                      className="flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left transition-all hover:border-brand-300 hover:shadow-raised"
                    >
                      <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={42} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{e.firstName} {e.lastName}</span>
                          <StatusBadge status={e.status} />
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">{lookups.jobTitle.get(e.jobTitleId)?.name}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-faint">
                          <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{lookups.department.get(e.departmentId)?.name}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lookups.location.get(e.locationId)?.code}</span>
                        </span>
                        <span className="mt-1.5 block truncate text-2xs text-faint">{phoneFmt(e.phone)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
        ) : null}

        {view === 'org' ? <OrgChart rows={rows} rootId={can('people.view.all') ? null : employee?.id ?? null} /> : null}
      </Card>
    </div>
  );
};

/* ------------------------------------------------------------ org chart */

const OrgChart = ({ rows, rootId }: { rows: Employee[]; rootId: string | null }) => {
  const { db } = useApp();
  const lookups = useLookups();
  const navigate = useNavigate();
  const visible = new Set(rows.map((r) => r.id));

  const roots = rootId
    ? db.employees.filter((e) => e.id === rootId)
    : db.employees.filter((e) => !e.managerId && e.status === 'active');

  const Node = ({ emp, depth }: { emp: Employee; depth: number }) => {
    const reports = db.employees
      .filter((e) => e.managerId === emp.id && e.status === 'active')
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
    const [open, setOpen] = useState(depth < 2);
    const dimmed = !visible.has(emp.id);

    return (
      <li>
        <div className={cx('flex items-center gap-2 py-1', dimmed && 'opacity-45')}>
          {reports.length ? (
            <button
              onClick={() => setOpen((v) => !v)}
              className="grid h-5 w-5 shrink-0 place-items-center rounded border border-line text-2xs text-muted hover:bg-sunken"
              aria-label={open ? 'Collapse' : 'Expand'}
            >
              {open ? '−' : '+'}
            </button>
          ) : <span className="w-5" />}
          <button
            onClick={() => navigate(`/people/${emp.id}`)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sunken"
          >
            <Avatar first={emp.firstName} last={emp.lastName} seed={emp.avatarSeed} size={26} />
            <span className="min-w-0">
              <span className="block truncate text-sm">{emp.firstName} {emp.lastName}</span>
              <span className="block truncate text-xs text-muted">
                {lookups.jobTitle.get(emp.jobTitleId)?.name} · {lookups.location.get(emp.locationId)?.code}
              </span>
            </span>
            {reports.length ? <Badge tone="neutral" className="ml-auto">{reports.length}</Badge> : null}
          </button>
        </div>
        {open && reports.length ? (
          <ul className="ml-4 border-l border-line pl-3">
            {reports.map((r) => <Node key={r.id} emp={r} depth={depth + 1} />)}
          </ul>
        ) : null}
      </li>
    );
  };

  if (!roots.length) return <EmptyState icon={Network} title="No org chart available" body="You need visibility of a reporting line to see the chart." />;

  return (
    <div className="p-3">
      <ul>{roots.map((r) => <Node key={r.id} emp={r} depth={0} />)}</ul>
    </div>
  );
};
