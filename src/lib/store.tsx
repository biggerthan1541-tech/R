import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import type {
  AppNotification, AuditEntry, AutomationLogEntry, Database, Employee, ID, ISODate,
  NotificationKind, Role, TriggerEvent, UserAccount, WorkTask,
} from './types';
import type { Permission, Scope } from './permissions';
import { ROLE_PERMISSIONS, permissionsFor, scopeOf, teamOf, visibleEmployeeIds } from './permissions';
import { buildDatabase } from './seed';
import { clearState, loadState, readSetting, saveState, writeSetting } from './storage';
import { toISODate } from './dates';
import { uid } from './rng';

/* --------------------------------------------------------------- toasts */

export interface Toast {
  id: string;
  title: string;
  body?: string;
  kind: 'success' | 'error' | 'info' | 'warning';
}

/* -------------------------------------------------------------- context */

export interface AuditInput {
  action: string;
  objectType: string;
  objectId: ID;
  objectLabel: string;
  module: string;
  changes?: { field: string; from: string; to: string }[];
  severity?: AuditEntry['severity'];
}

export interface NotifyInput {
  userId: ID;
  kind: NotificationKind;
  title: string;
  body: string;
  actionPath?: string | null;
  severity?: AppNotification['severity'];
  channels?: AppNotification['channels'];
}

export interface TaskInput {
  assigneeId: ID;
  kind: NotificationKind;
  title: string;
  detail: string;
  dueDate: ISODate;
  priority?: WorkTask['priority'];
  actionPath?: string | null;
  relatedId?: ID | null;
}

export interface AutomationContext {
  subjectEmployeeId: ID | null;
  values: Record<string, string | number>;
  tokens: Record<string, string>;
}

interface AppContextValue {
  db: Database;
  today: ISODate;
  ready: boolean;
  persistence: 'idb' | 'local' | 'memory';
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;

  user: UserAccount | null;
  employee: Employee | null;
  activeRole: Role | 'all';
  setActiveRole: (r: Role | 'all') => void;
  permissions: Set<Permission>;
  can: (...perms: Permission[]) => boolean;
  scope: (module: string) => Scope;
  visibleIds: (module: string) => Set<ID>;
  team: Employee[];

  login: (userId: ID) => void;
  logout: () => void;

  update: (mutator: (draft: Database) => void, audit?: AuditInput | AuditInput[]) => void;
  audit: (entry: AuditInput) => void;
  notify: (input: NotifyInput) => void;
  createTask: (input: TaskInput) => void;
  runAutomation: (trigger: TriggerEvent, ctx: AutomationContext) => AutomationLogEntry[];

  toast: (t: Omit<Toast, 'id'>) => void;
  toasts: Toast[];
  dismissToast: (id: string) => void;

  resetDemo: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const useApp = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
};

/* ------------------------------------------------------------- provider */

