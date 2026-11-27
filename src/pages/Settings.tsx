import { useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, CheckCircle2, Cpu, Key, Link2, Lock, Palette, RefreshCw,
  Settings2, Shield, ShieldCheck, Users, Workflow, Zap,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Column, ConfirmDialog, DataTable,
  EmptyState, KeyValue, Modal, PermissionDenied, SearchInput, SectionHeader,
  Select, StatTile, StatusBadge, Tabs, Toggle, cx,
} from '@/components/ui';
import { useApp, useLookups } from '@/lib/store';
import { useAdminActions } from '@/lib/actions';
import { ROLES, PERMISSIONS, ROLE_PERMISSIONS } from '@/lib/permissions';
import type { Permission } from '@/lib/permissions';
import { num } from '@/lib/format';
import { fmtDate, fmtDateTime, timeAgo } from '@/lib/dates';
import type { AutomationRule, Role, UserAccount } from '@/lib/types';

export const SettingsPage = () => {
  const { db, can, theme, setTheme, resetDemo, persistence } = useApp();
  const [tab, setTab] = useState('organization');
  const [resetting, setResetting] = useState(false);

  if (!can('settings.view', 'settings.manage', 'security.manage')) {
    return <PermissionDenied what="configuration" />;
  }

  const tabs = [
    { id: 'organization', label: 'Organization', icon: Building2 },
    { id: 'security', label: 'Security & access', icon: Shield },
    { id: 'automation', label: 'Automation', count: db.automationRules.filter((r) => r.enabled).length, icon: Workflow },
    { id: 'integrations', label: 'Integrations', count: db.integrations.filter((i) => i.status === 'connected').length, icon: Link2 },
    { id: 'preferences', label: 'Preferences', icon: Palette },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Settings"
        subtitle="Organization configuration, access control, workflow automation and connected systems."
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'organization' ? <OrganizationTab /> : null}
      {tab === 'security' ? <SecurityTab /> : null}
      {tab === 'automation' ? <AutomationTab /> : null}
      {tab === 'integrations' ? <IntegrationsTab /> : null}
      {tab === 'preferences' ? (
        <PreferencesTab theme={theme} setTheme={setTheme} persistence={persistence} onReset={() => setResetting(true)} />
      ) : null}

      <ConfirmDialog
        open={resetting} onClose={() => setResetting(false)} tone="danger"
        title="Reset the demo dataset" confirmLabel="Reset everything"
        body="This discards every change you have made — approvals, payroll runs, hires, documents — and regenerates the demo organization from scratch. It cannot be undone."
        onConfirm={() => { void resetDemo(); }}
      />
    </div>
  );
};

/* ------------------------------------------------------- organization */

