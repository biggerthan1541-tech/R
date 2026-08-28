import { useMemo, useState } from 'react';
import {
  BarChart3, CalendarClock, Download, FileText, Filter, Play, Search,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, PermissionDenied,
  SearchInput, SectionHeader, Select, StatusBadge, Tabs, cx,
} from '@/components/ui';
import { useApp, useLookups } from '@/lib/store';
import { currency, downloadText, num, toCsv } from '@/lib/format';
import { addDays, diffDays, fmtDate, tenureLabel } from '@/lib/dates';
import type { Database } from '@/lib/types';

interface ReportFilters {
  from: string;
  to: string;
  departmentId: string;
  locationId: string;
  status: string;
}

interface ReportDef {
  id: string;
  name: string;
  category: 'People' | 'Payroll' | 'Time' | 'Benefits' | 'Talent' | 'Finance' | 'Compliance';
  description: string;
  permission: string;
  columns: string[];
  run: (db: Database, f: ReportFilters, lookups: ReturnType<typeof useLookups>) => Record<string, unknown>[];
}

const inRange = (date: string, f: ReportFilters) => date >= f.from && date <= f.to;

const REPORTS: ReportDef[] = [
  {
    id: 'headcount', name: 'Headcount roster', category: 'People', permission: 'people.view.all',
    description: 'Every employee with job, department, location, manager, tenure and status.',
    columns: ['employee_number', 'name', 'job_title', 'department', 'location', 'manager', 'employment_type', 'status', 'hire_date', 'tenure'],
    run: (db, f, l) => db.employees
      .filter((e) => (f.status === 'all' ? true : e.status === f.status))
      .filter((e) => (f.departmentId === 'all' ? true : e.departmentId === f.departmentId))
      .filter((e) => (f.locationId === 'all' ? true : e.locationId === f.locationId))
      .map((e) => ({
        employee_number: e.employeeNumber,
        name: `${e.firstName} ${e.lastName}`,
        job_title: l.jobTitle.get(e.jobTitleId)?.name ?? '',
        department: l.department.get(e.departmentId)?.name ?? '',
        location: l.location.get(e.locationId)?.name ?? '',
        manager: (() => { const m = l.employee.get(e.managerId ?? ''); return m ? `${m.firstName} ${m.lastName}` : ''; })(),
        employment_type: e.employmentType,
        status: e.status,
        hire_date: e.hireDate,
        tenure: tenureLabel(e.hireDate, db.meta.today),
      })),
  },
  {
    id: 'turnover', name: 'Turnover and separations', category: 'People', permission: 'people.view.all',
    description: 'Separations in the selected window with reason, tenure and rehire eligibility.',
    columns: ['name', 'department', 'job_title', 'hire_date', 'separation_date', 'tenure', 'reason', 'rehire_eligible'],
    run: (db, f, l) => db.employees
      .filter((e) => e.terminationDate && inRange(e.terminationDate, f))
      .filter((e) => (f.departmentId === 'all' ? true : e.departmentId === f.departmentId))
      .map((e) => ({
        name: `${e.firstName} ${e.lastName}`,
        department: l.department.get(e.departmentId)?.name ?? '',
        job_title: l.jobTitle.get(e.jobTitleId)?.name ?? '',
        hire_date: e.hireDate,
        separation_date: e.terminationDate,
        tenure: tenureLabel(e.hireDate, e.terminationDate!),
        reason: e.terminationReason ?? '',
        rehire_eligible: e.rehireEligible ? 'Yes' : 'No',
      })),
  },
  {
    id: 'payroll_register', name: 'Payroll register', category: 'Payroll', permission: 'payroll.view.all',
    description: 'Gross-to-net detail for every check issued in the window.',
    columns: ['check_date', 'employee', 'department', 'hours', 'gross', 'taxes', 'deductions', 'net', 'method'],
    run: (db, f, l) => db.paychecks
      .filter((c) => inRange(c.checkDate, f))
      .filter((c) => {
        const e = l.employee.get(c.employeeId);
        return f.departmentId === 'all' || e?.departmentId === f.departmentId;
      })
      .map((c) => {
        const e = l.employee.get(c.employeeId);
        return {
          check_date: c.checkDate,
          employee: e ? `${e.firstName} ${e.lastName}` : '',
          department: l.department.get(e?.departmentId ?? '')?.name ?? '',
          hours: c.totalHours,
          gross: c.grossPay,
          taxes: Number(c.taxes.reduce((s, t) => s + t.amount, 0).toFixed(2)),
          deductions: Number(c.deductions.reduce((s, d) => s + d.amount, 0).toFixed(2)),
          net: c.netPay,
          method: c.method,
        };
      }),
  },
  {
    id: 'labor_cost', name: 'Labor cost by department', category: 'Finance', permission: 'payroll.view.all',
    description: 'Fully loaded labor cost including employer taxes and benefit contributions.',
    columns: ['department', 'cost_center', 'employees', 'hours', 'gross', 'employer_taxes', 'employer_benefits', 'total_cost'],
    run: (db, f, l) => {
      const map = new Map<string, { employees: Set<string>; hours: number; gross: number; erTax: number; erBen: number }>();
      for (const c of db.paychecks.filter((x) => inRange(x.checkDate, f))) {
        const e = l.employee.get(c.employeeId);
        if (!e) continue;
        const cur = map.get(e.departmentId) ?? { employees: new Set<string>(), hours: 0, gross: 0, erTax: 0, erBen: 0 };
        cur.employees.add(e.id);
        cur.hours += c.totalHours;
        cur.gross += c.grossPay;
        cur.erTax += c.taxes.reduce((s, t) => s + t.employerAmount, 0);
        cur.erBen += c.deductions.reduce((s, d) => s + d.employerAmount, 0);
        map.set(e.departmentId, cur);
      }
      return [...map.entries()].map(([id, v]) => ({
        department: l.department.get(id)?.name ?? id,
        cost_center: l.department.get(id)?.costCenter ?? '',
        employees: v.employees.size,
        hours: Number(v.hours.toFixed(2)),
        gross: Number(v.gross.toFixed(2)),
        employer_taxes: Number(v.erTax.toFixed(2)),
        employer_benefits: Number(v.erBen.toFixed(2)),
        total_cost: Number((v.gross + v.erTax + v.erBen).toFixed(2)),
      })).sort((a, b) => b.total_cost - a.total_cost);
    },
  },
  {
    id: 'overtime', name: 'Overtime analysis', category: 'Time', permission: 'time.view.all',
    description: 'Overtime and double-time hours by employee for the selected pay periods.',
    columns: ['employee', 'department', 'period_start', 'period_end', 'regular', 'overtime', 'double_time', 'ot_percent'],
    run: (db, f, l) => db.timecards
      .filter((t) => inRange(t.periodEnd, f) && (t.totalOvertime > 0 || t.totalDoubleTime > 0))
      .filter((t) => {
        const e = l.employee.get(t.employeeId);
        return f.departmentId === 'all' || e?.departmentId === f.departmentId;
      })
      .map((t) => {
        const e = l.employee.get(t.employeeId);
        const worked = t.totalRegular + t.totalOvertime + t.totalDoubleTime;
        return {
          employee: e ? `${e.firstName} ${e.lastName}` : '',
          department: l.department.get(e?.departmentId ?? '')?.name ?? '',
          period_start: t.periodStart,
          period_end: t.periodEnd,
          regular: t.totalRegular,
          overtime: t.totalOvertime,
          double_time: t.totalDoubleTime,
          ot_percent: worked ? Number((((t.totalOvertime + t.totalDoubleTime) / worked) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.overtime - a.overtime),
  },
  {
    id: 'attendance', name: 'Attendance exceptions', category: 'Time', permission: 'time.view.all',
    description: 'Missed punches, short breaks, late arrivals and geofence exceptions.',
    columns: ['employee', 'department', 'date', 'exception', 'severity', 'resolved'],
    run: (db, f, l) => db.timecards
      .flatMap((t) => t.days.flatMap((d) => d.exceptions.map((x) => ({ t, d, x }))))
      .filter(({ d, x }) => inRange(d.date, f) && x.severity !== 'info')
      .filter(({ t }) => {
        const e = l.employee.get(t.employeeId);
        return f.departmentId === 'all' || e?.departmentId === f.departmentId;
      })
      .slice(0, 500)
      .map(({ t, d, x }) => {
        const e = l.employee.get(t.employeeId);
        return {
          employee: e ? `${e.firstName} ${e.lastName}` : '',
          department: l.department.get(e?.departmentId ?? '')?.name ?? '',
          date: d.date,
          exception: x.message,
          severity: x.severity,
          resolved: x.resolved ? 'Yes' : 'No',
        };
      }),
  },
  {
    id: 'pto_liability', name: 'PTO balance and liability', category: 'People', permission: 'pto.view.all',
    description: 'Accrued balances with the dollar liability they represent.',
    columns: ['employee', 'department', 'kind', 'accrued', 'used', 'pending', 'available', 'hourly_value', 'liability'],
    run: (db, f, l) => db.ptoBalances
      .filter((b) => {
        const e = l.employee.get(b.employeeId);
        if (!e || e.status === 'terminated') return false;
        return f.departmentId === 'all' || e.departmentId === f.departmentId;
      })
      .map((b) => {
        const e = l.employee.get(b.employeeId)!;
        const rate = e.payType === 'hourly' ? e.hourlyRate : e.baseSalary / 2080;
        const available = b.accruedHours + b.carryoverHours - b.usedHours - b.pendingHours;
        return {
          employee: `${e.firstName} ${e.lastName}`,
          department: l.department.get(e.departmentId)?.name ?? '',
          kind: b.kind,
          accrued: Number((b.accruedHours + b.carryoverHours).toFixed(2)),
          used: b.usedHours,
          pending: b.pendingHours,
          available: Number(available.toFixed(2)),
          hourly_value: Number(rate.toFixed(2)),
          liability: Number((available * rate).toFixed(2)),
        };
      })
      .sort((a, b) => b.liability - a.liability),
  },
  {
    id: 'benefits_enrollment', name: 'Benefits enrollment', category: 'Benefits', permission: 'benefits.view.all',
    description: 'Active elections with employee and employer cost per pay period.',
    columns: ['employee', 'department', 'plan', 'type', 'tier', 'effective_date', 'employee_cost', 'employer_cost', 'dependents'],
    run: (db, _f, l) => db.benefitEnrollments
      .filter((en) => en.status === 'active')
      .map((en) => {
        const e = l.employee.get(en.employeeId);
        const p = l.plan.get(en.planId);
        return {
          employee: e ? `${e.firstName} ${e.lastName}` : '',
          department: l.department.get(e?.departmentId ?? '')?.name ?? '',
          plan: p?.name ?? '',
          type: p?.type ?? '',
          tier: en.tier,
          effective_date: en.effectiveDate,
          employee_cost: en.employeeCostPerPay,
          employer_cost: en.employerCostPerPay,
          dependents: en.dependentIds.length,
        };
      }),
  },
  {
    id: 'recruiting', name: 'Recruiting pipeline', category: 'Talent', permission: 'recruiting.view',
    description: 'Every application with stage, source, score and days in process.',
    columns: ['candidate', 'requisition', 'department', 'stage', 'source', 'score', 'applied', 'days_in_process'],
    run: (db, f, l) => db.applications
      .filter((a) => inRange(a.appliedAt.slice(0, 10), f))
      .map((a) => {
        const c = l.candidate.get(a.candidateId);
        const r = l.requisition.get(a.requisitionId);
        return {
          candidate: c ? `${c.firstName} ${c.lastName}` : '',
          requisition: r ? `${r.code} — ${r.title}` : '',
          department: l.department.get(r?.departmentId ?? '')?.name ?? '',
          stage: a.stage,
          source: c?.source ?? '',
          score: a.score,
          applied: a.appliedAt.slice(0, 10),
          days_in_process: diffDays(a.appliedAt.slice(0, 10), db.meta.today),
        };
      }),
  },
  {
    id: 'training', name: 'Training compliance', category: 'Compliance', permission: 'reports.view',
    description: 'Assignment status for required and elective courses.',
    columns: ['employee', 'department', 'course', 'category', 'mandatory', 'assigned', 'due', 'status', 'progress', 'score'],
    run: (db, _f, l) => db.trainingAssignments.map((a) => {
      const e = l.employee.get(a.employeeId);
      const c = l.course.get(a.courseId);
      return {
        employee: e ? `${e.firstName} ${e.lastName}` : '',
        department: l.department.get(e?.departmentId ?? '')?.name ?? '',
        course: c?.title ?? '',
        category: c?.category ?? '',
        mandatory: c?.mandatory ? 'Yes' : 'No',
        assigned: a.assignedAt.slice(0, 10),
        due: a.dueDate,
        status: a.status,
        progress: a.progressPercent,
        score: a.score ?? '',
      };
    }),
  },
  {
    id: 'performance', name: 'Performance ratings', category: 'Talent', permission: 'performance.view.all',
    description: 'Review stage and ratings for the current and prior cycles.',
    columns: ['employee', 'department', 'cycle', 'stage', 'self_rating', 'manager_rating', 'final_rating', 'merit_percent'],
    run: (db, _f, l) => db.reviews.map((r) => {
      const e = l.employee.get(r.employeeId);
      const c = db.reviewCycles.find((x) => x.id === r.cycleId);
      return {
        employee: e ? `${e.firstName} ${e.lastName}` : '',
        department: l.department.get(e?.departmentId ?? '')?.name ?? '',
        cycle: c?.name ?? '',
        stage: r.stage,
        self_rating: r.selfRating ?? '',
        manager_rating: r.managerRating ?? '',
        final_rating: r.finalRating ?? '',
        merit_percent: r.merit?.increasePercent ?? '',
      };
    }),
  },
  {
    id: 'expenses', name: 'Expense detail', category: 'Finance', permission: 'expense.view.all',
    description: 'Line-item expense detail with policy flags and reimbursement status.',
    columns: ['date', 'employee', 'department', 'category', 'merchant', 'amount', 'project', 'status', 'flags'],
    run: (db, f, l) => db.expenses
      .filter((e) => inRange(e.date, f))
      .map((x) => {
        const e = l.employee.get(x.employeeId);
        return {
          date: x.date,
          employee: e ? `${e.firstName} ${e.lastName}` : '',
          department: l.department.get(e?.departmentId ?? '')?.name ?? '',
          category: x.category,
          merchant: x.merchant,
          amount: x.amount,
          project: x.projectCode,
          status: x.status,
          flags: x.policyFlags.join('; '),
        };
      }),
  },
  {
    id: 'compensation', name: 'Compensation review', category: 'Payroll', permission: 'people.sensitive.view',
    description: 'Current pay against the approved band, with compa-ratio.',
    columns: ['employee', 'job_title', 'department', 'level', 'pay_type', 'current_pay', 'band_min', 'band_max', 'compa_ratio'],
    run: (db, f, l) => db.employees
      .filter((e) => e.status === 'active')
      .filter((e) => (f.departmentId === 'all' ? true : e.departmentId === f.departmentId))
      .map((e) => {
        const j = l.jobTitle.get(e.jobTitleId);
        const pay = e.payType === 'salary' ? e.baseSalary : e.hourlyRate;
        const mid = j ? (j.minSalary + j.maxSalary) / 2 : 0;
        return {
          employee: `${e.firstName} ${e.lastName}`,
          job_title: j?.name ?? '',
          department: l.department.get(e.departmentId)?.name ?? '',
          level: j?.level ?? '',
          pay_type: e.payType,
          current_pay: pay,
          band_min: j?.minSalary ?? 0,
          band_max: j?.maxSalary ?? 0,
          compa_ratio: mid ? Number((pay / mid).toFixed(2)) : 0,
        };
      })
      .sort((a, b) => a.compa_ratio - b.compa_ratio),
  },
  {
    id: 'demographics', name: 'EEO demographics', category: 'Compliance', permission: 'reports.view.all',
    description: 'Aggregated workforce composition by EEO job category.',
    columns: ['eeo_category', 'employees', 'female', 'male', 'non_binary', 'undisclosed', 'veterans'],
    run: (db, _f, l) => {
      const map = new Map<string, { total: number; female: number; male: number; nb: number; und: number; vet: number }>();
      for (const e of db.employees.filter((x) => x.status === 'active')) {
        const cat = l.jobTitle.get(e.jobTitleId)?.eeoCategory ?? 'Unclassified';
        const cur = map.get(cat) ?? { total: 0, female: 0, male: 0, nb: 0, und: 0, vet: 0 };
        cur.total++;
        if (e.gender === 'female') cur.female++;
        else if (e.gender === 'male') cur.male++;
        else if (e.gender === 'non_binary') cur.nb++;
        else cur.und++;
        if (e.veteranStatus === 'veteran') cur.vet++;
        map.set(cat, cur);
      }
      return [...map.entries()].map(([cat, v]) => ({
        eeo_category: cat, employees: v.total, female: v.female, male: v.male,
        non_binary: v.nb, undisclosed: v.und, veterans: v.vet,
      }));
    },
  },
  {
    id: 'scheduling', name: 'Scheduled versus worked', category: 'Time', permission: 'schedule.view.all',
    description: 'Published shift hours compared with recorded time.',
    columns: ['employee', 'department', 'location', 'shifts', 'scheduled_hours'],
    run: (db, f, l) => {
      const map = new Map<string, { shifts: number; hours: number }>();
      for (const s of db.shifts.filter((x) => inRange(x.date, f) && x.employeeId)) {
        const cur = map.get(s.employeeId!) ?? { shifts: 0, hours: 0 };
        const [sh, sm] = s.start.split(':').map(Number);
        const [eh, em] = s.end.split(':').map(Number);
        let mins = eh * 60 + em - (sh * 60 + sm);
        if (mins < 0) mins += 1440;
        cur.shifts++;
        cur.hours += (mins - s.breakMinutes) / 60;
        map.set(s.employeeId!, cur);
      }
      return [...map.entries()].map(([id, v]) => {
        const e = l.employee.get(id);
        return {
          employee: e ? `${e.firstName} ${e.lastName}` : '',
          department: l.department.get(e?.departmentId ?? '')?.name ?? '',
          location: l.location.get(e?.locationId ?? '')?.name ?? '',
          shifts: v.shifts,
          scheduled_hours: Number(v.hours.toFixed(2)),
        };
      }).sort((a, b) => b.scheduled_hours - a.scheduled_hours);
    },
  },
];

export const ReportsPage = () => {
  const { db, can, today } = useApp();
  const lookups = useLookups();
  const [tab, setTab] = useState('catalog');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({
    from: addDays(today, -180), to: today, departmentId: 'all', locationId: 'all', status: 'active',
  });

  if (!can('reports.view', 'reports.view.all')) return <PermissionDenied what="reports" />;

  const available = REPORTS.filter((r) => can(r.permission as never));
  const shown = available
    .filter((r) => (category === 'all' ? true : r.category === category))
    .filter((r) => {
      const q = query.trim().toLowerCase();
      return !q || `${r.name} ${r.description}`.toLowerCase().includes(q);
    });

  const active = activeId ? available.find((r) => r.id === activeId) ?? null : null;
  const rows = useMemo(
    () => (active ? active.run(db, filters, lookups) : []),
    [active, db, filters, lookups],
  );

  const tabs = [
    { id: 'catalog', label: 'Report catalog', count: available.length, icon: FileText },
    { id: 'scheduled', label: 'Scheduled reports', icon: CalendarClock },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Reports"
        subtitle="Standard reports across every module, filtered to what your role can see and exportable as CSV."
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'catalog' ? (
        <div className="grid gap-5 lg:grid-cols-[19rem_1fr]">
          <div className="space-y-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Search reports…" />
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {['People', 'Payroll', 'Time', 'Benefits', 'Talent', 'Finance', 'Compliance'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
            <ul className="space-y-1.5">
              {shown.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setActiveId(r.id)}
                    className={cx('w-full rounded-lg border p-3 text-left transition-colors',
                      activeId === r.id ? 'border-brand-400 bg-brand-50' : 'border-line hover:bg-sunken')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{r.name}</span>
                      <Badge tone="neutral">{r.category}</Badge>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{r.description}</p>
                  </button>
                </li>
              ))}
            </ul>
            {shown.length === 0 ? <EmptyState compact icon={Search} title="No reports match" /> : null}
          </div>

          <div className="min-w-0">
            {!active ? (
              <Card>
                <EmptyState icon={BarChart3} title="Choose a report"
                  body="Pick a report from the catalog to set filters and preview the results before exporting." />
              </Card>
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader title={active.name} subtitle={active.description} icon={Filter} />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <Field label="From"><Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
                    <Field label="To"><Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
                    <Field label="Department">
                      <Select value={filters.departmentId} onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}>
                        <option value="all">All</option>
                        {db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Location">
                      <Select value={filters.locationId} onChange={(e) => setFilters({ ...filters, locationId: e.target.value })}>
                        <option value="all">All</option>
                        {db.locations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
                      </Select>
                    </Field>
                    <Field label="Employee status">
                      <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                        <option value="active">Active</option>
                        <option value="all">All statuses</option>
                        <option value="terminated">Terminated</option>
                        <option value="on_leave">On leave</option>
                      </Select>
                    </Field>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <p className="text-sm text-muted">
                      <span className="tnum font-semibold text-ink">{num(rows.length)}</span> rows ·
                      {' '}{fmtDate(filters.from)} – {fmtDate(filters.to)}
                    </p>
                    <div className="flex gap-2">
                      <Button icon={Play} onClick={() => setFilters({ ...filters })}>Re-run</Button>
                      <Button variant="primary" icon={Download} disabled={!rows.length}
                        onClick={() => downloadText(`${active.id}-${today}.csv`, toCsv(rows, active.columns))}>
                        Export CSV
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card padded={false}>
                  {rows.length === 0 ? (
                    <EmptyState icon={FileText} title="No rows returned" body="Try widening the date range or clearing a filter." />
                  ) : (
                    <div className="scroll-x" style={{ maxHeight: '32rem', overflowY: 'auto' }}>
                      <table className="dt">
                        <thead>
                          <tr>{active.columns.map((c) => <th key={c} className="capitalize">{c.replace(/_/g, ' ')}</th>)}</tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 200).map((row, i) => (
                            <tr key={i}>
                              {active.columns.map((c) => {
                                const v = row[c];
                                const isMoney = /gross|net|cost|amount|salary|pay|liability|taxes|deductions/.test(c) && typeof v === 'number';
                                return (
                                  <td key={c} className={cx(typeof v === 'number' && 'text-right tnum')}>
                                    {isMoney ? currency(v as number) : String(v ?? '')}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {rows.length > 200 ? (
                    <p className="border-t border-line px-4 py-2 text-xs text-muted">
                      Showing the first 200 of {num(rows.length)} rows. Export to CSV for the full result.
                    </p>
                  ) : null}
                </Card>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'scheduled' ? <ScheduledReports /> : null}
    </div>
  );
};

const SCHEDULES = [
  { name: 'Weekly overtime summary', report: 'Overtime analysis', cadence: 'Every Monday, 6:00 AM', recipients: 'Operations directors, Payroll', format: 'CSV', status: 'active' },
  { name: 'Payroll register archive', report: 'Payroll register', cadence: 'Each pay date', recipients: 'Payroll, Finance', format: 'CSV', status: 'active' },
  { name: 'Headcount roster', report: 'Headcount roster', cadence: 'First of the month', recipients: 'People Operations, Executive', format: 'CSV', status: 'active' },
  { name: 'Training compliance', report: 'Training compliance', cadence: 'Every Friday, 4:00 PM', recipients: 'People Operations', format: 'CSV', status: 'active' },
  { name: 'PTO liability', report: 'PTO balance and liability', cadence: 'Quarter end', recipients: 'Finance', format: 'CSV', status: 'paused' },
];

const ScheduledReports = () => (
  <div className="space-y-4">
    <Alert tone="info" icon={CalendarClock} title="Scheduled delivery">
      Scheduled reports run on the server and are delivered by email to the named recipients. Delivery respects
      the recipient's permissions — a report never sends data the recipient could not run themselves.
    </Alert>
    <Card padded={false}>
      <div className="scroll-x">
        <table className="dt">
          <thead><tr><th>Schedule</th><th>Report</th><th>Cadence</th><th>Recipients</th><th>Format</th><th className="text-center">Status</th></tr></thead>
          <tbody>
            {SCHEDULES.map((s) => (
              <tr key={s.name}>
                <td className="text-sm font-medium">{s.name}</td>
                <td className="text-sm">{s.report}</td>
                <td className="text-sm text-muted">{s.cadence}</td>
                <td className="text-sm text-muted">{s.recipients}</td>
                <td><Badge tone="neutral">{s.format}</Badge></td>
                <td className="text-center"><StatusBadge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  </div>
);
