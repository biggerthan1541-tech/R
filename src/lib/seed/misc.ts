import type {
  Announcement, AppNotification, AuditEntry, AutomationLogEntry, Employee, Expense,
  ExpenseCategory, ExpenseReport, ID, ISODate, OnboardingTask, PtoRequest, EmployeeDocument,
  SignatureRequest, Timecard, TrainingAssignment, WorkTask,
} from '../types';
import { Rng } from '../rng';
import { addDays, diffDays, isoAt } from '../dates';
import { round2 } from '../payroll';
import { ANNOUNCEMENT_SEEDS, MERCHANTS } from './names';

/* -------------------------------------------------------------- documents */

const COMPANY_DOCS: { name: string; category: EmployeeDocument['category']; sign: boolean }[] = [
  { name: 'Employee Handbook 2026', category: 'policy', sign: true },
  { name: 'Code of Business Conduct', category: 'policy', sign: true },
  { name: 'Workplace Safety Manual', category: 'compliance', sign: false },
  { name: 'Expense & Travel Policy', category: 'policy', sign: false },
  { name: '2026 Benefits Guide', category: 'benefits', sign: false },
  { name: 'Remote Work Agreement Template', category: 'policy', sign: false },
  { name: 'Information Security Policy', category: 'compliance', sign: true },
  { name: 'Anti-Harassment Policy', category: 'compliance', sign: false },
  { name: 'Paid Time Off Policy', category: 'policy', sign: false },
  { name: 'Vehicle & Equipment Use Policy', category: 'policy', sign: false },
];

const PERSONAL_DOCS: { name: string; category: EmployeeDocument['category']; conf: boolean }[] = [
  { name: 'Offer Letter', category: 'contract', conf: true },
  { name: 'Form W-4 (2025)', category: 'tax', conf: true },
  { name: 'Form I-9', category: 'compliance', conf: true },
  { name: 'Direct Deposit Authorization', category: 'payroll', conf: true },
  { name: 'Benefits Election Confirmation', category: 'benefits', conf: true },
  { name: 'Emergency Contact Form', category: 'personal', conf: false },
];

export interface DocumentSeed {
  documents: EmployeeDocument[];
  signatures: SignatureRequest[];
}

