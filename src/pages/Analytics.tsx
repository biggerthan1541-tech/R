import { useMemo, useState } from 'react';
import {
  BarChart3, Building2, Clock, DollarSign, GraduationCap,
  HeartPulse, Plane, TrendingUp, UserMinus, UserPlus, Users,
} from 'lucide-react';
import {
  Card, CardHeader, PermissionDenied, SectionHeader, SegmentedControl, StatTile, Tabs, cx,
} from '@/components/ui';
import { BarChart, DonutChart, HBarList, HeatGrid, LineChart } from '@/components/charts';
import { useApp, useLookups } from '@/lib/store';
import {
  departmentHeadcount, headcountStats, locationHeadcount, overtimeByDepartment,
  payrollHistory, recruitingFunnel,
} from '@/lib/selectors';
import { currency, num, percent } from '@/lib/format';
import { addDays, addMonths, diffDays, monthKey } from '@/lib/dates';

export const AnalyticsPage = () => {
  const { db, can, today } = useApp();
  const [tab, setTab] = useState('workforce');
  const [range, setRange] = useState<'6' | '12'>('12');

  if (!can('analytics.view')) return <PermissionDenied what="workforce analytics" />;

  const months = Number(range);
  const stats = headcountStats(db, today);
  const payroll = payrollHistory(db, months);

  const active = db.employees.filter((e) => e.status === 'active');
  const totalPayrollYtd = db.paychecks
    .filter((c) => c.checkDate.startsWith(today.slice(0, 4)))
    .reduce((s, c) => s + c.grossPay, 0);
  const totalHours = db.timecards.reduce((s, t) => s + t.totalRegular + t.totalOvertime, 0);
  const otHours = db.timecards.reduce((s, t) => s + t.totalOvertime + t.totalDoubleTime, 0);
  const otRate = totalHours ? (otHours / totalHours) * 100 : 0;
  const ptoUsed = db.ptoBalances.reduce((s, b) => s + b.usedHours, 0);
  const ptoAccrued = db.ptoBalances.reduce((s, b) => s + b.accruedHours + b.carryoverHours, 0);
  const absent = db.ptoRequests.filter((r) => r.status === 'approved' && r.startDate <= today && r.endDate >= today).length;
  const openings = db.requisitions.filter((r) => r.status === 'open').reduce((s, r) => s + r.openings - r.filled, 0);
  const trainingDone = db.trainingAssignments.filter((a) => a.status === 'completed').length;
  const trainingRate = db.trainingAssignments.length ? (trainingDone / db.trainingAssignments.length) * 100 : 0;
  const benefitsCost = db.benefitEnrollments.filter((e) => e.status === 'active').reduce((s, e) => s + e.employerCostPerPay * 26, 0);
  const avgRating = (() => {
    const rated = db.reviews.filter((r) => r.finalRating);
    return rated.length ? rated.reduce((s, r) => s + (r.finalRating ?? 0), 0) / rated.length : 0;
  })();

  const grossSeries = payroll.map((p) => p.gross);
  const trend = grossSeries.length > 1
    ? ((grossSeries[grossSeries.length - 1] - grossSeries[grossSeries.length - 2]) / (grossSeries[grossSeries.length - 2] || 1)) * 100
    : 0;

  const tabs = [
    { id: 'workforce', label: 'Workforce', icon: Users },
    { id: 'cost', label: 'Labor cost', icon: DollarSign },
    { id: 'time', label: 'Time & absence', icon: Clock },
    { id: 'talent', label: 'Talent', icon: GraduationCap },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Workforce analytics"
        subtitle="Company-wide KPIs built from the same records that run payroll — no separate reporting warehouse."
        actions={<SegmentedControl value={range} onChange={setRange}
          options={[{ value: '6', label: '6 months' }, { value: '12', label: '12 months' }]} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total employees" value={num(stats.total)} icon={Users}
          hint={`${stats.active} active · ${stats.onLeave} on leave`} />
        <StatTile label={`${today.slice(0, 4)} payroll`} value={currency(totalPayrollYtd, { compact: true, cents: false })} icon={DollarSign} tone="teal"
          delta={`${trend >= 0 ? '+' : ''}${trend.toFixed(1)}% last period`} deltaTone={trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat'} />
        <StatTile label="Overtime rate" value={percent(otRate, 1)} icon={Clock} tone={otRate > 8 ? 'warning' : 'success'}
          hint={`${num(otHours, 0)} overtime hours`} />
        <StatTile label="12-month turnover" value={percent(stats.turnover, 1)} icon={UserMinus}
          tone={stats.turnover > 18 ? 'danger' : 'success'} hint={`${stats.separations} separations`} />
        <StatTile label="Absent today" value={num(absent)} icon={Plane} tone="accent"
          hint={`${percent(ptoAccrued ? (ptoUsed / ptoAccrued) * 100 : 0, 0)} of PTO used`} />
        <StatTile label="Open positions" value={num(openings)} icon={UserPlus} tone="brand"
          hint={`${db.applications.filter((a) => !['hired', 'rejected', 'withdrawn'].includes(a.stage)).length} active candidates`} />
        <StatTile label="Training completion" value={percent(trainingRate, 0)} icon={GraduationCap}
          tone={trainingRate > 85 ? 'success' : 'warning'} />
        <StatTile label="Benefits cost / year" value={currency(benefitsCost, { compact: true, cents: false })} icon={HeartPulse} tone="teal"
          hint={`Average rating ${avgRating.toFixed(1)} / 5`} />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'workforce' ? <WorkforceTab months={months} /> : null}
      {tab === 'cost' ? <CostTab months={months} /> : null}
      {tab === 'time' ? <TimeTab /> : null}
      {tab === 'talent' ? <TalentTab /> : null}

      <p className="text-xs text-faint">
        Figures reflect {num(active.length)} active employees across {db.locations.filter((l) => l.active).length} locations,
        computed live from {num(db.paychecks.length)} pay statements and {num(db.timecards.length)} timecards.
      </p>
    </div>
  );
};

/* ----------------------------------------------------------- workforce */

const WorkforceTab = ({ months }: { months: number }) => {
  const { db, today } = useApp();
  const lookups = useLookups();

  const headcountSeries = useMemo(() => {
    const out: { month: string; count: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const m = addMonths(today, -i);
      const end = `${m.slice(0, 7)}-28`;
      out.push({
        month: m.slice(0, 7),
        count: db.employees.filter((e) => e.hireDate <= end && (!e.terminationDate || e.terminationDate > end)).length,
      });
    }
    return out;
  }, [db.employees, months, today]);

  const tenureBuckets = useMemo(() => {
    const buckets = [
      { label: '< 1 yr', min: 0, max: 1 },
      { label: '1–2 yrs', min: 1, max: 2 },
      { label: '2–5 yrs', min: 2, max: 5 },
      { label: '5–10 yrs', min: 5, max: 10 },
      { label: '10+ yrs', min: 10, max: 99 },
    ];
    return buckets.map((b) => ({
      label: b.label,
      value: db.employees.filter((e) => {
        if (e.status === 'terminated') return false;
        const yrs = diffDays(e.hireDate, today) / 365;
        return yrs >= b.min && yrs < b.max;
      }).length,
    }));
  }, [db.employees, today]);

  const spanOfControl = useMemo(() => {
    const managers = db.employees.filter((e) => db.employees.some((x) => x.managerId === e.id && x.status === 'active'));
    return managers.map((m) => ({
      label: `${m.preferredName} ${m.lastName}`,
      value: db.employees.filter((x) => x.managerId === m.id && x.status === 'active').length,
    })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [db.employees]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Headcount trend" subtitle="Active employees at each month end" icon={TrendingUp} />
        <LineChart
          area
          categories={headcountSeries.map((h) => h.month.slice(5) + '/' + h.month.slice(2, 4))}
          series={[{ key: 'headcount', label: 'Headcount', values: headcountSeries.map((h) => h.count) }]}
          height={230}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="By department" icon={Building2} />
          <HBarList data={departmentHeadcount(db).slice(0, 8)} format={(n) => num(n)} />
        </Card>
        <Card>
          <CardHeader title="By location" icon={Building2} />
          <DonutChart data={locationHeadcount(db)} centerLabel="employees"
            centerValue={num(db.employees.filter((e) => e.status === 'active').length)} size={150} />
        </Card>
        <Card>
          <CardHeader title="Tenure distribution" icon={Clock} />
          <BarChart
            categories={tenureBuckets.map((t) => t.label)}
            series={[{ key: 'count', label: 'Employees', values: tenureBuckets.map((t) => t.value) }]}
            height={200} labelEvery={1}
          />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Span of control" subtitle="Direct reports per manager" icon={Users} />
          <HBarList data={spanOfControl} format={(n) => `${n} reports`} colorBy="single" />
        </Card>
        <Card>
          <CardHeader title="Employment mix" icon={Users} />
          <DonutChart
            data={['full_time', 'part_time', 'temp', 'intern', 'contractor'].map((t) => ({
              label: t.replace(/_/g, ' '),
              value: db.employees.filter((e) => e.status === 'active' && e.employmentType === t).length,
            })).filter((d) => d.value > 0)}
            centerLabel="active"
            centerValue={num(db.employees.filter((e) => e.status === 'active').length)}
          />
          <p className="mt-3 text-xs text-muted">
            {lookups.department.size} departments · {db.jobTitles.length} job titles · median span of control
            {' '}{spanOfControl.length ? Math.round(spanOfControl.reduce((s, x) => s + x.value, 0) / spanOfControl.length) : 0}.
          </p>
        </Card>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- cost */

const CostTab = ({ months }: { months: number }) => {
  const { db, today } = useApp();
  const lookups = useLookups();
  const history = payrollHistory(db, months);

  const costByDept = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of db.paychecks) {
      const e = lookups.employee.get(c.employeeId);
      if (!e) continue;
      map.set(e.departmentId, (map.get(e.departmentId) ?? 0) + c.grossPay);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ label: lookups.department.get(id)?.name ?? id, value: Math.round(v) }))
      .sort((a, b) => b.value - a.value);
  }, [db.paychecks, lookups]);

  const costPerEmployee = useMemo(() => {
    const active = db.employees.filter((e) => e.status === 'active');
    const totals = db.payrollRuns.reduce((s, r) => s + r.totals.totalCost, 0);
    return active.length ? totals / active.length : 0;
  }, [db]);

  const earningsMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of db.paychecks) {
      for (const e of c.earnings) map.set(e.label.split(' (')[0], (map.get(e.label.split(' (')[0]) ?? 0) + e.amount);
    }
    return [...map.entries()].map(([label, value]) => ({ label, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value).slice(0, 6);
  }, [db.paychecks]);

  const benefitsByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of db.benefitEnrollments.filter((x) => x.status === 'active')) {
      const plan = lookups.plan.get(e.planId);
      if (!plan) continue;
      map.set(plan.type, (map.get(plan.type) ?? 0) + e.employerCostPerPay * 26);
    }
    return [...map.entries()].map(([label, value]) => ({ label: label.replace(/_/g, ' '), value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [db.benefitEnrollments, lookups]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Payroll cost trend" subtitle="Gross pay, employer taxes and benefits" icon={DollarSign} />
        <BarChart
          categories={history.map((h) => h.month.slice(5) + '/' + h.month.slice(2, 4))}
          series={[
            { key: 'gross', label: 'Gross pay', values: history.map((h) => h.gross) },
            { key: 'burden', label: 'Employer burden', values: history.map((h) => Math.round(h.cost - h.gross)) },
          ]}
          stacked height={250}
          format={(n) => currency(n, { compact: true, cents: false })}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Gross pay by department" icon={Building2} />
          <HBarList data={costByDept.slice(0, 8)} format={(n) => currency(n, { compact: true, cents: false })} />
        </Card>
        <Card>
          <CardHeader title="Cost per employee" subtitle="Fully loaded, all runs" icon={DollarSign} />
          <p className="tnum mt-2 text-3xl font-semibold">{currency(costPerEmployee, { compact: true, cents: false })}</p>
          <div className="mt-4 space-y-2 border-t border-line pt-3 text-xs">
            {[
              ['Total gross', db.payrollRuns.reduce((s, r) => s + r.totals.grossPay, 0)],
              ['Employer taxes', db.payrollRuns.reduce((s, r) => s + r.totals.employerTaxes, 0)],
              ['Employer benefits', db.payrollRuns.reduce((s, r) => s + r.totals.employerBenefits, 0)],
              ['Total employer cost', db.payrollRuns.reduce((s, r) => s + r.totals.totalCost, 0)],
            ].map(([label, v], i) => (
              <div key={label as string} className={cx('flex justify-between', i === 3 && 'border-t border-line pt-2 font-semibold')}>
                <span className="text-muted">{label}</span>
                <span className="tnum">{currency(v as number, { compact: true, cents: false })}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Earnings mix" subtitle="Where gross pay comes from" icon={DollarSign} />
          <DonutChart data={earningsMix} centerLabel="gross pay"
            centerValue={currency(earningsMix.reduce((s, e) => s + e.value, 0), { compact: true, cents: false })}
            format={(n) => currency(n, { compact: true, cents: false })} />
        </Card>
        <Card>
          <CardHeader title="Employer benefit spend" subtitle="Annualized by plan type" icon={HeartPulse} />
          <HBarList data={benefitsByType} format={(n) => currency(n, { compact: true, cents: false })} colorBy="series" />
        </Card>
      </div>
      <p className="text-xs text-faint">Reporting period ends {today}.</p>
    </div>
  );
};

/* ---------------------------------------------------------------- time */

const TimeTab = () => {
  const { db, today } = useApp();
  const lookups = useLookups();

  const otByDept = overtimeByDepartment(db, addDays(today, -120));

  const absenceByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of db.ptoRequests.filter((x) => x.status === 'approved')) {
      const key = monthKey(r.startDate);
      map.set(key, (map.get(key) ?? 0) + r.hours);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-9);
  }, [db.ptoRequests]);

  const leaveMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of db.ptoRequests.filter((x) => x.status === 'approved')) {
      map.set(r.kind, (map.get(r.kind) ?? 0) + r.hours);
    }
    return [...map.entries()].map(([label, value]) => ({ label: label.replace(/_/g, ' '), value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [db.ptoRequests]);

  const exceptionGrid = useMemo(() => {
    const kinds = ['missed_punch', 'short_break', 'late_in', 'outside_geofence', 'long_shift'];
    const depts = db.departments.filter((d) => db.employees.some((e) => e.departmentId === d.id));
    const values = depts.map((d) =>
      kinds.map((k) =>
        db.timecards
          .filter((t) => lookups.employee.get(t.employeeId)?.departmentId === d.id)
          .flatMap((t) => t.days.flatMap((day) => day.exceptions))
          .filter((x) => x.kind === k).length));
    return { rows: depts.map((d) => d.name), columns: kinds.map((k) => k.replace(/_/g, ' ')), values };
  }, [db, lookups]);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Overtime by department" subtitle="Last 120 days" icon={Clock} />
          <HBarList data={otByDept} format={(n) => `${num(n, 1)}h`} />
        </Card>
        <Card>
          <CardHeader title="Approved leave by month" icon={Plane} />
          <BarChart
            categories={absenceByMonth.map(([m]) => m.slice(5) + '/' + m.slice(2, 4))}
            series={[{ key: 'hours', label: 'Leave hours', values: absenceByMonth.map(([, v]) => Math.round(v)) }]}
            height={220}
            format={(n) => `${num(n, 0)}h`}
          />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Leave mix" icon={Plane} />
          <DonutChart data={leaveMix} centerLabel="hours approved"
            centerValue={num(leaveMix.reduce((s, l) => s + l.value, 0), 0)} format={(n) => `${num(n, 0)}h`} />
        </Card>
        <Card>
          <CardHeader title="Attendance exceptions" subtitle="Count by department and type" icon={Clock} />
          <HeatGrid rows={exceptionGrid.rows} columns={exceptionGrid.columns} values={exceptionGrid.values} />
        </Card>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------- talent */

const TalentTab = () => {
  const { db } = useApp();
  const lookups = useLookups();
  const funnel = recruitingFunnel(db);

  const sourceMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of db.candidates) map.set(c.source, (map.get(c.source) ?? 0) + 1);
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [db.candidates]);

  const ratingDist = useMemo(() => {
    const rated = db.reviews.filter((r) => r.finalRating);
    return [1, 2, 3, 4, 5].map((v) => ({ label: `Rating ${v}`, value: rated.filter((r) => r.finalRating === v).length }));
  }, [db.reviews]);

  const trainingByCategory = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const a of db.trainingAssignments) {
      const c = lookups.course.get(a.courseId);
      if (!c) continue;
      const cur = map.get(c.category) ?? { done: 0, total: 0 };
      cur.total++;
      if (a.status === 'completed') cur.done++;
      map.set(c.category, cur);
    }
    return [...map.entries()].map(([label, v]) => ({ label, done: v.done, outstanding: v.total - v.done }));
  }, [db.trainingAssignments, lookups]);

  const goalHealth = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of db.goals) map.set(g.status, (map.get(g.status) ?? 0) + 1);
    return [...map.entries()].map(([label, value]) => ({ label: label.replace(/_/g, ' '), value }));
  }, [db.goals]);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Hiring funnel" icon={UserPlus} />
          <BarChart
            categories={funnel.map((f) => f.label)}
            series={[{ key: 'count', label: 'Candidates', values: funnel.map((f) => f.value) }]}
            height={220} labelEvery={1}
          />
        </Card>
        <Card>
          <CardHeader title="Candidate sources" icon={Users} />
          <HBarList data={sourceMix} format={(n) => num(n)} colorBy="series" />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Rating distribution" icon={BarChart3} />
          <DonutChart data={ratingDist.filter((r) => r.value > 0)} centerLabel="rated"
            centerValue={num(ratingDist.reduce((s, r) => s + r.value, 0))} size={150} />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Training completion by category" icon={GraduationCap} />
          <BarChart
            categories={trainingByCategory.map((t) => t.label)}
            series={[
              { key: 'done', label: 'Completed', values: trainingByCategory.map((t) => t.done) },
              { key: 'open', label: 'Outstanding', values: trainingByCategory.map((t) => t.outstanding) },
            ]}
            stacked height={220} labelEvery={1}
          />
        </Card>
      </div>

      <Card>
        <CardHeader title="Goal health" subtitle="Status across every tracked goal" icon={TrendingUp} />
        <div className="grid gap-4 sm:grid-cols-5">
          {goalHealth.map((g) => (
            <div key={g.label} className="well p-3">
              <p className="text-2xs capitalize text-faint">{g.label}</p>
              <p className="tnum mt-1 text-xl font-semibold">{g.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
