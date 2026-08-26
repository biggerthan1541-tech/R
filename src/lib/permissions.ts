import type { Employee, Role, RoleMeta, UserAccount } from './types';

/* ------------------------------------------------------------------ roles */

export const ROLES: RoleMeta[] = [
  { id: 'employee', label: 'Employee', short: 'EMP', blurb: 'Self-service: time, pay, benefits, tasks.' },
  { id: 'manager', label: 'Manager', short: 'MGR', blurb: 'Team approvals, scheduling, performance.' },
  { id: 'hr_admin', label: 'HR Administrator', short: 'HR', blurb: 'Records, lifecycle, compliance, reporting.' },
  { id: 'payroll_admin', label: 'Payroll Administrator', short: 'PAY', blurb: 'Payroll processing, taxes, deductions.' },
  { id: 'recruiter', label: 'Recruiter', short: 'REC', blurb: 'Requisitions, pipeline, offers.' },
  { id: 'benefits_admin', label: 'Benefits Administrator', short: 'BEN', blurb: 'Plans, eligibility, enrollment windows.' },
  { id: 'finance', label: 'Finance', short: 'FIN', blurb: 'Labor cost, expense reconciliation, GL.' },
  { id: 'sys_admin', label: 'System Administrator', short: 'SYS', blurb: 'Users, permissions, security, integrations.' },
  { id: 'executive', label: 'Executive', short: 'EXEC', blurb: 'Company-wide analytics and workforce KPIs.' },
];

export const roleLabel = (r: Role): string => ROLES.find((x) => x.id === r)?.label ?? r;

/* ------------------------------------------------------------ permissions */

export const PERMISSIONS = {
  // People / HR
  'people.view.self': 'View own profile',
  'people.view.team': 'View direct/indirect reports',
  'people.view.all': 'View all employee records',
  'people.edit.self': 'Edit own personal information',
  'people.edit.all': 'Edit any employee record',
  'people.sensitive.view': 'View SSN, DOB, compensation details',
  'people.lifecycle.manage': 'Hire, transfer, promote, terminate',
  'people.compensation.edit': 'Change compensation',

  // Time & attendance
  'time.punch': 'Clock in and out',
  'time.view.self': 'View own timecard',
  'time.view.team': 'View team timecards',
  'time.view.all': 'View all timecards',
  'time.approve': 'Approve or reject timecards',
  'time.edit': 'Edit punches and timecards',

  // Scheduling
  'schedule.view.self': 'View own schedule',
  'schedule.view.team': 'View team schedule',
  'schedule.view.all': 'View all schedules',
  'schedule.manage': 'Create, edit and publish shifts',

  // Time off
  'pto.request': 'Request time off',
  'pto.view.team': 'View team time off',
  'pto.view.all': 'View all time off',
  'pto.approve': 'Approve or deny time off',
  'pto.policy.manage': 'Configure policies, accruals, holidays',

  // Payroll
  'payroll.view.self': 'View own pay statements',
  'payroll.view.all': 'View all pay data',
  'payroll.process': 'Create and calculate payroll runs',
  'payroll.approve': 'Approve and finalize payroll',
  'payroll.tax.manage': 'Manage tax setup and garnishments',
  'payroll.gl.export': 'Export general ledger',

  // Benefits
  'benefits.view.self': 'View own benefits',
  'benefits.enroll': 'Enroll or change elections',
  'benefits.view.all': 'View all enrollments',
  'benefits.manage': 'Configure plans and enrollment windows',

  // Recruiting
  'recruiting.view': 'View requisitions and candidates',
  'recruiting.manage': 'Manage pipeline and requisitions',
  'recruiting.offer.create': 'Create offers',
  'recruiting.offer.approve': 'Approve offers',
  'recruiting.hire': 'Convert a candidate into an employee',

  // Onboarding
  'onboarding.view.self': 'Complete own onboarding',
  'onboarding.view.team': 'View team onboarding',
  'onboarding.manage': 'Manage onboarding packets and templates',

  // Performance / learning
  'performance.view.self': 'View own goals and reviews',
  'performance.view.team': 'View team performance',
  'performance.view.all': 'View all performance data',
  'performance.manage': 'Manage cycles and calibration',
  'learning.view.self': 'View own training',
  'learning.assign': 'Assign training',
  'learning.manage': 'Manage the course catalog',

  // Expenses
  'expense.submit': 'Submit expenses',
  'expense.approve.team': 'Approve team expenses',
  'expense.approve.finance': 'Finance review and reimbursement',
  'expense.view.all': 'View all expenses',

  // Documents
  'documents.view.self': 'View own documents',
  'documents.view.team': 'View team documents',
  'documents.view.all': 'View all documents',
  'documents.manage': 'Upload, share, and request signatures',

  // Reporting / analytics
  'reports.view': 'Run standard reports',
  'reports.view.all': 'Run company-wide reports',
  'analytics.view': 'View workforce analytics',

  // Administration
  'settings.view': 'View configuration',
  'settings.manage': 'Change organization configuration',
  'security.manage': 'Manage users, roles, and sessions',
  'audit.view': 'View the audit log',
  'automation.manage': 'Create and edit automation rules',
  'integrations.manage': 'Manage integrations',
} as const;

export type Permission = keyof typeof PERMISSIONS;

const EMPLOYEE_BASE: Permission[] = [
  'people.view.self', 'people.edit.self',
  'time.punch', 'time.view.self',
  'schedule.view.self',
  'pto.request',
  'payroll.view.self',
  'benefits.view.self', 'benefits.enroll',
  'onboarding.view.self',
  'performance.view.self',
  'learning.view.self',
  'expense.submit',
  'documents.view.self',
];