export const seedDocuments = (rng: Rng, employees: Employee[], today: ISODate): DocumentSeed => {
  const documents: EmployeeDocument[] = [];
  const signatures: SignatureRequest[] = [];
  let n = 0;

  for (const d of COMPANY_DOCS) {
    const uploaded = addDays(today, -rng.int(30, 400));
    documents.push({
      id: `doc_co_${++n}`, name: `${d.name}.pdf`, category: d.category, employeeId: null,
      ownerId: 'usr_hr', fileType: 'pdf', sizeKb: rng.int(180, 2400),
      uploadedAt: isoAt(uploaded, '10:00'), uploadedBy: 'usr_hr',
      expiresOn: d.category === 'compliance' ? addDays(uploaded, 730) : null,
      version: rng.int(1, 4),
      versions: [{ version: 1, at: isoAt(addDays(uploaded, -365), '10:00'), byId: 'usr_hr', note: 'Initial publication' }],
      requiresSignature: d.sign, signatureRequestId: null,
      visibility: 'company', tags: ['policy', 'all-employees'], confidential: false,
    });
  }

  for (const emp of employees) {
    if (emp.status === 'terminated') continue;
    const set = emp.status === 'pending_hire' ? PERSONAL_DOCS.slice(0, 2) : PERSONAL_DOCS;
    for (const d of set) {
      if (rng.chance(0.12)) continue;
      documents.push({
        id: `doc_${emp.id}_${d.name.replace(/\W+/g, '')}`,
        name: `${emp.lastName}_${d.name.replace(/\s+/g, '_')}.pdf`,
        category: d.category, employeeId: emp.id, ownerId: emp.userId, fileType: 'pdf',
        sizeKb: rng.int(60, 600),
        uploadedAt: isoAt(addDays(emp.hireDate, rng.int(0, 12)), '11:30'),
        uploadedBy: d.category === 'contract' ? 'usr_hr' : emp.userId,
        expiresOn: null, version: 1,
        versions: [], requiresSignature: false, signatureRequestId: null,
        visibility: 'hr', tags: [d.category], confidential: d.conf,
      });
    }
    if (diffDays(emp.hireDate, today) > 365) {
      documents.push({
        id: `doc_${emp.id}_w2`, name: `${emp.lastName}_W2_${Number(today.slice(0, 4)) - 1}.pdf`,
        category: 'tax', employeeId: emp.id, ownerId: emp.userId, fileType: 'pdf', sizeKb: rng.int(80, 160),
        uploadedAt: `${today.slice(0, 4)}-01-28T15:00:00.000Z`, uploadedBy: 'usr_payroll',
        expiresOn: null, version: 1, versions: [], requiresSignature: false, signatureRequestId: null,
        visibility: 'employee', tags: ['w2', 'year-end'], confidential: true,
      });
    }
    for (const cert of emp.certifications) {
      if (!cert.expires) continue;
      documents.push({
        id: `doc_${emp.id}_${cert.name.replace(/\W+/g, '').slice(0, 14)}`,
        name: `${emp.lastName}_${cert.name.replace(/\W+/g, '_')}.pdf`,
        category: 'training', employeeId: emp.id, ownerId: emp.userId, fileType: 'pdf', sizeKb: rng.int(40, 220),
        uploadedAt: isoAt(cert.issued, '09:00'), uploadedBy: emp.userId,
        expiresOn: cert.expires, version: 1, versions: [], requiresSignature: false,
        signatureRequestId: null, visibility: 'manager', tags: ['certification'], confidential: false,
      });
    }
  }

  // A live company-wide acknowledgement campaign plus per-hire handbook signing.
  const handbook = documents.find((d) => d.name.startsWith('Employee Handbook'))!;
  const audience = employees.filter((e) => e.status === 'active').slice(0, 46);
  signatures.push({
    id: 'sig_handbook_2026', documentId: handbook.id, documentName: handbook.name,
    requestedBy: 'usr_hr', createdAt: isoAt(addDays(today, -12), '09:00'),
    dueDate: addDays(today, 9), state: 'sent', documentVersion: handbook.version,
    signers: audience.map((e, i) => {
      const state: SignatureRequest['state'] = i < 28 ? 'signed' : i < 36 ? 'viewed' : 'sent';
      return {
        employeeId: e.id, order: 1, state,
        viewedAt: state === 'sent' ? null : isoAt(addDays(today, -rng.int(1, 10)), '13:00'),
        signedAt: state === 'signed' ? isoAt(addDays(today, -rng.int(1, 9)), '13:05') : null,
        signatureText: state === 'signed' ? `${e.firstName} ${e.lastName}` : null,
        ipAddress: state === 'signed' ? `10.${rng.int(0, 40)}.${rng.int(0, 255)}.${rng.int(2, 254)}` : null,
      };
    }),
    auditTrail: [
      { at: isoAt(addDays(today, -12), '09:00'), actorId: 'usr_hr', event: 'Signature request created' },
      { at: isoAt(addDays(today, -12), '09:02'), actorId: 'usr_hr', event: `Sent to ${audience.length} recipients` },
      { at: isoAt(addDays(today, -6), '11:14'), actorId: 'usr_hr', event: 'Reminder sent to 18 outstanding recipients' },
    ],
  });
  handbook.signatureRequestId = 'sig_handbook_2026';

  const secDoc = documents.find((d) => d.name.startsWith('Information Security'))!;
  const secAudience = employees.filter((e) => e.status === 'active').slice(40, 74);
  signatures.push({
    id: 'sig_infosec', documentId: secDoc.id, documentName: secDoc.name,
    requestedBy: 'usr_sys', createdAt: isoAt(addDays(today, -30), '08:30'),
    dueDate: addDays(today, -2), state: 'sent', documentVersion: secDoc.version,
    signers: secAudience.map((e, i) => ({
      employeeId: e.id, order: 1,
      state: (i < 30 ? 'signed' : 'viewed') as SignatureRequest['state'],
      viewedAt: isoAt(addDays(today, -rng.int(3, 25)), '10:00'),
      signedAt: i < 30 ? isoAt(addDays(today, -rng.int(2, 24)), '10:05') : null,
      signatureText: i < 30 ? `${e.firstName} ${e.lastName}` : null,
      ipAddress: i < 30 ? `10.${rng.int(0, 40)}.${rng.int(0, 255)}.${rng.int(2, 254)}` : null,
    })),
    auditTrail: [
      { at: isoAt(addDays(today, -30), '08:30'), actorId: 'usr_sys', event: 'Signature request created' },
      { at: isoAt(addDays(today, -30), '08:31'), actorId: 'usr_sys', event: `Sent to ${secAudience.length} recipients` },
    ],
  });
  secDoc.signatureRequestId = 'sig_infosec';

  return { documents, signatures };
};

