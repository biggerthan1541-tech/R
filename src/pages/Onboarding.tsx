import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, ClipboardList, FileSignature, GraduationCap, Laptop, Users, UserPlus, Wallet,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, PermissionDenied, Progress,
  ProgressBlocks, SectionHeader, Select, StatTile, StatusBadge, Tabs, cx,
} from '@/components/ui';
import { useApp, useLookups } from '@/lib/store';
import { useTalentActions } from '@/lib/actions';
import { onboardingProgress } from '@/lib/selectors';
import { num } from '@/lib/format';
import { diffDays, fmtDate, fmtDateShort } from '@/lib/dates';
import type { OnboardingTask, OnboardingTaskOwner } from '@/lib/types';

const OWNER_ICON: Record<OnboardingTaskOwner, React.ComponentType<{ className?: string }>> = {
  employee: Users, manager: Users, hr: ClipboardList, it: Laptop, payroll: Wallet,
};

export const OnboardingPage = () => {
  const { db, can, employee } = useApp();
  const [tab, setTab] = useState(() => (employee?.onboardingPacketId ? 'mine' : 'all'));

  if (!can('onboarding.view.self', 'onboarding.view.team', 'onboarding.manage')) {
    return <PermissionDenied what="onboarding" />;
  }

  const manage = can('onboarding.manage', 'onboarding.view.team');
  const tabs = [
    ...(employee?.onboardingPacketId ? [{ id: 'mine', label: 'My onboarding', icon: UserPlus }] : []),
    ...(manage ? [
      { id: 'all', label: 'All new hires', count: db.onboardingPackets.filter((p) => p.status !== 'completed').length, icon: Users },
      { id: 'tasks', label: 'My assigned tasks', icon: ClipboardList },
      { id: 'templates', label: 'Templates', icon: FileSignature },
    ] : []),
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Onboarding"
        subtitle="Every new hire runs the same checklist across the employee, manager, IT, HR and payroll — tracked to completion."
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'mine' ? <MyOnboarding /> : null}
      {tab === 'all' ? <AllPackets /> : null}
      {tab === 'tasks' ? <MyAssignedTasks /> : null}
      {tab === 'templates' ? <Templates /> : null}
    </div>
  );
};

/* ------------------------------------------------------ my onboarding */

const MyOnboarding = () => {
  const { db, employee, today } = useApp();
  const { completeOnboardingTask } = useTalentActions();
  const lookups = useLookups();
  if (!employee?.onboardingPacketId) return null;

  const packet = db.onboardingPackets.find((p) => p.id === employee.onboardingPacketId);
  const tasks = db.onboardingTasks.filter((t) => t.packetId === employee.onboardingPacketId);
  const mine = tasks.filter((t) => t.owner === 'employee');
  const others = tasks.filter((t) => t.owner !== 'employee');
  const progress = onboardingProgress(db, employee.onboardingPacketId);
  const buddy = packet?.buddyId ? lookups.employee.get(packet.buddyId) : null;
  const manager = lookups.employee.get(employee.managerId ?? '');

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Welcome to Cardinal Peak, {employee.preferredName}</h2>
            <p className="mt-1 text-sm text-muted">
              You started {fmtDate(employee.hireDate)}. Here is everything left to finish.
            </p>
          </div>
          <div className="text-right">
            <ProgressBlocks value={progress.percent} />
            <p className="mt-1 text-xs text-muted">{progress.done} of {progress.total} steps complete</p>
          </div>
        </div>
        <Progress className="mt-4" value={progress.percent} size="lg" tone={progress.overdue ? 'warning' : 'brand'} />
        {progress.overdue ? (
          <Alert className="mt-4" tone="warning" title={`${progress.overdue} step(s) are overdue`}>
            People Operations has been notified. Finishing these unblocks your first paycheck and benefits.
          </Alert>
        ) : null}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <h3 className="text-sm font-semibold">Your steps</h3>
          {mine.map((t) => (
            <TaskRow key={t.id} task={t} today={today} onComplete={() => completeOnboardingTask(t.id)} actionable />
          ))}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Your people" dense icon={Users} />
            <ul className="space-y-3">
              {manager ? (
                <li className="flex items-center gap-2.5">
                  <Avatar first={manager.firstName} last={manager.lastName} seed={manager.avatarSeed} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{manager.preferredName} {manager.lastName}</p>
                    <p className="truncate text-xs text-muted">Your manager</p>
                  </div>
                </li>
              ) : null}
              {buddy ? (
                <li className="flex items-center gap-2.5">
                  <Avatar first={buddy.firstName} last={buddy.lastName} seed={buddy.avatarSeed} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{buddy.preferredName} {buddy.lastName}</p>
                    <p className="truncate text-xs text-muted">Onboarding buddy</p>
                  </div>
                </li>
              ) : null}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Being handled for you" dense icon={CheckCircle2} />
            <ul className="space-y-2">
              {others.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">{t.title}</span>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
};

const TaskRow = ({
  task, today, onComplete, actionable,
}: { task: OnboardingTask; today: string; onComplete: () => void; actionable?: boolean }) => {
  const Icon = OWNER_ICON[task.owner];
  const overdue = task.status === 'overdue' || (task.status !== 'completed' && task.status !== 'waived' && task.dueDate < today);
  const done = task.status === 'completed' || task.status === 'waived';

  return (
    <div className={cx('flex flex-wrap items-start gap-3 rounded-xl border p-3.5',
      done ? 'border-line bg-sunken/50' : overdue ? 'border-danger-100 bg-danger-50/40' : 'border-line bg-surface')}>
      <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg',
        done ? 'bg-success-50 text-success-600' : overdue ? 'bg-danger-50 text-danger-500' : 'bg-brand-50 text-brand-700')}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cx('text-sm font-medium', done && 'text-muted line-through')}>{task.title}</p>
          {task.required ? <Badge tone="neutral">Required</Badge> : <Badge tone="neutral">Optional</Badge>}
          <Badge tone="neutral" className="capitalize">{task.kind.replace(/_/g, ' ')}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">{task.description}</p>
        <p className={cx('mt-1 text-2xs', overdue ? 'font-medium text-danger-600' : 'text-faint')}>
          {done ? `Completed ${task.completedAt ? fmtDateShort(task.completedAt.slice(0, 10)) : ''}`
            : overdue ? `Overdue since ${fmtDate(task.dueDate)}`
            : `Due ${fmtDate(task.dueDate)}`}
        </p>
      </div>
      {actionable && !done ? (
        <Button size="sm" variant="primary" onClick={onComplete}>Mark complete</Button>
      ) : null}
    </div>
  );
};

