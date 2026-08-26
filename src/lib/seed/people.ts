import type {
  CompensationRecord, DirectDeposit, Dependent, Employee, EmploymentEvent,
  EmploymentType, ID, ISODate, Role, TaxProfile, UserAccount,
} from '../types';
import { Rng } from '../rng';
import { addDays, diffDays, toISODate, yearsBetween } from '../dates';
import { round2 } from '../payroll';
import { BANKS, CERTIFICATIONS, FIRST_NAMES, LAST_NAMES, SKILLS } from './names';
import { DEPARTMENTS, JOB_TITLES, LOCATIONS } from './catalog';

interface DeptPlan {
  dept: ID;
  headJob: ID;
  headReportsToJob: ID | null;
  extraManagers: { job: ID; count: number }[];
  ics: { job: ID; count: number }[];
  locations: ID[];
  remoteChance: number;
}

const PLAN: DeptPlan[] = [
  { dept: 'dep_fin', headJob: 'job_ctrl', headReportsToJob: 'job_cfo', extraManagers: [], ics: [{ job: 'job_acct', count: 3 }, { job: 'job_apspec', count: 3 }, { job: 'job_fpna', count: 3 }], locations: ['loc_den'], remoteChance: 0.25 },
  { dept: 'dep_hr', headJob: 'job_hrd', headReportsToJob: 'job_chro', extraManagers: [], ics: [{ job: 'job_hrbp', count: 2 }, { job: 'job_payadm', count: 1 }, { job: 'job_benadm', count: 1 }, { job: 'job_rec', count: 2 }, { job: 'job_hrcoord', count: 2 }], locations: ['loc_den'], remoteChance: 0.2 },
  { dept: 'dep_it', headJob: 'job_itdir', headReportsToJob: 'job_cto', extraManagers: [], ics: [{ job: 'job_sysadm', count: 2 }, { job: 'job_ithelp', count: 4 }], locations: ['loc_den', 'loc_aus'], remoteChance: 0.15 },
  { dept: 'dep_eng', headJob: 'job_engmgr', headReportsToJob: 'job_cto', extraManagers: [{ job: 'job_engmgr', count: 1 }], ics: [{ job: 'job_swe1', count: 3 }, { job: 'job_swe2', count: 7 }, { job: 'job_swe3', count: 5 }, { job: 'job_swe4', count: 1 }, { job: 'job_qaeng', count: 2 }], locations: ['loc_aus', 'loc_den'], remoteChance: 0.45 },
  { dept: 'dep_ops', headJob: 'job_opsdir', headReportsToJob: 'job_coo', extraManagers: [], ics: [{ job: 'job_opsmgr', count: 2 }, { job: 'job_opsanl', count: 3 }], locations: ['loc_den', 'loc_phx'], remoteChance: 0.1 },
  { dept: 'dep_fld', headJob: 'job_fldsup', headReportsToJob: 'job_opsdir', extraManagers: [{ job: 'job_fldsup', count: 2 }], ics: [{ job: 'job_fldtech2', count: 6 }, { job: 'job_fldtech1', count: 8 }, { job: 'job_disp', count: 3 }], locations: ['loc_phx', 'loc_cmh', 'loc_sac'], remoteChance: 0 },
  { dept: 'dep_whs', headJob: 'job_whsmgr', headReportsToJob: 'job_opsdir', extraManagers: [{ job: 'job_whsmgr', count: 1 }], ics: [{ job: 'job_whslead', count: 3 }, { job: 'job_whsassoc', count: 11 }, { job: 'job_driver', count: 4 }], locations: ['loc_phx', 'loc_cmh', 'loc_sac'], remoteChance: 0 },
  { dept: 'dep_qa', headJob: 'job_qamgr', headReportsToJob: 'job_opsdir', extraManagers: [], ics: [{ job: 'job_qainsp', count: 6 }], locations: ['loc_phx', 'loc_cmh'], remoteChance: 0 },
  { dept: 'dep_sls', headJob: 'job_slsdir', headReportsToJob: 'job_ceo', extraManagers: [], ics: [{ job: 'job_ae', count: 6 }, { job: 'job_sdr', count: 3 }], locations: ['loc_den'], remoteChance: 0.5 },
  { dept: 'dep_mkt', headJob: 'job_mktmgr', headReportsToJob: 'job_ceo', extraManagers: [], ics: [{ job: 'job_mktspec', count: 5 }], locations: ['loc_den'], remoteChance: 0.4 },
  { dept: 'dep_cs', headJob: 'job_csmgr', headReportsToJob: 'job_coo', extraManagers: [], ics: [{ job: 'job_csrep2', count: 3 }, { job: 'job_csrep1', count: 6 }], locations: ['loc_cmh', 'loc_den'], remoteChance: 0.35 },
];