/* --------------------------------------------------------------- expenses */

const CATEGORIES: ExpenseCategory[] = [
  'travel', 'meals', 'lodging', 'supplies', 'software', 'training', 'mileage', 'client_entertainment', 'other',
];

const AMOUNT_RANGE: Record<ExpenseCategory, [number, number]> = {
  travel: [120, 890], meals: [14, 145], lodging: [140, 420], supplies: [18, 260],
  software: [29, 1200], training: [199, 2400], mileage: [22, 180],
  client_entertainment: [85, 640], other: [12, 300],
};

export const seedExpenses = (
  rng: Rng, employees: Employee[], today: ISODate,
): { reports: ExpenseReport[]; expenses: Expense[] } => {
  const reports: ExpenseReport[] = [];
  const expenses: Expense[] = [];
  const travelers = employees.filter(
    (e) => e.status === 'active' && ['dep_sls', 'dep_fld', 'dep_ops', 'dep_exec', 'dep_eng', 'dep_mkt', 'dep_hr'].includes(e.departmentId),
  );

  for (let i = 0; i < 52; i++) {
    const emp = rng.pick(travelers);
    const daysAgo = rng.int(0, 120);
    const status = daysAgo < 4
      ? rng.weighted<ExpenseReport['status']>([['draft', 30], ['submitted', 70]])
      : daysAgo < 12
        ? rng.weighted<ExpenseReport['status']>([['submitted', 25], ['manager_approved', 30], ['finance_review', 25], ['approved', 20]])
        : rng.weighted<ExpenseReport['status']>([['reimbursed', 82], ['rejected', 8], ['approved', 10]]);

    const reportId = `exr_${i + 1}`;
    const lineCount = rng.int(1, 5);
    let total = 0;
    for (let l = 0; l < lineCount; l++) {
      const category = rng.pick(CATEGORIES);
      const [lo, hi] = AMOUNT_RANGE[category];
      const amount = round2(rng.float(lo, hi));
      total = round2(total + amount);
      const flags: string[] = [];
      if (category === 'meals' && amount > 75) flags.push('Exceeds the $75 per-diem meal cap');
      if (amount > 25 && rng.chance(0.12)) flags.push('Receipt missing');
      if (category === 'client_entertainment' && amount > 400) flags.push('Requires director approval');
      expenses.push({
        id: `exp_${i}_${l}`, reportId, employeeId: emp.id,
        date: addDays(today, -daysAgo - rng.int(0, 6)),
        category,
        merchant: rng.pick(MERCHANTS[category] ?? MERCHANTS.other),
        amount, currency: 'USD',
        description: rng.pick([
          'Client visit to the Columbus service hub.', 'Team offsite travel.', 'Customer site troubleshooting trip.',
          'Quarterly business review with a regional account.', 'Conference registration.', 'Replacement field tooling.',
          'Monthly software subscription.', 'Mileage to and from the depot.',
        ]),
        receiptFileName: flags.includes('Receipt missing') ? null : `receipt_${i}_${l}.jpg`,
        billable: rng.chance(0.35),
        projectCode: rng.pick(['PRJ-1041', 'PRJ-2288', 'PRJ-3310', 'OPEX', 'OPEX', 'OPEX']),
        status: status === 'draft' ? 'draft' : status === 'rejected' ? 'rejected' : status as Expense['status'],
        policyFlags: flags,
      });
    }

    reports.push({
      id: reportId, employeeId: emp.id,
      title: rng.pick([
        'Columbus site visit', 'Q3 customer travel', 'Field tooling replacement', 'Conference — Industrial Ops Summit',
        'Regional QBR travel', 'Team offsite', 'Monthly software and supplies', 'Denver client dinners',
      ]),
      purpose: 'Business travel and related expenses.',
      submittedAt: status === 'draft' ? null : isoAt(addDays(today, -daysAgo), '18:20'),
      status, total,
      managerId: emp.managerId ?? employees[0].id,
      managerDecisionAt: ['manager_approved', 'finance_review', 'approved', 'reimbursed', 'rejected'].includes(status)
        ? isoAt(addDays(today, -daysAgo + 2), '09:30') : null,
      financeDecisionAt: ['approved', 'reimbursed'].includes(status) ? isoAt(addDays(today, -daysAgo + 4), '14:00') : null,
      decisionNote: status === 'rejected' ? 'Missing itemized receipt for the largest line item.' : '',
      reimbursedOnCheck: null,
    });
  }

  return { reports, expenses };
};