/* ------------------------------------------------------------ packets */

const AllPackets = () => {
  const { db, today } = useApp();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('active');
  const [openId, setOpenId] = useState<string | null>(null);

  const packets = db.onboardingPackets
    .filter((p) => (filter === 'all' ? true : filter === 'active' ? p.status !== 'completed' : p.status === 'completed'))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const stats = useMemo(() => {
    const all = db.onboardingPackets.map((p) => onboardingProgress(db, p.id));
    return {
      inFlight: db.onboardingPackets.filter((p) => p.status !== 'completed').length,
      overdue: all.reduce((s, p) => s + p.overdue, 0),
      avg: all.length ? Math.round(all.reduce((s, p) => s + p.percent, 0) / all.length) : 0,
      startingSoon: db.employees.filter((e) => e.status === 'pending_hire').length,
    };
  }, [db]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Onboarding in flight" value={num(stats.inFlight)} icon={UserPlus} />
        <StatTile label="Starting soon" value={num(stats.startingSoon)} icon={Users} tone="teal" />
        <StatTile label="Overdue steps" value={num(stats.overdue)} icon={ClipboardList} tone={stats.overdue ? 'danger' : 'success'} />
        <StatTile label="Average completion" value={`${stats.avg}%`} icon={CheckCircle2} tone="brand" />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <h3 className="flex-1 text-sm font-semibold">New hire packets</h3>
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-auto">
            <option value="active">In progress</option>
            <option value="completed">Completed</option>
            <option value="all">All</option>
          </Select>
        </div>
        {packets.length === 0 ? (
          <EmptyState icon={UserPlus} title="No onboarding packets" body="Packets are created automatically when a candidate is hired." />
        ) : (
          <ul className="divide-y divide-line">
            {packets.map((p) => {
              const emp = lookups.employee.get(p.employeeId);
              const prog = onboardingProgress(db, p.id);
              const daysToStart = diffDays(today, p.startDate);
              if (!emp) return null;
              return (
                <li key={p.id}>
                  <button onClick={() => setOpenId(openId === p.id ? null : p.id)}
                    className="flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sunken/60 sm:px-5">
                    <Avatar first={emp.firstName} last={emp.lastName} seed={emp.avatarSeed} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{emp.firstName} {emp.lastName}</p>
                        <StatusBadge status={p.status} />
                        {prog.overdue ? <Badge tone="danger">{prog.overdue} overdue</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {lookups.jobTitle.get(emp.jobTitleId)?.name} · {lookups.department.get(emp.departmentId)?.name} ·
                        {daysToStart > 0 ? ` starts in ${daysToStart} days` : ` day ${Math.abs(daysToStart) + 1}`}
                      </p>
                    </div>
                    <div className="w-40 shrink-0">
                      <Progress value={prog.percent} showValue tone={prog.overdue ? 'warning' : prog.percent === 100 ? 'success' : 'brand'} />
                      <p className="mt-1 text-2xs text-faint">{prog.done}/{prog.total} steps</p>
                    </div>
                  </button>
                  {openId === p.id ? <PacketDetail packetId={p.id} onOpenEmployee={() => navigate(`/people/${emp.id}`)} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};

const PacketDetail = ({ packetId, onOpenEmployee }: { packetId: string; onOpenEmployee: () => void }) => {
  const { db, today, can } = useApp();
  const { completeOnboardingTask } = useTalentActions();
  const tasks = db.onboardingTasks.filter((t) => t.packetId === packetId);
  const owners: OnboardingTaskOwner[] = ['employee', 'manager', 'hr', 'it', 'payroll'];

  return (
    <div className="border-t border-line bg-sunken/40 px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-faint">Checklist by owner</h4>
        <Button size="xs" onClick={onOpenEmployee}>Open employee record</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {owners.map((owner) => {
          const group = tasks.filter((t) => t.owner === owner);
          if (!group.length) return null;
          const done = group.filter((t) => t.status === 'completed' || t.status === 'waived').length;
          const Icon = OWNER_ICON[owner];
          return (
            <div key={owner} className="rounded-lg border border-line bg-surface p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <Icon className="h-3.5 w-3.5" />{owner}
                </span>
                <span className="tnum text-2xs text-faint">{done}/{group.length}</span>
              </div>
              <ul className="space-y-1.5">
                {group.map((t) => {
                  const finished = t.status === 'completed' || t.status === 'waived';
                  const overdue = !finished && t.dueDate < today;
                  return (
                    <li key={t.id} className="flex items-start gap-2">
                      <button
                        disabled={finished || !can('onboarding.manage')}
                        onClick={() => completeOnboardingTask(t.id)}
                        className={cx('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors',
                          finished ? 'border-success-500 bg-success-500 text-white'
                            : can('onboarding.manage') ? 'border-line-strong hover:border-brand-500' : 'border-line-strong')}
                        aria-label={finished ? 'Completed' : 'Mark complete'}
                      >
                        {finished ? <CheckCircle2 className="h-3 w-3" /> : null}
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className={cx('block text-xs', finished ? 'text-faint line-through' : 'text-ink')}>{t.title}</span>
                        <span className={cx('block text-2xs', overdue ? 'text-danger-600' : 'text-faint')}>
                          {finished ? 'Done' : overdue ? `Overdue · ${fmtDateShort(t.dueDate)}` : `Due ${fmtDateShort(t.dueDate)}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------ assigned tasks */

const MyAssignedTasks = () => {
  const { db, employee, today, can } = useApp();
  const { completeOnboardingTask } = useTalentActions();
  const lookups = useLookups();

  const roleOwners: OnboardingTaskOwner[] = [
    ...(can('onboarding.manage') ? (['hr'] as OnboardingTaskOwner[]) : []),
    ...(can('payroll.process') ? (['payroll'] as OnboardingTaskOwner[]) : []),
    'manager',
  ];

  const tasks = db.onboardingTasks
    .filter((t) => roleOwners.includes(t.owner) && t.status !== 'completed' && t.status !== 'waived')
    .filter((t) => {
      if (t.owner !== 'manager') return true;
      const packet = db.onboardingPackets.find((p) => p.id === t.packetId);
      const emp = packet ? lookups.employee.get(packet.employeeId) : null;
      return emp?.managerId === employee?.id;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  if (!tasks.length) {
    return <Card><EmptyState icon={CheckCircle2} title="No onboarding tasks assigned to you" body="Tasks for your role appear here when a new hire starts." /></Card>;
  }

  return (
    <div className="space-y-3">
      {tasks.map((t) => {
        const packet = db.onboardingPackets.find((p) => p.id === t.packetId);
        const emp = packet ? lookups.employee.get(packet.employeeId) : null;
        return (
          <div key={t.id} className="rounded-xl border border-line bg-surface p-3.5">
            {emp ? (
              <div className="mb-2 flex items-center gap-2.5">
                <Avatar first={emp.firstName} last={emp.lastName} seed={emp.avatarSeed} size={26} />
                <span className="text-xs text-muted">{emp.firstName} {emp.lastName} · starts {fmtDateShort(packet!.startDate)}</span>
              </div>
            ) : null}
            <TaskRow task={t} today={today} onComplete={() => completeOnboardingTask(t.id)} actionable />
          </div>
        );
      })}
    </div>
  );
};

/* --------------------------------------------------------- templates */

const Templates = () => {
  const { db } = useApp();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {db.onboardingTemplates.map((t) => (
        <Card key={t.id} padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title={t.name} dense icon={GraduationCap}
              subtitle={`${t.tasks.length} steps · applies to ${t.departmentIds.length} departments`}
              actions={<Badge tone={t.active ? 'success' : 'neutral'}>{t.active ? 'Active' : 'Inactive'}</Badge>}
            />
            <div className="flex flex-wrap gap-1">
              {t.departmentIds.map((d) => (
                <Badge key={d} tone="neutral">{db.departments.find((x) => x.id === d)?.name}</Badge>
              ))}
            </div>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {t.tasks.map((task) => {
              const Icon = OWNER_ICON[task.owner];
              return (
                <li key={task.key} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{task.title}</p>
                    <p className="text-2xs text-faint">
                      {task.owner} · due {task.dueOffsetDays === 0 ? 'on day one'
                        : task.dueOffsetDays < 0 ? `${Math.abs(task.dueOffsetDays)} day(s) before start`
                        : `day ${task.dueOffsetDays}`}
                      {task.required ? ' · required' : ' · optional'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
};
