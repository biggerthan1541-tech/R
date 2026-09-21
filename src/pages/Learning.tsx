import { useState } from 'react';
import {
  AlertTriangle, Award, BookOpen, CheckCircle2, Clock, GraduationCap, Play, Users,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Column, DataTable, EmptyState, Field,
  Input, Modal, PermissionDenied, Progress, SearchInput, SectionHeader, Select, StatTile,
  StatusBadge, Tabs, cx,
} from '@/components/ui';
import { BarChart, GaugeRing } from '@/components/charts';
import { useApp, useLookups } from '@/lib/store';
import { useTalentActions } from '@/lib/actions';
import { trainingFor } from '@/lib/selectors';
import { num, percent } from '@/lib/format';
import { addDays, diffDays, fmtDate } from '@/lib/dates';
import type { Course, TrainingAssignment } from '@/lib/types';

export const LearningPage = () => {
  const { db, can, employee, visibleIds } = useApp();
  const [tab, setTab] = useState('mine');

  if (!can('learning.view.self', 'learning.assign', 'learning.manage')) {
    return <PermissionDenied what="learning" />;
  }

  const mine = employee ? trainingFor(db, employee.id) : [];
  const outstanding = mine.filter((a) => a.status !== 'completed' && a.status !== 'waived').length;
  const scope = visibleIds('performance');
  const teamOverdue = db.trainingAssignments.filter((a) => a.status === 'overdue' && scope.has(a.employeeId)).length;

  const tabs = [
    { id: 'mine', label: 'My training', count: outstanding, icon: GraduationCap },
    { id: 'catalog', label: 'Course catalog', icon: BookOpen },
    ...(can('learning.assign', 'learning.manage') ? [
      { id: 'team', label: 'Team compliance', count: teamOverdue, icon: Users },
    ] : []),
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Learning & Development"
        subtitle="Required compliance training, role-specific certification and professional development in one record."
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'mine' ? <MyTraining /> : null}
      {tab === 'catalog' ? <Catalog /> : null}
      {tab === 'team' ? <TeamCompliance /> : null}
    </div>
  );
};

/* -------------------------------------------------------- my training */