const ETHNICITIES = [
  'Hispanic or Latino', 'White', 'Black or African American', 'Asian',
  'Two or more races', 'Native Hawaiian or Pacific Islander',
  'American Indian or Alaska Native', 'Prefer not to disclose',
];

const REMOTE_STATES = ['CO', 'TX', 'AZ', 'OH', 'CA', 'NV', 'UT', 'OR', 'NC', 'GA', 'IL', 'FL'];

const CITY_BY_STATE: Record<string, string[]> = {
  CO: ['Denver', 'Boulder', 'Aurora', 'Fort Collins'],
  TX: ['Austin', 'Round Rock', 'San Marcos', 'Georgetown'],
  AZ: ['Phoenix', 'Tempe', 'Mesa', 'Glendale'],
  OH: ['Columbus', 'Dublin', 'Hilliard', 'Westerville'],
  CA: ['Sacramento', 'Elk Grove', 'Roseville', 'Davis'],
  NV: ['Reno', 'Las Vegas'], UT: ['Salt Lake City', 'Provo'], OR: ['Portland', 'Bend'],
  NC: ['Raleigh', 'Durham'], GA: ['Atlanta', 'Marietta'], IL: ['Chicago', 'Evanston'],
  FL: ['Tampa', 'Orlando'],
};

const STREETS = ['Maple', 'Birchwood', 'Sundance', 'Copper Creek', 'Larkspur', 'Ridgeline', 'Mesa Verde',
  'Foxglove', 'Harborview', 'Willow Bend', 'Stonegate', 'Juniper', 'Cottonwood', 'Silver Sage', 'Kestrel'];

const RELATIONSHIPS = ['Spouse', 'Parent', 'Sibling', 'Partner', 'Friend', 'Child'];

export interface PeopleSeed {
  employees: Employee[];
  users: UserAccount[];
  compensation: CompensationRecord[];
  employmentEvents: EmploymentEvent[];
  dependents: Dependent[];
  directDeposits: DirectDeposit[];
  taxProfiles: TaxProfile[];
  personas: { role: Role; userId: ID; employeeId: ID }[];
}

const PERSONA_JOBS: { role: Role; job: ID }[] = [
  { role: 'executive', job: 'job_ceo' },
  { role: 'hr_admin', job: 'job_hrd' },
  { role: 'payroll_admin', job: 'job_payadm' },
  { role: 'benefits_admin', job: 'job_benadm' },
  { role: 'recruiter', job: 'job_rec' },
  { role: 'finance', job: 'job_ctrl' },
  { role: 'sys_admin', job: 'job_sysadm' },
  { role: 'manager', job: 'job_fldsup' },
  { role: 'employee', job: 'job_fldtech1' },
];