const MANAGER_EXTRA: Permission[] = [
  'people.view.team',
  'time.view.team', 'time.approve', 'time.edit',
  'schedule.view.team', 'schedule.manage',
  'pto.view.team', 'pto.approve',
  'onboarding.view.team',
  'performance.view.team',
  'learning.assign',
  'expense.approve.team',
  'documents.view.team',
  'reports.view',
];

const HR_EXTRA: Permission[] = [
  'people.view.all', 'people.edit.all', 'people.sensitive.view',
  'people.lifecycle.manage', 'people.compensation.edit',
  'time.view.all', 'time.approve', 'time.edit',
  'schedule.view.all', 'schedule.manage',
  'pto.view.all', 'pto.approve', 'pto.policy.manage',
  'benefits.view.all',
  'recruiting.view', 'recruiting.hire',
  'onboarding.manage', 'onboarding.view.team',
  'performance.view.all', 'performance.manage',
  'learning.assign', 'learning.manage',
  'documents.view.all', 'documents.manage',
  'reports.view', 'reports.view.all', 'analytics.view',
  'settings.view', 'audit.view', 'automation.manage',
];

const PAYROLL_EXTRA: Permission[] = [
  'people.view.all', 'people.sensitive.view',
  'time.view.all', 'time.approve',
  'pto.view.all',
  'payroll.view.all', 'payroll.process', 'payroll.approve',
  'payroll.tax.manage', 'payroll.gl.export',
  'benefits.view.all',
  'documents.view.all', 'documents.manage',
  'reports.view', 'reports.view.all', 'analytics.view',
  'settings.view', 'audit.view',
];

const RECRUITER_EXTRA: Permission[] = [
  'people.view.all',
  'recruiting.view', 'recruiting.manage', 'recruiting.offer.create', 'recruiting.hire',
  'onboarding.manage',
  'documents.view.all', 'documents.manage',
  'reports.view',
];

const BENEFITS_EXTRA: Permission[] = [
  'people.view.all', 'people.sensitive.view',
  'benefits.view.all', 'benefits.manage',
  'documents.view.all', 'documents.manage',
  'reports.view', 'reports.view.all', 'analytics.view',
  'settings.view', 'audit.view',
];

const FINANCE_EXTRA: Permission[] = [
  'people.view.all',
  'payroll.view.all', 'payroll.gl.export',
  'expense.approve.finance', 'expense.view.all',
  'reports.view', 'reports.view.all', 'analytics.view',
  'settings.view', 'audit.view',
];

const EXEC_EXTRA: Permission[] = [
  'people.view.all',
  'time.view.all', 'pto.view.all',
  'payroll.view.all',
  'recruiting.view',
  'performance.view.all',
  'benefits.view.all',
  'expense.view.all',
  'reports.view', 'reports.view.all', 'analytics.view',
];

const SYS_EXTRA: Permission[] = (Object.keys(PERMISSIONS) as Permission[]).filter(
  (p) => !['payroll.approve', 'payroll.process'].includes(p),
);

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  employee: EMPLOYEE_BASE,
  manager: [...EMPLOYEE_BASE, ...MANAGER_EXTRA],
  hr_admin: [...EMPLOYEE_BASE, ...MANAGER_EXTRA, ...HR_EXTRA],
  payroll_admin: [...EMPLOYEE_BASE, ...PAYROLL_EXTRA],
  recruiter: [...EMPLOYEE_BASE, ...RECRUITER_EXTRA],
  benefits_admin: [...EMPLOYEE_BASE, ...BENEFITS_EXTRA],
  finance: [...EMPLOYEE_BASE, ...FINANCE_EXTRA],
  sys_admin: [...EMPLOYEE_BASE, ...SYS_EXTRA],
  executive: [...EMPLOYEE_BASE, ...MANAGER_EXTRA, ...EXEC_EXTRA],
};

export const permissionsFor = (user: Pick<UserAccount, 'roles' | 'permissionOverrides'>): Set<Permission> => {
  const set = new Set<Permission>();
  for (const role of user.roles) for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  for (const p of user.permissionOverrides ?? []) set.add(p as Permission);
  return set;
};

export const hasPermission = (perms: Set<Permission>, ...required: Permission[]): boolean =>
  required.some((p) => perms.has(p));

/** How wide a module's data window is for this user. */
export type Scope = 'all' | 'team' | 'self' | 'none';

export const scopeOf = (perms: Set<Permission>, module: string): Scope => {
  if (perms.has(`${module}.view.all` as Permission)) return 'all';
  if (perms.has(`${module}.view.team` as Permission)) return 'team';
  if (perms.has(`${module}.view.self` as Permission)) return 'self';
  return 'none';
};

/** Every employee at or below `managerId` in the reporting tree. */
export const teamOf = (employees: Employee[], managerId: string, deep = true): Employee[] => {
  const direct = employees.filter((e) => e.managerId === managerId);
  if (!deep) return direct;
  const out: Employee[] = [];
  const queue = [...direct];
  const seen = new Set<string>();
  while (queue.length) {
    const e = queue.shift()!;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
    queue.push(...employees.filter((c) => c.managerId === e.id));
  }
  return out;
};

/** The employee ids a viewer may see, given a module scope. */
export const visibleEmployeeIds = (
  employees: Employee[],
  scope: Scope,
  selfEmployeeId: string | null,
): Set<string> => {
  if (scope === 'all') return new Set(employees.map((e) => e.id));
  if (scope === 'none' || !selfEmployeeId) return new Set();
  if (scope === 'self') return new Set([selfEmployeeId]);
  const ids = new Set(teamOf(employees, selfEmployeeId).map((e) => e.id));
  ids.add(selfEmployeeId);
  return ids;
};