const MyTraining = () => {
  const { db, employee, today } = useApp();
  const { progressTraining } = useTalentActions();
  const lookups = useLookups();
  const [player, setPlayer] = useState<TrainingAssignment | null>(null);
  if (!employee) return null;

  const assignments = trainingFor(db, employee.id);
  const groups = {
    overdue: assignments.filter((a) => a.status === 'overdue'),
    in_progress: assignments.filter((a) => a.status === 'in_progress'),
    assigned: assignments.filter((a) => a.status === 'assigned'),
    completed: assignments.filter((a) => a.status === 'completed'),
  };
  const completion = assignments.length
    ? (groups.completed.length / assignments.length) * 100 : 100;

  const Group = ({ title, items, tone }: { title: string; items: TrainingAssignment[]; tone: 'danger' | 'warning' | 'neutral' | 'success' }) => {
    if (!items.length) return null;
    return (
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          {title}
          <Badge tone={tone}>{items.length}</Badge>
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((a) => {
            const course = lookups.course.get(a.courseId);
            if (!course) return null;
            const daysLeft = diffDays(today, a.dueDate);
            return (
              <Card key={a.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{course.title}</p>
                      {course.mandatory ? <Badge tone="danger">Required</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{course.code} · {course.durationMinutes} min · {course.format.replace(/_/g, ' ')}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">{course.description}</p>
                <Progress className="mt-3" value={a.progressPercent} showValue
                  tone={a.status === 'overdue' ? 'danger' : a.status === 'completed' ? 'success' : 'brand'} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className={cx('text-2xs', daysLeft < 0 ? 'font-medium text-danger-600' : 'text-faint')}>
                    {a.status === 'completed'
                      ? `Completed ${a.completedAt ? fmtDate(a.completedAt.slice(0, 10)) : ''}${a.score ? ` · scored ${a.score}` : ''}`
                      : daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `Due ${fmtDate(a.dueDate)}`}
                  </span>
                  {a.status !== 'completed' ? (
                    <Button size="xs" variant="primary" icon={Play} onClick={() => setPlayer(a)}>
                      {a.progressPercent > 0 ? 'Resume' : 'Start'}
                    </Button>
                  ) : a.certificateId ? <Badge tone="success" icon={Award}>Certificate issued</Badge> : null}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Assigned" value={num(groups.assigned.length)} icon={BookOpen} />
        <StatTile label="In progress" value={num(groups.in_progress.length)} icon={Clock} tone="warning" />
        <StatTile label="Completed" value={num(groups.completed.length)} icon={CheckCircle2} tone="success" />
        <StatTile label="Overdue" value={num(groups.overdue.length)} icon={AlertTriangle} tone={groups.overdue.length ? 'danger' : 'success'} />
      </div>

      {groups.overdue.length ? (
        <Alert tone="danger" icon={AlertTriangle} title="Required training is overdue">
          Overdue mandatory training escalates to your manager after seven days.
        </Alert>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-5">
          <GaugeRing value={completion} label="complete" tone="var(--chart-1)" size={104} />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">Your training record</h3>
            <p className="mt-1 text-xs text-muted">
              {groups.completed.length} of {assignments.length} assigned courses complete.
              {employee.certifications.length ? ` ${employee.certifications.length} certification(s) on file.` : ''}
            </p>
            {employee.certifications.length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {employee.certifications.map((c, i) => {
                  const expired = c.expires && c.expires < today;
                  return (
                    <li key={i}>
                      <Badge tone={expired ? 'danger' : 'success'} icon={Award}>
                        {c.name}{c.expires ? ` · ${expired ? 'expired' : 'to'} ${fmtDate(c.expires)}` : ''}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>
      </Card>

      <Group title="Overdue" items={groups.overdue} tone="danger" />
      <Group title="In progress" items={groups.in_progress} tone="warning" />
      <Group title="Assigned" items={groups.assigned} tone="neutral" />
      <Group title="Completed" items={groups.completed} tone="success" />

      <CoursePlayer
        assignment={player}
        onClose={() => setPlayer(null)}
        onProgress={(pct) => { if (player) progressTraining(player.id, pct); }}
      />
    </div>
  );
};

const CoursePlayer = ({
  assignment, onClose, onProgress,
}: { assignment: TrainingAssignment | null; onClose: () => void; onProgress: (pct: number) => void }) => {
  const lookups = useLookups();
  const [moduleIdx, setModuleIdx] = useState(0);
  const course = assignment ? lookups.course.get(assignment.courseId) : null;
  if (!assignment || !course) return null;

  const total = course.modules.length || 1;
  const pct = Math.round(((moduleIdx + 1) / total) * 100);

  return (
    <Modal
      open onClose={onClose} size="lg" icon={Play}
      title={course.title}
      subtitle={`${course.code} · ${course.durationMinutes} minutes · ${course.format.replace(/_/g, ' ')}`}
      footer={
        <>
          <Button onClick={onClose}>Save and exit</Button>
          <div className="flex-1" />
          {moduleIdx > 0 ? <Button onClick={() => setModuleIdx(moduleIdx - 1)}>Previous</Button> : null}
          {moduleIdx < total - 1 ? (
            <Button variant="primary" onClick={() => { setModuleIdx(moduleIdx + 1); onProgress(Math.round(((moduleIdx + 2) / total) * 100) - 5); }}>
              Next module
            </Button>
          ) : (
            <Button variant="primary" icon={CheckCircle2} onClick={() => { onProgress(100); onClose(); }}>
              Complete course
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Progress value={pct} showValue size="lg" />
        <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
          <ul className="space-y-1">
            {course.modules.map((m, i) => (
              <li key={m.title}>
                <button
                  onClick={() => setModuleIdx(i)}
                  className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                    i === moduleIdx ? 'bg-brand-50 font-medium text-brand-800' : 'text-muted hover:bg-sunken')}
                >
                  <span className={cx('grid h-4 w-4 shrink-0 place-items-center rounded-full text-[0.6rem]',
                    i < moduleIdx ? 'bg-success-500 text-white' : i === moduleIdx ? 'bg-brand-600 text-white' : 'bg-line text-faint')}>
                    {i < moduleIdx ? '✓' : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  <span className="shrink-0 text-2xs text-faint">{m.minutes}m</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="rounded-lg border border-line bg-sunken p-5">
            <h4 className="text-sm font-semibold">{course.modules[moduleIdx]?.title}</h4>
            <p className="mt-2 text-xs leading-relaxed text-muted">{course.description}</p>
            <div className="mt-4 grid h-40 place-items-center rounded-lg border border-dashed border-line-strong bg-surface text-xs text-faint">
              {course.format === 'video' ? 'Video module' : course.format === 'quiz' ? 'Knowledge check' : course.format === 'document' ? 'Reading material' : 'Instructor-led session'}
            </div>
            {course.passingScore > 0 ? (
              <p className="mt-3 text-2xs text-faint">A score of {course.passingScore}% or higher is required to pass.</p>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------- catalog */

const Catalog = () => {
  const { db, can } = useApp();
  const { assignTraining } = useTalentActions();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [assigning, setAssigning] = useState<Course | null>(null);

  const courses = db.courses
    .filter((c) => (category === 'all' ? true : c.category === category))
    .filter((c) => {
      const q = query.trim().toLowerCase();
      return !q || `${c.title} ${c.code} ${c.description}`.toLowerCase().includes(q);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search courses…" className="min-w-[16rem] flex-1" />
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto">
          <option value="all">All categories</option>
          {['compliance', 'safety', 'leadership', 'technical', 'onboarding', 'professional'].map((c) => (
            <option key={c} value={c} className="capitalize">{c}</option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((c) => {
          const enrolled = db.trainingAssignments.filter((a) => a.courseId === c.id);
          const completed = enrolled.filter((a) => a.status === 'completed').length;
          return (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{c.code} · {c.durationMinutes} min</p>
                </div>
                {c.mandatory ? <Badge tone="danger">Required</Badge> : <Badge tone="neutral" className="capitalize">{c.category}</Badge>}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">{c.description}</p>
              <ul className="mt-3 space-y-1">
                {c.modules.map((m) => (
                  <li key={m.title} className="flex items-center justify-between text-2xs text-faint">
                    <span className="truncate">{m.title}</span><span>{m.minutes}m</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="text-2xs text-faint">{completed}/{enrolled.length} completed</span>
                {can('learning.assign') ? <Button size="xs" onClick={() => setAssigning(c)}>Assign</Button> : null}
              </div>
            </Card>
          );
        })}
      </div>

      <AssignModal course={assigning} onClose={() => setAssigning(null)}
        onAssign={(ids, due) => { if (assigning) assignTraining(assigning.id, ids, due); setAssigning(null); }} />
    </div>
  );
};

const AssignModal = ({
  course, onClose, onAssign,
}: { course: Course | null; onClose: () => void; onAssign: (ids: string[], due: string) => void }) => {
  const { db, visibleIds, today } = useApp();
  const lookups = useLookups();
  const [selected, setSelected] = useState<string[]>([]);
  const [due, setDue] = useState(addDays(today, 30));
  const [query, setQuery] = useState('');

  const scope = visibleIds('performance');
  const candidates = db.employees
    .filter((e) => e.status === 'active' && scope.has(e.id))
    .filter((e) => {
      const q = query.trim().toLowerCase();
      return !q || `${e.firstName} ${e.lastName}`.toLowerCase().includes(q);
    })
    .slice(0, 60);

  if (!course) return null;

  return (
    <Modal
      open onClose={onClose} title={`Assign: ${course.title}`} icon={GraduationCap}
      subtitle={`${course.durationMinutes} minutes · ${course.category}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!selected.length} onClick={() => onAssign(selected, due)}>
            Assign to {selected.length || 0} employee{selected.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Due date" required><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Employees" required hint="Each person is notified and the assignment appears in their task list.">
          <SearchInput value={query} onChange={setQuery} placeholder="Filter employees…" className="mb-2" />
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
            {candidates.map((e) => {
              const on = selected.includes(e.id);
              return (
                <li key={e.id}>
                  <button
                    onClick={() => setSelected(on ? selected.filter((x) => x !== e.id) : [...selected, e.id])}
                    className={cx('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                      on ? 'bg-brand-50 text-brand-800' : 'hover:bg-sunken')}
                  >
                    <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{e.preferredName} {e.lastName}</span>
                      <span className="block truncate text-2xs text-muted">{lookups.jobTitle.get(e.jobTitleId)?.name}</span>
                    </span>
                    {on ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </Field>
      </div>
    </Modal>
  );
};

/* ---------------------------------------------------- team compliance */

const TeamCompliance = () => {
  const { db, visibleIds } = useApp();
  const lookups = useLookups();
  const [courseFilter, setCourseFilter] = useState('mandatory');

  const scope = visibleIds('performance');
  const relevantCourses = db.courses.filter((c) => (courseFilter === 'mandatory' ? c.mandatory : courseFilter === 'all' ? true : c.id === courseFilter));
  const employees = db.employees.filter((e) => e.status === 'active' && scope.has(e.id));

  const rows = employees.map((e) => {
    const assignments = db.trainingAssignments.filter(
      (a) => a.employeeId === e.id && relevantCourses.some((c) => c.id === a.courseId),
    );
    const completed = assignments.filter((a) => a.status === 'completed').length;
    const overdue = assignments.filter((a) => a.status === 'overdue').length;
    return { employee: e, assignments, completed, overdue, pct: assignments.length ? (completed / assignments.length) * 100 : 100 };
  });

  const overall = rows.length ? rows.reduce((s, r) => s + r.pct, 0) / rows.length : 0;
  const byCourse = relevantCourses.map((c) => {
    const list = db.trainingAssignments.filter((a) => a.courseId === c.id && scope.has(a.employeeId));
    return {
      label: c.code,
      done: list.filter((a) => a.status === 'completed').length,
      total: list.length,
    };
  }).filter((c) => c.total > 0);

  const columns: Column<typeof rows[number]>[] = [
    {
      key: 'employee', header: 'Employee', sortValue: (r) => r.employee.lastName,
      render: (r) => (
        <span className="flex items-center gap-2.5">
          <Avatar first={r.employee.firstName} last={r.employee.lastName} seed={r.employee.avatarSeed} size={26} />
          <span className="min-w-0">
            <span className="block truncate text-sm">{r.employee.preferredName} {r.employee.lastName}</span>
            <span className="block truncate text-xs text-muted">{lookups.department.get(r.employee.departmentId)?.name}</span>
          </span>
        </span>
      ),
    },
    { key: 'assigned', header: 'Assigned', align: 'right', hideBelow: 'sm', sortValue: (r) => r.assignments.length, render: (r) => num(r.assignments.length) },
    { key: 'completed', header: 'Completed', align: 'right', sortValue: (r) => r.completed, render: (r) => num(r.completed) },
    { key: 'overdue', header: 'Overdue', align: 'right', sortValue: (r) => r.overdue, render: (r) => r.overdue ? <Badge tone="danger">{r.overdue}</Badge> : <span className="text-faint">—</span> },
    {
      key: 'pct', header: 'Completion', align: 'right', width: '12rem', sortValue: (r) => r.pct,
      render: (r) => <Progress value={r.pct} showValue tone={r.overdue ? 'danger' : r.pct === 100 ? 'success' : 'brand'} />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Team members" value={num(employees.length)} icon={Users} />
        <StatTile label="Overall completion" value={percent(overall, 0)} icon={CheckCircle2} tone={overall > 90 ? 'success' : 'warning'} />
        <StatTile label="Overdue assignments" value={num(rows.reduce((s, r) => s + r.overdue, 0))} icon={AlertTriangle}
          tone={rows.some((r) => r.overdue) ? 'danger' : 'success'} />
        <StatTile label="Fully compliant" value={num(rows.filter((r) => r.pct === 100).length)} icon={Award} tone="teal" />
      </div>

      {byCourse.length ? (
        <Card>
          <CardHeader title="Completion by course" icon={BookOpen} />
          <BarChart
            categories={byCourse.map((c) => c.label)}
            series={[
              { key: 'done', label: 'Completed', values: byCourse.map((c) => c.done) },
              { key: 'outstanding', label: 'Outstanding', values: byCourse.map((c) => c.total - c.done) },
            ]}
            stacked height={210} labelEvery={1}
          />
        </Card>
      ) : null}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <h3 className="flex-1 text-sm font-semibold">Compliance by employee</h3>
          <Select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="w-auto">
            <option value="mandatory">Required courses only</option>
            <option value="all">All courses</option>
            {db.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
        </div>
        <DataTable rows={rows} columns={columns} getRowId={(r) => r.employee.id} pageSize={14}
          initialSort={{ key: 'pct', dir: 'asc' }}
          empty={<EmptyState icon={Users} title="No employees in scope" />} />
      </Card>
    </div>
  );
};