const SESSION_KEY = 'session.userId';
const ROLE_KEY = 'session.activeRole';

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [db, setDb] = useState<Database | null>(null);
  const [ready, setReady] = useState(false);
  const [persistence, setPersistence] = useState<'idb' | 'local' | 'memory'>('idb');
  const [userId, setUserId] = useState<ID | null>(null);
  const [activeRole, setActiveRoleState] = useState<Role | 'all'>('all');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setThemeState] = useState<'light' | 'dark'>(
    () => (readSetting('theme', 'light') === 'dark' ? 'dark' : 'light'),
  );
  const saveTimer = useRef<number | null>(null);
  const dbRef = useRef<Database | null>(null);

  /* ---------------------------------------------------------- bootstrap */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadState();
      const next = stored && stored.meta?.version === 1 ? stored : buildDatabase();
      if (cancelled) return;
      dbRef.current = next;
      setDb(next);
      const savedUser = readSetting(SESSION_KEY, '');
      if (savedUser && next.users.some((u) => u.id === savedUser)) setUserId(savedUser);
      const savedRole = readSetting(ROLE_KEY, 'all') as Role | 'all';
      setActiveRoleState(savedRole);
      if (!stored) void saveState(next).then(setPersistence);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    writeSetting('theme', theme);
  }, [theme]);

  const persist = useCallback((next: Database) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveState(next).then(setPersistence);
    }, 700);
  }, []);

  /* ------------------------------------------------------------ session */

  const user = useMemo(
    () => (db && userId ? db.users.find((u) => u.id === userId) ?? null : null),
    [db, userId],
  );
  const employee = useMemo(
    () => (db && user?.employeeId ? db.employees.find((e) => e.id === user.employeeId) ?? null : null),
    [db, user],
  );

  const permissions = useMemo<Set<Permission>>(() => {
    if (!user) return new Set();
    if (activeRole === 'all' || !user.roles.includes(activeRole)) return permissionsFor(user);
    return new Set([...(ROLE_PERMISSIONS[activeRole] ?? []), ...(user.permissionOverrides as Permission[])]);
  }, [user, activeRole]);

  const can = useCallback(
    (...perms: Permission[]) => perms.some((p) => permissions.has(p)),
    [permissions],
  );
  const scope = useCallback((module: string) => scopeOf(permissions, module), [permissions]);
  const visibleIds = useCallback(
    (module: string) => visibleEmployeeIds(db?.employees ?? [], scopeOf(permissions, module), employee?.id ?? null),
    [db, permissions, employee],
  );
  const team = useMemo(
    () => (db && employee ? teamOf(db.employees, employee.id) : []),
    [db, employee],
  );

  /* ---------------------------------------------------------- mutations */

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid('toast');
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const appendAudit = useCallback((draft: Database, entry: AuditInput, actor: UserAccount | null) => {
    draft.auditLog.unshift({
      id: uid('aud'),
      at: new Date().toISOString(),
      actorId: actor?.id ?? 'system',
      actorName: actor?.displayName ?? 'System',
      action: entry.action,
      objectType: entry.objectType,
      objectId: entry.objectId,
      objectLabel: entry.objectLabel,
      changes: entry.changes ?? [],
      ipAddress: '10.14.22.108',
      device: 'Chrome · this session',
      severity: entry.severity ?? 'info',
      module: entry.module,
    });
    if (draft.auditLog.length > 1200) draft.auditLog.length = 1200;
  }, []);

  const update = useCallback(
    (mutator: (draft: Database) => void, auditEntry?: AuditInput | AuditInput[]) => {
      const current = dbRef.current;
      if (!current) return;
      mutator(current);
      if (auditEntry) {
        const entries = Array.isArray(auditEntry) ? auditEntry : [auditEntry];
        for (const e of entries) appendAudit(current, e, user);
      }
      const next = { ...current };
      dbRef.current = next;
      setDb(next);
      persist(next);
    },
    [appendAudit, persist, user],
  );

  const audit = useCallback((entry: AuditInput) => update(() => {}, entry), [update]);

  const notify = useCallback(
    (input: NotifyInput) => {
      update((draft) => {
        draft.notifications.unshift({
          id: uid('ntf'),
          userId: input.userId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          createdAt: new Date().toISOString(),
          read: false,
          actionPath: input.actionPath ?? null,
          severity: input.severity ?? 'info',
          channels: input.channels ?? ['in_app', 'email'],
        });
      });
    },
    [update],
  );

  const createTask = useCallback(
    (input: TaskInput) => {
      update((draft) => {
        draft.tasks.unshift({
          id: uid('tsk'),
          assigneeId: input.assigneeId,
          title: input.title,
          detail: input.detail,
          kind: input.kind,
          dueDate: input.dueDate,
          priority: input.priority ?? 'normal',
          status: 'open',
          actionPath: input.actionPath ?? null,
          createdAt: new Date().toISOString(),
          completedAt: null,
          relatedId: input.relatedId ?? null,
        });
      });
    },
    [update],
  );

  /* -------------------------------------------------- automation engine */

  const runAutomation = useCallback(
    (trigger: TriggerEvent, ctx: AutomationContext): AutomationLogEntry[] => {
      const current = dbRef.current;
      if (!current) return [];
      const fired: AutomationLogEntry[] = [];
      const rules = current.automationRules.filter((r) => r.enabled && r.trigger === trigger);

      const render = (template: string) =>
        template.replace(/\{(\w+)\}/g, (_, key: string) => ctx.tokens[key] ?? String(ctx.values[key] ?? `{${key}}`));

      const conditionsPass = (rule: (typeof rules)[number]) =>
        rule.conditions.every((c) => {
          const left = ctx.values[c.field];
          if (left === undefined) return true;
          const rightRaw = ctx.values[c.value] ?? c.value;
          const l = Number(left);
          const r = Number(rightRaw);
          switch (c.operator) {
            case 'gt': return Number.isFinite(l) && Number.isFinite(r) ? l > r : false;
            case 'lt': return Number.isFinite(l) && Number.isFinite(r) ? l < r : false;
            case 'eq': return String(left) === String(rightRaw);
            case 'neq': return String(left) !== String(rightRaw);
            case 'contains': return String(left).includes(String(rightRaw));
            default: return true;
          }
        });

      const subject = ctx.subjectEmployeeId
        ? current.employees.find((e) => e.id === ctx.subjectEmployeeId) ?? null
        : null;

      const resolveTargets = (target: string, targetId?: ID): ID[] => {
        switch (target) {
          case 'employee': return subject ? [subject.userId] : [];
          case 'manager': {
            const mgr = subject?.managerId
              ? current.employees.find((e) => e.id === subject.managerId)
              : null;
            return mgr ? [mgr.userId] : [];
          }
          case 'hr': return current.users.filter((u) => u.roles.includes('hr_admin')).slice(0, 2).map((u) => u.id);
          case 'payroll': return current.users.filter((u) => u.roles.includes('payroll_admin')).slice(0, 2).map((u) => u.id);
          case 'department_head': {
            const dept = current.departments.find((d) => d.id === subject?.departmentId);
            const head = dept?.headEmployeeId ? current.employees.find((e) => e.id === dept.headEmployeeId) : null;
            return head ? [head.userId] : [];
          }
          case 'custom':
            if (targetId === 'finance') return current.users.filter((u) => u.roles.includes('finance')).slice(0, 2).map((u) => u.id);
            return targetId ? [targetId] : [];
          default: return [];
        }
      };

      update((draft) => {
        for (const rule of rules) {
          const live = draft.automationRules.find((r) => r.id === rule.id)!;
          if (!conditionsPass(rule)) continue;
          const actionsTaken: string[] = [];

          for (const action of rule.actions) {
            const message = render(action.template);
            const targets = resolveTargets(action.target, action.targetId);
            if (action.type === 'notify' || action.type === 'email' || action.type === 'escalate') {
              for (const t of targets) {
                draft.notifications.unshift({
                  id: uid('ntf'), userId: t, kind: 'system', title: rule.name, body: message,
                  createdAt: new Date().toISOString(), read: false, actionPath: null,
                  severity: action.type === 'escalate' ? 'warning' : 'info',
                  channels: action.type === 'email' ? ['in_app', 'email'] : ['in_app'],
                });
              }
              actionsTaken.push(`${action.type} → ${action.target}: ${message}`);
            } else if (action.type === 'create_task') {
              for (const t of targets) {
                draft.tasks.unshift({
                  id: uid('tsk'), assigneeId: t, title: rule.name, detail: message, kind: 'system',
                  dueDate: toISODate(new Date(Date.now() + 3 * 86400000)), priority: 'high',
                  status: 'open', actionPath: null, createdAt: new Date().toISOString(),
                  completedAt: null, relatedId: ctx.subjectEmployeeId,
                });
              }
              actionsTaken.push(`task → ${action.target}: ${message}`);
            } else {
              actionsTaken.push(`${action.type}: ${message}`);
            }
          }

          const entry: AutomationLogEntry = {
            id: uid('alog'), ruleId: rule.id, ruleName: rule.name, at: new Date().toISOString(),
            subjectType: 'Employee', subjectId: ctx.subjectEmployeeId ?? '—',
            outcome: actionsTaken[0] ?? 'Rule matched with no actions', actionsTaken,
          };
          draft.automationLog.unshift(entry);
          if (draft.automationLog.length > 400) draft.automationLog.length = 400;
          live.lastFiredAt = entry.at;
          live.fireCount += 1;
          fired.push(entry);
        }
      });

      return fired;
    },
    [update],
  );

  /* -------------------------------------------------------------- auth */

  const login = useCallback((id: ID) => {
    setUserId(id);
    writeSetting(SESSION_KEY, id);
    setActiveRoleState('all');
    writeSetting(ROLE_KEY, 'all');
    const current = dbRef.current;
    if (!current) return;
    const account = current.users.find((u) => u.id === id);
    if (account) {
      account.lastLoginAt = new Date().toISOString();
      account.sessions = [
        { id: uid('sess'), startedAt: new Date().toISOString(), ip: '10.14.22.108', device: 'Chrome · this session', current: true },
        ...account.sessions.filter((s) => !s.current).slice(0, 3),
      ];
    }
  }, []);

  const logout = useCallback(() => {
    setUserId(null);
    writeSetting(SESSION_KEY, '');
  }, []);

  const setActiveRole = useCallback((r: Role | 'all') => {
    setActiveRoleState(r);
    writeSetting(ROLE_KEY, r);
  }, []);

  const setTheme = useCallback((t: 'light' | 'dark') => setThemeState(t), []);

  const resetDemo = useCallback(async () => {
    await clearState();
    const fresh = buildDatabase();
    dbRef.current = fresh;
    setDb(fresh);
    await saveState(fresh).then(setPersistence);
  }, []);

  const value = useMemo<AppContextValue | null>(
    () => (db ? {
      db, today: db.meta.today, ready, persistence, theme, setTheme,
      user, employee, activeRole, setActiveRole, permissions, can, scope, visibleIds, team,
      login, logout, update, audit, notify, createTask, runAutomation,
      toast, toasts, dismissToast, resetDemo,
    } : null),
    [db, ready, persistence, theme, setTheme, user, employee, activeRole, setActiveRole,
      permissions, can, scope, visibleIds, team, login, logout, update, audit, notify,
      createTask, runAutomation, toast, toasts, dismissToast, resetDemo],
  );

  if (!value) return <BootScreen />;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