const OrganizationTab = () => {
  const { db } = useApp();
  const org = db.organization;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Organization" icon={Building2} subtitle="Legal entity and tax registration" />
          <KeyValue items={[
            { label: 'Legal name', value: org.legalName },
            { label: 'Doing business as', value: org.dba },
            { label: 'Federal EIN', value: org.ein },
            { label: 'Industry', value: org.industry },
            { label: 'Address', value: `${org.addressLine1}, ${org.city}, ${org.state} ${org.postalCode}`, span: true },
            { label: 'Fiscal year start', value: org.fiscalYearStart },
            { label: 'Default timezone', value: org.timezone },
            { label: 'Currency', value: org.defaultCurrency },
            { label: 'Workweek starts', value: org.workweekStart === 0 ? 'Sunday' : 'Monday' },
          ]} />
        </Card>

        <Card>
          <CardHeader title="Pay schedules" icon={Settings2} subtitle="Frequency and check dating by pay group" />
          <ul className="space-y-3">
            {db.payGroups.map((p) => (
              <li key={p.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{p.name}</p>
                  <Badge tone="brand" className="capitalize">{p.frequency}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Check date {p.checkDateOffsetDays} days after period end · GL segment {p.glSegment}
                </p>
                <p className="mt-1 text-2xs text-faint">
                  {db.employees.filter((e) => e.payGroupId === p.id && e.status === 'active').length} employees ·
                  {' '}{p.locationIds.map((l) => db.locations.find((x) => x.id === l)?.code).join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Overtime rules" dense icon={Settings2} />
          <ul className="space-y-2 text-xs text-muted">
            <li>Over 40 worked hours in a Sunday-start week pays at 1.5×</li>
            <li>Over 52 worked hours in a week pays at 2×</li>
            <li>Paid leave and holiday hours do not count toward overtime</li>
            <li>Overtime above 12 hours in a period is flagged for review before payroll</li>
          </ul>
        </Card>
        <Card>
          <CardHeader title="Break rules" dense icon={Settings2} />
          <ul className="space-y-2 text-xs text-muted">
            <li>30-minute unpaid meal break required on shifts of 6 hours or more</li>
            <li>Breaks shorter than policy are flagged as attendance exceptions</li>
            <li>Break time is excluded from paid hours automatically</li>
          </ul>
        </Card>
        <Card>
          <CardHeader title="Approval workflows" dense icon={Workflow} />
          <ul className="space-y-2 text-xs text-muted">
            <li>Time off: manager approval, HR override</li>
            <li>Timecards: manager approval before payroll release</li>
            <li>Expenses: manager, then Finance above $2,500</li>
            <li>Payroll: process, validate, approve, finalize — separate roles</li>
            <li>Offers: hiring manager approval, executive above band</li>
          </ul>
        </Card>
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader dense title="Holiday calendar" icon={Settings2}
            subtitle={`${db.holidays.filter((h) => h.date.startsWith(db.meta.today.slice(0, 4))).length} paid holidays this year`} />
        </div>
        <div className="scroll-x">
          <table className="dt">
            <thead><tr><th>Holiday</th><th>Date</th><th className="text-center">Paid</th><th>Applies to</th></tr></thead>
            <tbody>
              {db.holidays.filter((h) => h.date.startsWith(db.meta.today.slice(0, 4))).map((h) => (
                <tr key={h.id}>
                  <td className="text-sm">{h.name}</td>
                  <td className="text-sm">{fmtDate(h.date)}</td>
                  <td className="text-center">{h.paid ? <Badge tone="success">Paid</Badge> : <Badge tone="neutral">Unpaid</Badge>}</td>
                  <td className="text-sm text-muted">{h.locationIds.length ? h.locationIds.join(', ') : 'All locations'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

/* ------------------------------------------------------------ security */

const SecurityTab = () => {
  const { db, can, update } = useApp();
  const lookups = useLookups();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [detail, setDetail] = useState<UserAccount | null>(null);
  const [matrixRole, setMatrixRole] = useState<Role>('manager');

  const users = db.users
    .filter((u) => (roleFilter === 'all' ? true : u.roles.includes(roleFilter as Role)))
    .filter((u) => {
      const q = query.trim().toLowerCase();
      return !q || `${u.displayName} ${u.email}`.toLowerCase().includes(q);
    });

  const mfaRate = db.users.length ? (db.users.filter((u) => u.mfaEnabled).length / db.users.length) * 100 : 0;

  const columns: Column<UserAccount>[] = [
    {
      key: 'user', header: 'User', sortValue: (u) => u.displayName,
      render: (u) => {
        const e = u.employeeId ? lookups.employee.get(u.employeeId) : null;
        return (
          <span className="flex items-center gap-2.5">
            {e ? <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={26} /> : null}
            <span className="min-w-0">
              <span className="block truncate text-sm">{u.displayName}</span>
              <span className="block truncate text-xs text-muted">{u.email}</span>
            </span>
          </span>
        );
      },
    },
    {
      key: 'roles', header: 'Roles', hideBelow: 'sm',
      render: (u) => (
        <span className="flex flex-wrap gap-1">
          {u.roles.map((r) => <Badge key={r} tone={r === 'employee' ? 'neutral' : 'brand'}>{ROLES.find((x) => x.id === r)?.short ?? r}</Badge>)}
        </span>
      ),
    },
    { key: 'mfa', header: 'MFA', align: 'center', hideBelow: 'md', sortValue: (u) => String(u.mfaEnabled), render: (u) => u.mfaEnabled ? <Badge tone="success">{u.mfaMethod}</Badge> : <Badge tone="danger">Off</Badge> },
    { key: 'last', header: 'Last sign-in', hideBelow: 'lg', sortValue: (u) => u.lastLoginAt ?? '', render: (u) => <span className="text-sm">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</span> },
    { key: 'status', header: 'Status', align: 'center', sortValue: (u) => u.status, render: (u) => <StatusBadge status={u.status} /> },
    { key: 'go', header: '', align: 'right', render: (u) => <Button size="xs" onClick={() => setDetail(u)}>Manage</Button> },
  ];

  const permissionsForRole = ROLE_PERMISSIONS[matrixRole] ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, { key: Permission; label: string; granted: boolean }[]>();
    for (const [key, label] of Object.entries(PERMISSIONS) as [Permission, string][]) {
      const group = key.split('.')[0];
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push({ key, label, granted: permissionsForRole.includes(key) });
    }
    return [...map.entries()];
  }, [permissionsForRole]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="User accounts" value={num(db.users.length)} icon={Users} />
        <StatTile label="MFA adoption" value={`${Math.round(mfaRate)}%`} icon={ShieldCheck} tone={mfaRate > 80 ? 'success' : 'warning'} />
        <StatTile label="Active sessions" value={num(db.users.reduce((s, u) => s + u.sessions.length, 0))} icon={Key} tone="teal" />
        <StatTile label="Disabled accounts" value={num(db.users.filter((u) => u.status === 'disabled').length)} icon={Lock} />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search users…" className="min-w-[14rem] flex-1" />
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-auto">
            <option value="all">All roles</option>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </div>
        <DataTable rows={users} columns={columns} getRowId={(u) => u.id} pageSize={12}
          empty={<EmptyState icon={Users} title="No accounts match" />} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
            <div>
              <h3 className="text-sm font-semibold">Permission matrix</h3>
              <p className="text-xs text-muted">What each role can do. Roles combine additively on an account.</p>
            </div>
            <Select value={matrixRole} onChange={(e) => setMatrixRole(e.target.value as Role)} className="w-auto">
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          </div>
          <div className="max-h-[26rem] overflow-y-auto p-4">
            {grouped.map(([group, perms]) => (
              <div key={group} className="mb-4 last:mb-0">
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">{group}</p>
                <ul className="space-y-1">
                  {perms.map((p) => (
                    <li key={p.key} className="flex items-center justify-between gap-3 text-xs">
                      <span className={cx(p.granted ? 'text-ink' : 'text-faint')}>{p.label}</span>
                      {p.granted
                        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success-500" />
                        : <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-line-strong" />}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Permission groups" icon={Users} />
          <ul className="space-y-3">
            {db.permissionGroups.map((g) => (
              <li key={g.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{g.name}</p>
                  {g.system ? <Badge tone="neutral">System</Badge> : <Badge tone="brand">Custom</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted">{g.description}</p>
                <p className="mt-1.5 text-2xs text-faint">{g.memberUserIds.length} members · {g.permissions.length} permissions</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <UserModal user={detail} onClose={() => setDetail(null)} canManage={can('security.manage')}
        onToggleRole={(userId, role, add) => {
          update((draft) => {
            const u = draft.users.find((x) => x.id === userId);
            if (!u) return;
            u.roles = add ? [...new Set([...u.roles, role])] : u.roles.filter((r) => r !== role);
            const emp = draft.employees.find((e) => e.id === u.employeeId);
            if (emp) emp.roles = u.roles;
          }, {
            action: add ? 'Granted role' : 'Revoked role', objectType: 'UserAccount', objectId: userId,
            objectLabel: db.users.find((u) => u.id === userId)?.displayName ?? userId,
            module: 'Security', severity: 'critical',
            changes: [{ field: 'roles', from: db.users.find((u) => u.id === userId)?.roles.join(', ') ?? '', to: role }],
          });
        }}
        onEndSessions={(userId) => {
          update((draft) => {
            const u = draft.users.find((x) => x.id === userId);
            if (u) u.sessions = [];
          }, {
            action: 'Ended all sessions', objectType: 'UserAccount', objectId: userId,
            objectLabel: db.users.find((u) => u.id === userId)?.displayName ?? userId,
            module: 'Security', severity: 'critical',
          });
        }}
        onSetStatus={(userId, status) => {
          update((draft) => {
            const u = draft.users.find((x) => x.id === userId);
            if (u) { u.status = status; if (status !== 'active') u.sessions = []; }
          }, {
            action: `Set account ${status}`, objectType: 'UserAccount', objectId: userId,
            objectLabel: db.users.find((u) => u.id === userId)?.displayName ?? userId,
            module: 'Security', severity: 'critical',
          });
        }}
      />
    </div>
  );
};

const UserModal = ({
  user, onClose, canManage, onToggleRole, onEndSessions, onSetStatus,
}: {
  user: UserAccount | null; onClose: () => void; canManage: boolean;
  onToggleRole: (userId: string, role: Role, add: boolean) => void;
  onEndSessions: (userId: string) => void;
  onSetStatus: (userId: string, status: UserAccount['status']) => void;
}) => {
  const lookups = useLookups();
  if (!user) return null;
  const emp = user.employeeId ? lookups.employee.get(user.employeeId) : null;

  return (
    <Modal
      open onClose={onClose} size="lg" icon={Shield}
      title={user.displayName} subtitle={user.email}
      footer={
        canManage ? (
          <>
            <Button variant="danger" onClick={() => { onSetStatus(user.id, user.status === 'active' ? 'disabled' : 'active'); onClose(); }}>
              {user.status === 'active' ? 'Disable account' : 'Re-enable account'}
            </Button>
            <div className="flex-1" />
            <Button onClick={() => { onEndSessions(user.id); onClose(); }}>End all sessions</Button>
            <Button variant="primary" onClick={onClose}>Done</Button>
          </>
        ) : <Button onClick={onClose}>Close</Button>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          {emp ? <Avatar first={emp.firstName} last={emp.lastName} seed={emp.avatarSeed} size={44} /> : null}
          <div className="min-w-0">
            <p className="text-sm font-medium">{emp ? `${emp.firstName} ${emp.lastName}` : user.displayName}</p>
            <p className="text-xs text-muted">
              {emp ? lookups.jobTitle.get(emp.jobTitleId)?.name : 'Service account'} · <StatusBadge status={user.status} />
            </p>
          </div>
        </div>

        <KeyValue columns={2} items={[
          { label: 'Multi-factor authentication', value: user.mfaEnabled ? `Enabled (${user.mfaMethod})` : 'Not enabled' },
          { label: 'Password last changed', value: fmtDate(user.passwordUpdatedAt) },
          { label: 'Last sign-in', value: user.lastLoginAt ? fmtDateTime(user.lastLoginAt) : 'Never' },
          { label: 'Failed attempts', value: num(user.failedAttempts) },
        ]} />

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Roles</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLES.map((r) => {
              const on = user.roles.includes(r.id);
              return (
                <div key={r.id} className={cx('flex items-start gap-2.5 rounded-lg border p-2.5',
                  on ? 'border-brand-300 bg-brand-50/50' : 'border-line')}>
                  <Toggle checked={on} disabled={!canManage || r.id === 'employee'}
                    onChange={(v) => onToggleRole(user.id, r.id, v)} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{r.label}</p>
                    <p className="text-2xs text-muted">{r.blurb}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Active sessions</h4>
          {user.sessions.length === 0 ? (
            <p className="text-xs text-muted">No active sessions.</p>
          ) : (
            <ul className="space-y-1.5">
              {user.sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2 text-xs">
                  <span>{s.device}</span>
                  <span className="text-muted">{s.ip}</span>
                  <span className="text-faint">{timeAgo(s.startedAt)}</span>
                  {s.current ? <Badge tone="brand">This session</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {!canManage ? <Alert tone="neutral" icon={Lock} title="Read-only">Managing accounts requires the System Administrator role.</Alert> : null}
      </div>
    </Modal>
  );
};

/* ---------------------------------------------------------- automation */

const AutomationTab = () => {
  const { db, can } = useApp();
  const { toggleAutomationRule } = useAdminActions();
  const lookups = useLookups();
  const [detail, setDetail] = useState<AutomationRule | null>(null);

  return (
    <div className="space-y-5">
      <Alert tone="info" icon={Zap} title="Rules run automatically when their trigger fires">
        Administrators configure triggers, conditions and actions without code. Every firing is logged with
        the subject record and the actions taken.
      </Alert>

      <div className="grid gap-4 md:grid-cols-2">
        {db.automationRules.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted">{r.description}</p>
              </div>
              <Toggle checked={r.enabled} disabled={!can('automation.manage')}
                onChange={(v) => toggleAutomationRule(r.id, v)} />
            </div>
            <div className="mt-3 space-y-1.5 rounded-lg bg-sunken p-2.5 font-mono text-2xs">
              <p><span className="text-brand-700">WHEN</span> {r.trigger.replace(/_/g, ' ')}</p>
              {r.conditions.map((c, i) => (
                <p key={i}><span className="text-teal-700">IF</span> {c.field} {c.operator} {c.value}</p>
              ))}
              {r.actions.map((a, i) => (
                <p key={i}><span className="text-accent-700">THEN</span> {a.type.replace(/_/g, ' ')} → {a.target}</p>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <span className="text-2xs text-faint">
                Fired {num(r.fireCount)} times{r.lastFiredAt ? ` · last ${timeAgo(r.lastFiredAt)}` : ''}
              </span>
              <Button size="xs" onClick={() => setDetail(r)}>Activity</Button>
            </div>
          </Card>
        ))}
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-5"><CardHeader dense title="Recent automation activity" icon={Cpu} /></div>
        <ul className="divide-y divide-line">
          {db.automationLog.slice(0, 15).map((l) => {
            const subject = lookups.employee.get(l.subjectId);
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                <div className="min-w-0">
                  <p className="text-sm">{l.ruleName}</p>
                  <p className="text-xs text-muted">{l.outcome}</p>
                </div>
                <div className="flex items-center gap-3">
                  {subject ? <span className="text-xs text-muted">{subject.preferredName} {subject.lastName}</span> : null}
                  <span className="text-2xs text-faint">{timeAgo(l.at)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.name ?? ''} icon={Workflow}
        subtitle={detail ? `Fired ${num(detail.fireCount)} times` : ''}>
        {detail ? (
          <div className="space-y-4">
            <KeyValue items={[
              { label: 'Trigger', value: detail.trigger.replace(/_/g, ' ') },
              { label: 'Status', value: detail.enabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="neutral">Disabled</Badge> },
              { label: 'Created', value: fmtDate(detail.createdAt.slice(0, 10)) },
              { label: 'Last fired', value: detail.lastFiredAt ? fmtDateTime(detail.lastFiredAt) : 'Never' },
            ]} />
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Recent firings</h4>
              <ul className="space-y-1.5">
                {db.automationLog.filter((l) => l.ruleId === detail.id).slice(0, 10).map((l) => {
                  const subject = lookups.employee.get(l.subjectId);
                  return (
                    <li key={l.id} className="rounded-lg border border-line px-2.5 py-2 text-xs">
                      <div className="flex justify-between gap-2">
                        <span>{subject ? `${subject.preferredName} ${subject.lastName}` : l.subjectId}</span>
                        <span className="text-faint">{timeAgo(l.at)}</span>
                      </div>
                      <p className="mt-0.5 text-muted">{l.outcome}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

/* -------------------------------------------------------- integrations */

const IntegrationsTab = () => {
  const { db } = useApp();
  const byCategory = useMemo(() => {
    const map = new Map<string, typeof db.integrations>();
    for (const i of db.integrations) {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category)!.push(i);
    }
    return [...map.entries()];
  }, [db.integrations]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Connected" value={num(db.integrations.filter((i) => i.status === 'connected').length)} icon={Link2} tone="success" />
        <StatTile label="Available" value={num(db.integrations.filter((i) => i.status === 'available').length)} icon={Link2} />
        <StatTile label="Errors" value={num(db.integrations.filter((i) => i.status === 'error').length)} icon={AlertTriangle}
          tone={db.integrations.some((i) => i.status === 'error') ? 'danger' : 'success'} />
        <StatTile label="Degraded" value={num(db.integrations.filter((i) => i.health === 'degraded').length)} icon={AlertTriangle} tone="warning" />
      </div>

      {byCategory.map(([category, items]) => (
        <div key={category}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">{category.replace(/_/g, ' ')}</h3>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((i) => (
              <Card key={i.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{i.name}</p>
                    <p className="mt-0.5 text-xs text-muted">{i.vendor}</p>
                  </div>
                  <StatusBadge status={i.status} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">{i.description}</p>
                <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-2xs">
                  <div className="flex justify-between"><dt className="text-faint">Direction</dt><dd className="capitalize">{i.direction}</dd></div>
                  <div className="flex justify-between"><dt className="text-faint">Frequency</dt><dd>{i.syncFrequency}</dd></div>
                  <div className="flex justify-between"><dt className="text-faint">Last sync</dt><dd>{i.lastSyncAt ? timeAgo(i.lastSyncAt) : '—'}</dd></div>
                  <div className="flex justify-between">
                    <dt className="text-faint">Health</dt>
                    <dd className={cx(i.health === 'healthy' ? 'text-success-600' : i.health === 'degraded' ? 'text-warning-600' : i.health === 'failing' ? 'text-danger-600' : 'text-faint')}>
                      {i.health}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-1">
                  {i.scopes.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
                </div>
                <Button className="mt-3" size="sm" block variant={i.status === 'connected' ? 'secondary' : 'primary'} disabled>
                  {i.status === 'connected' ? 'Configure' : i.status === 'error' ? 'Reconnect' : 'Connect'}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/* --------------------------------------------------------- preferences */

const PreferencesTab = ({
  theme, setTheme, persistence, onReset,
}: {
  theme: 'light' | 'dark'; setTheme: (t: 'light' | 'dark') => void;
  persistence: string; onReset: () => void;
}) => {
  const { db, user } = useApp();

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Appearance" icon={Palette} subtitle="Applies to your account on this device" />
          <div className="grid gap-3 sm:grid-cols-2">
            {(['light', 'dark'] as const).map((t) => (
              <button key={t} onClick={() => setTheme(t)}
                className={cx('rounded-xl border p-3 text-left transition-colors',
                  theme === t ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30' : 'border-line hover:bg-sunken')}>
                <div className={cx('mb-2 h-16 rounded-lg border', t === 'light' ? 'border-line bg-white' : 'border-[#272a3e] bg-[#161726]')}>
                  <div className={cx('m-2 h-2 w-12 rounded', t === 'light' ? 'bg-[#e5e6f0]' : 'bg-[#373a53]')} />
                  <div className={cx('mx-2 h-2 w-8 rounded', t === 'light' ? 'bg-[#5B3FD6]' : 'bg-[#8C79EE]')} />
                </div>
                <p className="text-sm font-medium capitalize">{t}</p>
                <p className="text-xs text-muted">{t === 'light' ? 'Default enterprise theme' : 'Reduced-glare theme for low light'}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Notification channels" icon={Settings2} subtitle="How Meridian reaches you" />
          <ul className="space-y-3">
            {[
              ['In-app notifications', 'Always on for approvals, tasks and alerts.', true],
              ['Email', 'Approvals, pay statements, signature requests.', true],
              ['Push notifications', 'Time-sensitive approvals and schedule changes.', true],
              ['SMS', 'Urgent shift coverage and payroll deadlines.', false],
            ].map(([label, detail, on]) => (
              <li key={label as string} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">{label}</p>
                  <p className="text-xs text-muted">{detail}</p>
                </div>
                <Toggle checked={on as boolean} onChange={() => undefined} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="This environment" icon={Cpu} subtitle="Demo data lives in your browser and never leaves it" />
        <KeyValue columns={3} items={[
          { label: 'Signed in as', value: user?.displayName ?? '—' },
          { label: 'Storage', value: persistence === 'idb' ? 'IndexedDB' : persistence === 'local' ? 'Local storage' : 'In-memory only' },
          { label: 'Dataset seeded', value: fmtDate(db.meta.seededAt.slice(0, 10)) },
          { label: 'Employees', value: num(db.employees.length) },
          { label: 'Pay statements', value: num(db.paychecks.length) },
          { label: 'Audit entries', value: num(db.auditLog.length) },
        ]} />
        <Alert className="mt-4" tone="warning" icon={RefreshCw} title="Reset the demo"
          action={<Button size="sm" variant="danger" onClick={onReset}>Reset data</Button>}>
          Regenerates the entire organization. Every approval, hire, payroll run and document you created is discarded.
        </Alert>
      </Card>
    </div>
  );
};