export const seedPeople = (rng: Rng, today: ISODate): PeopleSeed => {
  const employees: Employee[] = [];
  const compensation: CompensationRecord[] = [];
  const employmentEvents: EmploymentEvent[] = [];
  const dependents: Dependent[] = [];
  const directDeposits: DirectDeposit[] = [];
  const taxProfiles: TaxProfile[] = [];
  const usedNames = new Set<string>();
  let seq = 1000;

  const nameFor = (): { first: string; last: string } => {
    for (let i = 0; i < 400; i++) {
      const first = rng.pick(FIRST_NAMES);
      const last = rng.pick(LAST_NAMES);
      const key = `${first} ${last}`;
      if (!usedNames.has(key)) {
        usedNames.add(key);
        return { first, last };
      }
    }
    const fallback = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}${seq}`;
    usedNames.add(fallback);
    const [first, last] = fallback.split(' ');
    return { first, last };
  };

  const job = (id: ID) => JOB_TITLES.find((j) => j.id === id)!;

  interface MakeArgs {
    jobId: ID; deptId: ID; managerId: ID | null; locationId: ID;
    hireWindowYears: [number, number]; remoteChance: number;
  }

  const make = ({ jobId, deptId, managerId, locationId, hireWindowYears, remoteChance }: MakeArgs): Employee => {
    const j = job(jobId);
    const { first, last } = nameFor();
    const id = `emp_${String(++seq)}`;
    const userId = `usr_${String(seq)}`;
    const yearsAgo = rng.float(hireWindowYears[0], hireWindowYears[1], 2);
    const hireDate = addDays(today, -Math.round(yearsAgo * 365));
    const remote = locationId !== 'loc_rmt' && rng.chance(remoteChance);
    const effLocation = remote ? 'loc_rmt' : locationId;
    const loc = LOCATIONS.find((l) => l.id === effLocation)!;
    const state = remote ? rng.pick(REMOTE_STATES) : loc.state;
    const city = remote ? rng.pick(CITY_BY_STATE[state] ?? ['Denver']) : loc.city;
    const isHourly = j.flsa === 'non_exempt';
    const band = rng.float(0, 1, 3);
    const tenure = yearsBetween(hireDate, today);
    const bandWithTenure = Math.min(1, band * 0.7 + Math.min(tenure / 12, 1) * 0.3);
    const rawPay = j.minSalary + (j.maxSalary - j.minSalary) * bandWithTenure;
    const hourlyRate = isHourly ? round2(rawPay) : 0;
    const baseSalary = isHourly ? round2(hourlyRate * 2080) : Math.round(rawPay / 500) * 500;
    const employmentType: EmploymentType = rng.weighted<EmploymentType>([
      ['full_time', isHourly ? 88 : 96], ['part_time', isHourly ? 10 : 2], ['temp', 1], ['intern', 1],
    ]);
    const standardHours = employmentType === 'part_time' ? rng.pick([24, 28, 30, 32]) : 40;
    const payGroupId = ['loc_phx', 'loc_cmh', 'loc_sac'].includes(effLocation) ? 'pg_field' : 'pg_corp';
    const ptoPolicyId = j.level === 'E1' ? 'pto_exec' : isHourly ? 'pto_hourly' : tenure >= 5 ? 'pto_senior' : 'pto_std';
    const status = rng.weighted<Employee['status']>([['active', 96], ['on_leave', 3], ['suspended', 1]]);

    const emp: Employee = {
      id,
      employeeNumber: `CP-${seq}`,
      userId,
      firstName: first,
      lastName: last,
      preferredName: rng.chance(0.12) ? first.slice(0, 3) : first,
      email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@cardinalpeak.com',
      personalEmail: `${first}${last}`.toLowerCase().replace(/[^a-z]/g, '') + rng.int(10, 99) + '@mailbox.example',
      phone: `${rng.int(2, 9)}${rng.int(0, 9)}${rng.int(0, 9)}${rng.int(200, 999)}${String(rng.int(0, 9999)).padStart(4, '0')}`,
      avatarSeed: `${first}${last}`,
      dob: addDays(today, -rng.int(22, 62) * 365 - rng.int(0, 364)),
      ssnLast4: String(rng.int(1000, 9999)),
      gender: rng.weighted<Employee['gender']>([['female', 46], ['male', 46], ['non_binary', 4], ['undisclosed', 4]]),
      ethnicity: rng.pick(ETHNICITIES),
      veteranStatus: rng.weighted<Employee['veteranStatus']>([['not_a_veteran', 84], ['veteran', 9], ['undisclosed', 7]]),
      addressLine1: `${rng.int(100, 9899)} ${rng.pick(STREETS)} ${rng.pick(['St', 'Ave', 'Ln', 'Dr', 'Way', 'Ct'])}`,
      city,
      state,
      postalCode: String(rng.int(10000, 99999)),
      status,
      employmentType,
      hireDate,
      seniorityDate: hireDate,
      terminationDate: null,
      terminationReason: null,
      rehireEligible: true,
      departmentId: deptId,
      jobTitleId: jobId,
      locationId: effLocation,
      managerId,
      payGroupId,
      payType: isHourly ? 'hourly' : 'salary',
      baseSalary,
      hourlyRate,
      standardHoursPerWeek: standardHours,
      ptoPolicyId,
      emergencyContacts: [],
      skills: rng.pickMany(SKILLS, rng.int(3, 6)),
      certifications: [],
      badgeId: `BDG${String(seq)}${rng.int(10, 99)}`,
      roles: ['employee'],
      onboardingPacketId: null,
      candidateId: null,
      workAuthorized: true,
      i9Complete: rng.chance(0.97),
      remote,
      bio: '',
    };

    const contactCount = rng.chance(0.75) ? 1 : 2;
    for (let c = 0; c < contactCount; c++) {
      const cn = nameFor();
      emp.emergencyContacts.push({
        name: `${cn.first} ${cn.last}`,
        relationship: rng.pick(RELATIONSHIPS),
        phone: `${rng.int(2, 9)}${rng.int(0, 9)}${rng.int(0, 9)}${rng.int(200, 999)}${String(rng.int(0, 9999)).padStart(4, '0')}`,
        email: `${cn.first}${cn.last}`.toLowerCase() + '@mailbox.example',
        isPrimary: c === 0,
      });
    }

    const certCount = isHourly ? rng.int(1, 3) : rng.chance(0.45) ? rng.int(1, 2) : 0;
    for (const c of rng.pickMany(CERTIFICATIONS, certCount)) {
      const issued = addDays(hireDate, rng.int(0, Math.max(30, diffDays(hireDate, today) - 30)));
      const expires = rng.chance(0.75) ? addDays(issued, rng.pick([365, 730, 1095])) : null;
      emp.certifications.push({ name: c.name, issuer: c.issuer, issued, expires });
    }

    emp.bio = `${j.name} in ${DEPARTMENTS.find((d) => d.id === deptId)!.name}, based at ${loc.name}. Joined Cardinal Peak in ${hireDate.slice(0, 4)}.`;

    employees.push(emp);
    return emp;
  };

  /* ------------------------------------------------------ executive team */

  const ceo = make({ jobId: 'job_ceo', deptId: 'dep_exec', managerId: null, locationId: 'loc_den', hireWindowYears: [11, 14], remoteChance: 0 });
  const cSuite: Record<string, Employee> = { job_ceo: ceo };
  for (const jobId of ['job_cfo', 'job_coo', 'job_chro', 'job_cto']) {
    cSuite[jobId] = make({ jobId, deptId: 'dep_exec', managerId: ceo.id, locationId: 'loc_den', hireWindowYears: [4, 11], remoteChance: 0.1 });
  }

  const headsByJob: Record<string, Employee> = { ...cSuite };

  for (const plan of PLAN) {
    const reportsTo = plan.headReportsToJob ? headsByJob[plan.headReportsToJob] : ceo;
    const head = make({
      jobId: plan.headJob, deptId: plan.dept, managerId: reportsTo?.id ?? ceo.id,
      locationId: plan.locations[0], hireWindowYears: [3, 10], remoteChance: plan.remoteChance * 0.4,
    });
    if (!headsByJob[plan.headJob]) headsByJob[plan.headJob] = head;

    const managers: Employee[] = [head];
    for (const m of plan.extraManagers) {
      for (let i = 0; i < m.count; i++) {
        managers.push(make({
          jobId: m.job, deptId: plan.dept, managerId: reportsTo?.id ?? ceo.id,
          locationId: plan.locations[(i + 1) % plan.locations.length],
          hireWindowYears: [2, 8], remoteChance: plan.remoteChance * 0.4,
        }));
      }
    }

    let mgrIdx = 0;
    for (const spec of plan.ics) {
      for (let i = 0; i < spec.count; i++) {
        const mgr = managers[mgrIdx % managers.length];
        mgrIdx++;
        make({
          jobId: spec.job, deptId: plan.dept, managerId: mgr.id,
          locationId: mgr.locationId === 'loc_rmt' ? plan.locations[i % plan.locations.length] : mgr.locationId,
          hireWindowYears: [0.15, 9], remoteChance: plan.remoteChance,
        });
      }
    }
  }

  /* ------------------------------------------- recent hires (onboarding) */

  const RECENT_HIRES: { job: ID; dept: ID; loc: ID }[] = [
    { job: 'job_whsassoc', dept: 'dep_whs', loc: 'loc_cmh' },
    { job: 'job_whsassoc', dept: 'dep_whs', loc: 'loc_phx' },
    { job: 'job_fldtech1', dept: 'dep_fld', loc: 'loc_phx' },
    { job: 'job_fldtech1', dept: 'dep_fld', loc: 'loc_sac' },
    { job: 'job_csrep1', dept: 'dep_cs', loc: 'loc_cmh' },
    { job: 'job_csrep1', dept: 'dep_cs', loc: 'loc_cmh' },
    { job: 'job_swe2', dept: 'dep_eng', loc: 'loc_aus' },
    { job: 'job_acct', dept: 'dep_fin', loc: 'loc_den' },
    { job: 'job_ae', dept: 'dep_sls', loc: 'loc_den' },
    { job: 'job_driver', dept: 'dep_whs', loc: 'loc_sac' },
    { job: 'job_qainsp', dept: 'dep_qa', loc: 'loc_phx' },
    { job: 'job_mktspec', dept: 'dep_mkt', loc: 'loc_den' },
  ];

  for (const spec of RECENT_HIRES) {
    const peerManager = employees.find(
      (e) => e.departmentId === spec.dept && e.status === 'active' &&
        ['M1', 'M2'].includes(job(e.jobTitleId).level),
    );
    const hire = make({
      jobId: spec.job, deptId: spec.dept, managerId: peerManager?.id ?? ceo.id,
      locationId: spec.loc, hireWindowYears: [0, 0], remoteChance: 0,
    });
    hire.hireDate = addDays(today, -rng.int(2, 68));
    hire.seniorityDate = hire.hireDate;
    hire.status = 'active';
    hire.i9Complete = rng.chance(0.7);
  }

  /* --------------------------------- departed and pre-start populations */

  const activeCount = employees.length;
  for (let i = 0; i < 9; i++) {
    const template = employees[rng.int(6, activeCount - 1)];
    const t = make({
      jobId: template.jobTitleId, deptId: template.departmentId, managerId: template.managerId,
      locationId: template.locationId, hireWindowYears: [1.5, 8], remoteChance: 0,
    });
    t.status = 'terminated';
    t.terminationDate = addDays(today, -rng.int(20, 420));
    t.terminationReason = rng.pick([
      'Voluntary — accepted another position', 'Voluntary — relocation', 'Voluntary — personal reasons',
      'Involuntary — performance', 'Involuntary — attendance', 'End of assignment', 'Reduction in force',
    ]);
    t.rehireEligible = !t.terminationReason.startsWith('Involuntary');
  }

  for (let i = 0; i < 3; i++) {
    const p = make({
      jobId: rng.pick(['job_whsassoc', 'job_fldtech1', 'job_csrep1']), deptId: 'dep_whs',
      managerId: employees.find((e) => e.jobTitleId === 'job_whsmgr')!.id,
      locationId: rng.pick(['loc_phx', 'loc_cmh']), hireWindowYears: [0, 0], remoteChance: 0,
    });
    p.status = 'pending_hire';
    p.hireDate = addDays(today, rng.int(3, 24));
    p.seniorityDate = p.hireDate;
    p.departmentId = p.jobTitleId === 'job_csrep1' ? 'dep_cs' : p.jobTitleId === 'job_fldtech1' ? 'dep_fld' : 'dep_whs';
    p.i9Complete = false;
  }

  /* ----------------------------------------- department heads on record */

  for (const d of DEPARTMENTS) {
    const head = employees.find((e) => e.departmentId === d.id && e.status === 'active' &&
      ['M2', 'M1', 'E1'].includes(job(e.jobTitleId).level));
    d.headEmployeeId = head?.id ?? null;
  }

  /* -------------------------------------- compensation history & events */

  for (const e of employees) {
    const j = job(e.jobTitleId);
    const tenure = yearsBetween(e.hireDate, e.terminationDate ?? today);
    const raises = Math.min(4, Math.floor(tenure));
    let salary = e.baseSalary;
    let rate = e.hourlyRate;
    const history: { date: ISODate; salary: number; rate: number; reason: string; pct: number }[] = [];
    for (let i = raises; i >= 1; i--) {
      const pct = rng.float(2.5, 6.5, 1);
      salary = round2(salary / (1 + pct / 100));
      rate = round2(rate / (1 + pct / 100));
      history.unshift({
        date: addDays(e.hireDate, Math.round((tenure - i) * 365) + rng.int(0, 40)),
        salary: Math.round(salary), rate: round2(rate),
        reason: rng.weighted([['Annual merit increase', 60], ['Promotion', 18], ['Market adjustment', 14], ['Role change', 8]]),
        pct,
      });
    }

    compensation.push({
      id: `comp_${e.id}_0`, employeeId: e.id, effectiveDate: e.hireDate, payType: e.payType,
      annualSalary: Math.round(salary), hourlyRate: round2(rate), changeReason: 'New hire',
      changePercent: 0, approvedBy: e.managerId,
    });
    employmentEvents.push({
      id: `evt_${e.id}_hire`, employeeId: e.id, action: 'hire', effectiveDate: e.hireDate,
      createdAt: `${e.hireDate}T15:00:00.000Z`, createdBy: 'usr_hr',
      summary: `Hired as ${j.name}`,
      changes: [{ field: 'status', from: '—', to: 'active' }, { field: 'jobTitle', from: '—', to: j.name }],
      note: 'Initial hire recorded through onboarding.',
    });

    let running = { salary: Math.round(salary), rate: round2(rate) };
    history.forEach((h, idx) => {
      const next = { salary: Math.round(running.salary * (1 + h.pct / 100)), rate: round2(running.rate * (1 + h.pct / 100)) };
      compensation.push({
        id: `comp_${e.id}_${idx + 1}`, employeeId: e.id, effectiveDate: h.date, payType: e.payType,
        annualSalary: next.salary, hourlyRate: next.rate, changeReason: h.reason,
        changePercent: h.pct, approvedBy: e.managerId,
      });
      employmentEvents.push({
        id: `evt_${e.id}_comp${idx}`, employeeId: e.id,
        action: h.reason === 'Promotion' ? 'promotion' : 'compensation_change',
        effectiveDate: h.date, createdAt: `${h.date}T16:00:00.000Z`, createdBy: 'usr_hr',
        summary: `${h.reason} (+${h.pct}%)`,
        changes: e.payType === 'salary'
          ? [{ field: 'baseSalary', from: `$${running.salary.toLocaleString()}`, to: `$${next.salary.toLocaleString()}` }]
          : [{ field: 'hourlyRate', from: `$${running.rate}/hr`, to: `$${next.rate}/hr` }],
        note: '',
      });
      running = next;
    });

    // Final record reconciles the employee row with its compensation history.
    const last = compensation.filter((c) => c.employeeId === e.id).at(-1)!;
    e.baseSalary = last.annualSalary;
    e.hourlyRate = last.hourlyRate;

    if (e.status === 'terminated' && e.terminationDate) {
      employmentEvents.push({
        id: `evt_${e.id}_term`, employeeId: e.id, action: 'termination', effectiveDate: e.terminationDate,
        createdAt: `${e.terminationDate}T22:00:00.000Z`, createdBy: 'usr_hr',
        summary: e.terminationReason ?? 'Separation',
        changes: [{ field: 'status', from: 'active', to: 'terminated' }],
        note: 'Final pay issued on the next scheduled pay date.',
      });
    }
    if (e.status === 'on_leave') {
      const start = addDays(today, -rng.int(5, 70));
      employmentEvents.push({
        id: `evt_${e.id}_leave`, employeeId: e.id, action: 'leave_start', effectiveDate: start,
        createdAt: `${start}T15:00:00.000Z`, createdBy: 'usr_hr',
        summary: rng.pick(['FMLA — medical leave', 'Parental leave', 'Personal leave of absence', 'Military leave']),
        changes: [{ field: 'status', from: 'active', to: 'on_leave' }],
        note: `Expected return ${addDays(start, rng.int(30, 90))}.`,
      });
    }
  }

  /* ------------------------------------- deposits, taxes and dependents */

  for (const e of employees) {
    const noDeposit = e.status === 'pending_hire' || rng.chance(0.04);
    if (!noDeposit) {
      directDeposits.push({
        id: `dd_${e.id}_1`, employeeId: e.id, nickname: 'Primary checking', bankName: rng.pick(BANKS),
        accountType: 'checking', routingLast4: String(rng.int(1000, 9999)), accountLast4: String(rng.int(1000, 9999)),
        allocationType: 'remainder', allocationValue: 100, priority: 1, active: true, verified: true,
      });
      if (rng.chance(0.28)) {
        directDeposits.push({
          id: `dd_${e.id}_2`, employeeId: e.id, nickname: 'Savings', bankName: rng.pick(BANKS),
          accountType: 'savings', routingLast4: String(rng.int(1000, 9999)), accountLast4: String(rng.int(1000, 9999)),
          allocationType: rng.chance(0.5) ? 'percent' : 'fixed',
          allocationValue: rng.chance(0.5) ? rng.pick([10, 15, 20]) : rng.pick([100, 200, 250]),
          priority: 0, active: true, verified: rng.chance(0.9),
        });
      }
    }

    const complete = e.status !== 'pending_hire' && rng.chance(0.96);
    taxProfiles.push({
      employeeId: e.id,
      filingStatus: rng.weighted([['single', 45], ['married_joint', 42], ['head_of_household', 13]]),
      federalAllowances: rng.weighted([[0, 55], [1, 22], [2, 15], [3, 8]]),
      additionalFederal: rng.chance(0.18) ? rng.pick([25, 50, 75, 100]) : 0,
      stateCode: e.state,
      stateAllowances: rng.int(0, 2),
      additionalState: rng.chance(0.08) ? rng.pick([10, 25]) : 0,
      exemptFederal: rng.chance(0.01),
      w4Year: 2025,
      lastUpdated: addDays(e.hireDate, rng.int(0, 10)),
      complete,
    });

    if (rng.chance(0.42) && e.status !== 'pending_hire') {
      const count = rng.weighted([[1, 45], [2, 35], [3, 20]]);
      for (let i = 0; i < count; i++) {
        const dn = nameFor();
        const rel: Dependent['relationship'] = i === 0
          ? rng.weighted([['spouse', 60], ['domestic_partner', 12], ['child', 28]])
          : 'child';
        dependents.push({
          id: `dep_${e.id}_${i}`, employeeId: e.id, firstName: dn.first, lastName: e.lastName,
          relationship: rel,
          dob: rel === 'child' ? addDays(today, -rng.int(1, 20) * 365) : addDays(today, -rng.int(26, 58) * 365),
          ssnLast4: String(rng.int(1000, 9999)), isCovered: rng.chance(0.85),
        });
      }
    }
  }

  /* ------------------------------------------- accounts, roles, personas */

  const personas: PeopleSeed['personas'] = [];
  const takenPersona = new Set<ID>();
  const roleByEmployee = new Map<ID, Role[]>();

  for (const { role, job: jobId } of PERSONA_JOBS) {
    const match = employees.find(
      (e) => e.jobTitleId === jobId && e.status === 'active' && !takenPersona.has(e.id),
    );
    if (!match) continue;
    takenPersona.add(match.id);
    const roles: Role[] = role === 'employee' ? ['employee'] : ['employee', role];
    if (role === 'hr_admin') roles.push('manager');
    if (role === 'executive') roles.push('manager');
    roleByEmployee.set(match.id, roles);
    personas.push({ role, userId: match.userId, employeeId: match.id });
  }

  const managerIds = new Set(employees.map((e) => e.managerId).filter(Boolean) as ID[]);
  const users: UserAccount[] = employees.map((e) => {
    const roles = new Set<Role>(roleByEmployee.get(e.id) ?? ['employee']);
    if (managerIds.has(e.id)) roles.add('manager');
    if (e.jobTitleId === 'job_ceo' || e.jobTitleId === 'job_cfo' || e.jobTitleId === 'job_coo' ||
        e.jobTitleId === 'job_cto' || e.jobTitleId === 'job_chro') roles.add('executive');
    if (e.jobTitleId === 'job_hrbp' || e.jobTitleId === 'job_hrd') roles.add('hr_admin');
    if (e.jobTitleId === 'job_payadm') roles.add('payroll_admin');
    if (e.jobTitleId === 'job_benadm') roles.add('benefits_admin');
    if (e.jobTitleId === 'job_rec') roles.add('recruiter');
    if (e.jobTitleId === 'job_ctrl' || e.jobTitleId === 'job_cfo') roles.add('finance');
    if (e.jobTitleId === 'job_sysadm' || e.jobTitleId === 'job_itdir') roles.add('sys_admin');
    e.roles = [...roles];

    const lastLoginDays = e.status === 'terminated' ? 400 : rng.int(0, 9);
    return {
      id: e.userId,
      employeeId: e.id,
      email: e.email,
      displayName: `${e.preferredName} ${e.lastName}`,
      roles: [...roles],
      status: e.status === 'terminated' ? 'disabled' : e.status === 'pending_hire' ? 'invited' : 'active',
      mfaEnabled: roles.size > 1 ? true : rng.chance(0.62),
      mfaMethod: rng.weighted([['app', 60], ['sms', 30], ['email', 10]]),
      lastLoginAt: e.status === 'terminated' ? null : new Date(Date.now() - lastLoginDays * 86400000 - rng.int(0, 8) * 3600000).toISOString(),
      passwordUpdatedAt: addDays(today, -rng.int(10, 300)),
      failedAttempts: rng.chance(0.06) ? rng.int(1, 3) : 0,
      sessions: e.status === 'terminated' ? [] : [{
        id: `sess_${e.id}`,
        startedAt: new Date(Date.now() - rng.int(1, 300) * 60000).toISOString(),
        ip: `10.${rng.int(0, 40)}.${rng.int(0, 255)}.${rng.int(2, 254)}`,
        device: rng.pick(['Chrome · macOS', 'Safari · iPhone', 'Edge · Windows', 'Chrome · Windows', 'Meridian Mobile · Android']),
        current: false,
      }],
      permissionOverrides: [],
    } satisfies UserAccount;
  });

  return { employees, users, compensation, employmentEvents, dependents, directDeposits, taxProfiles, personas };
};

export const todayISO = (): ISODate => toISODate(new Date());