const BootScreen = () => (
  <div className="min-h-screen grid place-items-center bg-shell text-shell-ink">
    <div className="flex flex-col items-center gap-5">
      <div className="relative h-14 w-14">
        <span className="absolute inset-0 rounded-full border-2 border-brand-400/30" />
        <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand-300 animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold tracking-[0.24em] uppercase text-brand-200">Meridian HCM</p>
        <p className="mt-1.5 text-sm text-shell-muted">Preparing your workforce data…</p>
      </div>
    </div>
  </div>
);

/* --------------------------------------------------------- convenience */

export const useDb = (): Database => useApp().db;

export const useEmployeeIndex = () => {
  const { db } = useApp();
  return useMemo(() => new Map(db.employees.map((e) => [e.id, e] as const)), [db.employees]);
};

export const useLookups = () => {
  const { db } = useApp();
  return useMemo(() => ({
    employee: new Map(db.employees.map((e) => [e.id, e] as const)),
    department: new Map(db.departments.map((d) => [d.id, d] as const)),
    location: new Map(db.locations.map((l) => [l.id, l] as const)),
    jobTitle: new Map(db.jobTitles.map((j) => [j.id, j] as const)),
    user: new Map(db.users.map((u) => [u.id, u] as const)),
    payGroup: new Map(db.payGroups.map((p) => [p.id, p] as const)),
    payPeriod: new Map(db.payPeriods.map((p) => [p.id, p] as const)),
    plan: new Map(db.benefitPlans.map((p) => [p.id, p] as const)),
    course: new Map(db.courses.map((c) => [c.id, c] as const)),
    candidate: new Map(db.candidates.map((c) => [c.id, c] as const)),
    requisition: new Map(db.requisitions.map((r) => [r.id, r] as const)),
  }), [db]);
};

export const employeeName = (e: Employee | undefined | null): string =>
  e ? `${e.preferredName} ${e.lastName}` : 'Unknown';

export const fullName = (e: Employee | undefined | null): string =>
  e ? `${e.firstName} ${e.lastName}` : 'Unknown';