/* --------------------------------- notifications, tasks, audit, feed --- */

export interface ActivitySeed {
  notifications: AppNotification[];
  tasks: WorkTask[];
  auditLog: AuditEntry[];
  announcements: Announcement[];
  automationLog: AutomationLogEntry[];
}

export const seedActivity = (
  rng: Rng,
  employees: Employee[],
  today: ISODate,
  ptoRequests: PtoRequest[],
  timecards: Timecard[],
  onboardingTasks: OnboardingTask[],
  training: TrainingAssignment[],
  signatures: SignatureRequest[],
  expenseReports: ExpenseReport[],
): ActivitySeed => {
  const notifications: AppNotification[] = [];
  const tasks: WorkTask[] = [];
  const auditLog: AuditEntry[] = [];
  const automationLog: AutomationLogEntry[] = [];
  const byId = new Map(employees.map((e) => [e.id, e] as const));
  const nameOf = (id: ID) => {
    const e = byId.get(id);
    return e ? `${e.preferredName} ${e.lastName}` : 'Unknown';
  };
  let n = 0;

  const notify = (
    userId: ID, kind: AppNotification['kind'], title: string, body: string,
    daysAgo: number, path: string | null, severity: AppNotification['severity'] = 'info',
  ) => {
    notifications.push({
      id: `ntf_${++n}`, userId, kind, title, body,
      createdAt: isoAt(addDays(today, -Math.floor(daysAgo)), `${String(8 + (n % 9)).padStart(2, '0')}:${String((n * 7) % 60).padStart(2, '0')}`),
      read: daysAgo > 3 ? rng.chance(0.85) : rng.chance(0.35),
      actionPath: path, severity,
      channels: severity === 'error' || severity === 'warning' ? ['in_app', 'email', 'push'] : ['in_app', 'email'],
    });
  };

  const task = (
    assigneeId: ID, kind: WorkTask['kind'], title: string, detail: string,
    dueInDays: number, priority: WorkTask['priority'], path: string | null, relatedId: ID | null,
  ) => {
    tasks.push({
      id: `tsk_${++n}`, assigneeId, title, detail, kind,
      dueDate: addDays(today, dueInDays), priority,
      status: 'open', actionPath: path,
      createdAt: isoAt(addDays(today, -Math.max(1, 5 - dueInDays)), '08:00'),
      completedAt: null, relatedId,
    });
  };

  // Pending approvals become real tasks for the deciding manager.
  for (const req of ptoRequests.filter((r) => r.status === 'pending')) {
    const emp = byId.get(req.employeeId);
    if (!emp?.managerId) continue;
    const mgr = byId.get(emp.managerId);
    if (!mgr) continue;
    task(mgr.userId, 'pto', `Approve time off — ${nameOf(req.employeeId)}`,
      `${req.hours}h of ${req.kind.replace(/_/g, ' ')} from ${req.startDate} to ${req.endDate}.`,
      Math.max(0, diffDays(today, req.startDate) - 2),
      req.flags.length ? 'high' : 'normal', `/time-off/requests/${req.id}`, req.id);
    notify(mgr.userId, 'pto', `Time-off request from ${nameOf(req.employeeId)}`,
      `${req.hours} hours of ${req.kind.replace(/_/g, ' ')} starting ${req.startDate}.`,
      Math.min(6, Math.max(0, diffDays(req.createdAt.slice(0, 10), today))), `/time-off/requests/${req.id}`,
      req.flags.length ? 'warning' : 'info');
  }

  for (const tc of timecards.filter((t) => t.status === 'submitted')) {
    const emp = byId.get(tc.employeeId);
    if (!emp?.managerId) continue;
    const mgr = byId.get(emp.managerId);
    if (!mgr) continue;
    task(mgr.userId, 'timecard', `Approve timecard — ${nameOf(tc.employeeId)}`,
      `Pay period ${tc.periodStart} to ${tc.periodEnd}. ${tc.totalRegular + tc.totalOvertime} hours pending approval.`,
      1, 'high', `/time/timecards/${tc.id}`, tc.id);
  }

  for (const ot of onboardingTasks.filter((t) => t.status === 'overdue' && t.owner === 'employee').slice(0, 25)) {
    const pkt = ot.packetId;
    const emp = employees.find((e) => e.onboardingPacketId === pkt);
    if (!emp) continue;
    notify(emp.userId, 'task', `Overdue: ${ot.title}`,
      `This onboarding step was due ${ot.dueDate}.`, diffDays(ot.dueDate, today), '/onboarding', 'warning');
    task(emp.userId, 'task', ot.title, ot.description, diffDays(today, ot.dueDate), 'high', '/onboarding', ot.id);
  }

  for (const t of training.filter((a) => a.status === 'overdue').slice(0, 40)) {
    const emp = byId.get(t.employeeId);
    if (!emp) continue;
    notify(emp.userId, 'training', 'Required training is overdue',
      `Your assigned course was due ${t.dueDate}.`, Math.min(10, diffDays(t.dueDate, today)), '/learning', 'warning');
    task(emp.userId, 'training', 'Complete required training', `Assigned course due ${t.dueDate}.`,
      diffDays(today, t.dueDate), 'high', '/learning', t.id);
  }

  for (const sig of signatures) {
    for (const signer of sig.signers.filter((s) => s.state !== 'signed')) {
      const emp = byId.get(signer.employeeId);
      if (!emp) continue;
      task(emp.userId, 'document', `Sign: ${sig.documentName}`,
        `Signature requested by People Operations. Due ${sig.dueDate}.`,
        diffDays(today, sig.dueDate), sig.dueDate < today ? 'urgent' : 'normal', `/documents/sign/${sig.id}`, sig.id);
      notify(emp.userId, 'document', 'Document requires your signature', sig.documentName,
        Math.min(8, diffDays(sig.createdAt.slice(0, 10), today)), `/documents/sign/${sig.id}`,
        sig.dueDate < today ? 'error' : 'info');
    }
  }

  for (const rep of expenseReports.filter((r) => r.status === 'submitted')) {
    const mgr = byId.get(rep.managerId);
    if (!mgr) continue;
    task(mgr.userId, 'expense', `Approve expense report — ${nameOf(rep.employeeId)}`,
      `${rep.title} · $${rep.total.toFixed(2)}`, 2, rep.total > 2500 ? 'high' : 'normal',
      `/expenses/${rep.id}`, rep.id);
  }

  // Company-wide informational notifications.
  const active = employees.filter((e) => e.status === 'active');
  for (const emp of active) {
    notify(emp.userId, 'payroll', 'Your pay statement is available',
      'Your most recent pay statement has been posted.', rng.int(1, 6), '/payroll/my-pay', 'success');
    if (rng.chance(0.4)) {
      notify(emp.userId, 'benefits', 'Open enrollment closes soon',
        'Review your 2026 elections before the window closes.', rng.int(1, 5), '/benefits', 'info');
    }
    if (rng.chance(0.25)) {
      notify(emp.userId, 'schedule', 'Your schedule was updated',
        'A shift on your upcoming schedule changed. Review the details.', rng.int(0, 4), '/scheduling', 'info');
    }
  }

  /* ------------------------------------------------------------- audit log */

  const actions: { action: string; objectType: string; module: string; severity: AuditEntry['severity'] }[] = [
    { action: 'Approved time-off request', objectType: 'PtoRequest', module: 'Time Off', severity: 'info' },
    { action: 'Denied time-off request', objectType: 'PtoRequest', module: 'Time Off', severity: 'notice' },
    { action: 'Approved timecard', objectType: 'Timecard', module: 'Time & Attendance', severity: 'info' },
    { action: 'Edited timecard punch', objectType: 'Punch', module: 'Time & Attendance', severity: 'notice' },
    { action: 'Changed compensation', objectType: 'Employee', module: 'HR', severity: 'critical' },
    { action: 'Updated direct deposit', objectType: 'DirectDeposit', module: 'Payroll', severity: 'critical' },
    { action: 'Finalized payroll run', objectType: 'PayrollRun', module: 'Payroll', severity: 'critical' },
    { action: 'Published schedule', objectType: 'Shift', module: 'Scheduling', severity: 'info' },
    { action: 'Uploaded document', objectType: 'Document', module: 'Documents', severity: 'info' },
    { action: 'Signed document', objectType: 'SignatureRequest', module: 'Documents', severity: 'notice' },
    { action: 'Changed employee role assignment', objectType: 'UserAccount', module: 'Security', severity: 'critical' },
    { action: 'Enrolled in benefit plan', objectType: 'BenefitEnrollment', module: 'Benefits', severity: 'notice' },
    { action: 'Advanced candidate stage', objectType: 'Application', module: 'Recruiting', severity: 'info' },
    { action: 'Created requisition', objectType: 'Requisition', module: 'Recruiting', severity: 'notice' },
    { action: 'Terminated employee', objectType: 'Employee', module: 'HR', severity: 'critical' },
    { action: 'Exported report', objectType: 'Report', module: 'Reports', severity: 'notice' },
  ];

  for (let i = 0; i < 220; i++) {
    const spec = rng.pick(actions);
    const actor = rng.pick(active);
    const subject = rng.pick(active);
    const minutesAgo = rng.int(5, 60 * 24 * 45);
    auditLog.push({
      id: `aud_${i}`,
      at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
      actorId: actor.userId,
      actorName: `${actor.preferredName} ${actor.lastName}`,
      action: spec.action,
      objectType: spec.objectType,
      objectId: subject.id,
      objectLabel: spec.objectType === 'Employee' || spec.objectType === 'UserAccount'
        ? `${subject.preferredName} ${subject.lastName}` : `${spec.objectType} record`,
      changes: spec.severity === 'critical'
        ? [{ field: rng.pick(['baseSalary', 'status', 'roles', 'accountLast4']), from: rng.pick(['—', 'active', '$92,000', '••••4417']), to: rng.pick(['on_leave', '$97,500', 'manager', '••••8820']) }]
        : [],
      ipAddress: `10.${rng.int(0, 40)}.${rng.int(0, 255)}.${rng.int(2, 254)}`,
      device: rng.pick(['Chrome · macOS', 'Safari · iPhone', 'Edge · Windows', 'Meridian Mobile · Android', 'Kiosk PHX-02']),
      severity: spec.severity,
      module: spec.module,
    });
  }
  auditLog.sort((a, b) => b.at.localeCompare(a.at));

  /* ----------------------------------------------------- automation log */

  const autoSpecs: [string, string, string][] = [
    ['auto_ot', 'Overtime notification', 'Notified manager of 46.5 recorded hours'],
    ['auto_pto_balance', 'PTO exceeds available balance', 'Flagged request and notified manager'],
    ['auto_onb_overdue', 'Overdue onboarding task escalation', 'Notified employee and created HR follow-up task'],
    ['auto_cert_expiry', 'Certification expiration reminder', 'Notified employee and manager — 31 days remaining'],
    ['auto_training', 'Mandatory training escalation', 'Escalated to manager — 12 days overdue'],
    ['auto_timecard', 'Unsubmitted timecard reminder', 'Reminder sent before period close'],
    ['auto_pay_anomaly', 'Payroll anomaly review alert', 'Created payroll review item — net pay moved 34%'],
  ];
  for (let i = 0; i < 44; i++) {
    const [ruleId, ruleName, outcome] = rng.pick(autoSpecs);
    const subject = rng.pick(active);
    automationLog.push({
      id: `alog_${i}`, ruleId, ruleName,
      at: new Date(Date.now() - rng.int(30, 60 * 24 * 21) * 60000).toISOString(),
      subjectType: 'Employee', subjectId: subject.id, outcome,
      actionsTaken: [outcome],
    });
  }
  automationLog.sort((a, b) => b.at.localeCompare(a.at));

  /* -------------------------------------------------------- announcements */

  const authors = employees.filter((e) => ['dep_hr', 'dep_exec'].includes(e.departmentId) && e.status === 'active');
  const announcements: Announcement[] = ANNOUNCEMENT_SEEDS.map((a, i) => ({
    id: `ann_${i + 1}`,
    title: a.title,
    body: a.body,
    authorId: (authors[i % Math.max(1, authors.length)] ?? employees[0]).id,
    publishedAt: isoAt(addDays(today, -(i * 4 + 1)), '09:00'),
    pinned: i < 2,
    audience: a.category === 'urgent' ? 'location' : 'company',
    audienceId: a.category === 'urgent' ? 'loc_phx' : null,
    category: a.category,
  }));

  return { notifications, tasks, auditLog, announcements, automationLog };
};
