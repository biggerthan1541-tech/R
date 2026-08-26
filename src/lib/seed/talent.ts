import type {
  Application, Candidate, CandidateStage, Course, Employee, Goal, ID, ISODate, Interview,
  Offer, OnboardingPacket, OnboardingTask, PeerFeedback, PerformanceReview, Requisition,
  ReviewCycle, TrainingAssignment,
} from '../types';
import { Rng } from '../rng';
import { addDays, diffDays, isoAt } from '../dates';
import { CANDIDATE_SOURCES, FIRST_NAMES, LAST_NAMES, SKILLS } from './names';
import { COURSES, JOB_TITLES, ONBOARDING_TEMPLATES } from './catalog';

/* ------------------------------------------------------------- recruiting */

const REQ_SPECS: { job: ID; dept: ID; loc: ID; openings: number; status: Requisition['status'] }[] = [
  { job: 'job_fldtech1', dept: 'dep_fld', loc: 'loc_phx', openings: 4, status: 'open' },
  { job: 'job_whsassoc', dept: 'dep_whs', loc: 'loc_cmh', openings: 6, status: 'open' },
  { job: 'job_swe2', dept: 'dep_eng', loc: 'loc_aus', openings: 2, status: 'open' },
  { job: 'job_swe3', dept: 'dep_eng', loc: 'loc_rmt', openings: 1, status: 'open' },
  { job: 'job_csrep1', dept: 'dep_cs', loc: 'loc_cmh', openings: 3, status: 'open' },
  { job: 'job_ae', dept: 'dep_sls', loc: 'loc_den', openings: 2, status: 'open' },
  { job: 'job_acct', dept: 'dep_fin', loc: 'loc_den', openings: 1, status: 'open' },
  { job: 'job_driver', dept: 'dep_whs', loc: 'loc_sac', openings: 2, status: 'open' },
  { job: 'job_qainsp', dept: 'dep_qa', loc: 'loc_phx', openings: 1, status: 'open' },
  { job: 'job_hrbp', dept: 'dep_hr', loc: 'loc_den', openings: 1, status: 'pending_approval' },
  { job: 'job_opsanl', dept: 'dep_ops', loc: 'loc_den', openings: 1, status: 'pending_approval' },
  { job: 'job_fldtech2', dept: 'dep_fld', loc: 'loc_cmh', openings: 1, status: 'on_hold' },
  { job: 'job_mktspec', dept: 'dep_mkt', loc: 'loc_den', openings: 1, status: 'filled' },
  { job: 'job_ithelp', dept: 'dep_it', loc: 'loc_den', openings: 1, status: 'draft' },
];

const REQUIREMENTS: Record<string, string[]> = {
  default: [
    'High school diploma or equivalent',
    'Authorized to work in the United States',
    'Reliable attendance and schedule flexibility',
  ],
  tech: [
    '3+ years of professional software engineering experience',
    'Strong fundamentals in data structures and systems design',
    'Experience with TypeScript, React or a comparable stack',
    'Track record of shipping and supporting production services',
  ],
  field: [
    'Valid driver license with a clean record',
    'Ability to lift 50 lbs and work at heights',
    'OSHA 10 or willingness to certify within 60 days',
    'Customer-facing troubleshooting experience',
  ],
  finance: [
    "Bachelor's degree in accounting, finance or a related field",
    '2+ years in a corporate accounting environment',
    'Working knowledge of GAAP and month-end close',
  ],
};

export interface RecruitingSeed {
  requisitions: Requisition[];
  candidates: Candidate[];
  applications: Application[];
  interviews: Interview[];
  offers: Offer[];
}

export const seedRecruiting = (rng: Rng, employees: Employee[], today: ISODate): RecruitingSeed => {
  const requisitions: Requisition[] = [];
  const candidates: Candidate[] = [];
  const applications: Application[] = [];
  const interviews: Interview[] = [];
  const offers: Offer[] = [];

  const recruiters = employees.filter((e) => e.jobTitleId === 'job_rec' && e.status === 'active');
  const managerFor = (deptId: ID) =>
    employees.find((e) => e.departmentId === deptId && e.status === 'active' &&
      ['M1', 'M2', 'E1'].includes(JOB_TITLES.find((j) => j.id === e.jobTitleId)?.level ?? '')) ??
    employees[0];

  REQ_SPECS.forEach((spec, i) => {
    const j = JOB_TITLES.find((x) => x.id === spec.job)!;
    const posted = spec.status === 'draft' || spec.status === 'pending_approval'
      ? null : addDays(today, -rng.int(8, 120));
    const reqKind = spec.dept === 'dep_eng' || spec.dept === 'dep_it' ? 'tech'
      : spec.dept === 'dep_fld' || spec.dept === 'dep_whs' ? 'field'
      : spec.dept === 'dep_fin' ? 'finance' : 'default';
    requisitions.push({
      id: `req_${i + 1}`,
      code: `REQ-${today.slice(0, 4)}-${String(101 + i)}`,
      title: j.name,
      departmentId: spec.dept,
      locationId: spec.loc,
      jobTitleId: spec.job,
      hiringManagerId: managerFor(spec.dept).id,
      recruiterId: recruiters.length ? recruiters[i % recruiters.length].id : employees[0].id,
      openings: spec.openings,
      filled: spec.status === 'filled' ? spec.openings : 0,
      status: spec.status,
      employmentType: 'full_time',
      salaryMin: j.minSalary,
      salaryMax: j.maxSalary,
      postedDate: posted,
      targetStartDate: addDays(today, rng.int(14, 75)),
      description: `${j.description} Cardinal Peak is hiring a ${j.name} to join our ${spec.dept.replace('dep_', '').toUpperCase()} team. You will work alongside a tenured group in a business that has grown every year since 2009.`,
      requirements: REQUIREMENTS[reqKind],
      boards: rng.pickMany(['Company careers site', 'Broadpost Network', 'LinkedIn', 'Indeed', 'Industry association'], rng.int(2, 4)),
      createdAt: isoAt(posted ?? addDays(today, -5), '09:00'),
      approvedBy: spec.status === 'pending_approval' || spec.status === 'draft' ? null : managerFor('dep_exec').id,
    });
  });

  const openReqs = requisitions.filter((r) => r.status === 'open' || r.status === 'filled');
  const STAGES: [CandidateStage, number][] = [
    ['applied', 34], ['screening', 18], ['interview', 14], ['final_interview', 8],
    ['offer', 5], ['hired', 6], ['rejected', 13], ['withdrawn', 2],
  ];

  const usedNames = new Set<string>();
  for (let i = 0; i < 96; i++) {
    let first = rng.pick(FIRST_NAMES);
    let last = rng.pick(LAST_NAMES);
    let guard = 0;
    while (usedNames.has(`${first} ${last}`) && guard++ < 50) {
      first = rng.pick(FIRST_NAMES);
      last = rng.pick(LAST_NAMES);
    }
    usedNames.add(`${first} ${last}`);
    const req = openReqs[i % openReqs.length];
    const j = JOB_TITLES.find((x) => x.id === req.jobTitleId)!;
    const stage = rng.weighted<CandidateStage>(STAGES);
    const appliedDaysAgo = rng.int(1, 90);

    const candidate: Candidate = {
      id: `cand_${i + 1}`,
      firstName: first,
      lastName: last,
      email: `${first}.${last}`.toLowerCase() + '@mailbox.example',
      phone: `${rng.int(2, 9)}${rng.int(0, 9)}${rng.int(0, 9)}${rng.int(200, 999)}${String(rng.int(0, 9999)).padStart(4, '0')}`,
      city: rng.pick(['Denver', 'Aurora', 'Phoenix', 'Mesa', 'Austin', 'Columbus', 'Sacramento', 'Reno', 'Tucson', 'Cleveland']),
      state: rng.pick(['CO', 'AZ', 'TX', 'OH', 'CA', 'NV']),
      source: rng.pick(CANDIDATE_SOURCES),
      resumeFileName: `${last}_${first}_Resume.pdf`,
      linkedIn: `linkedin.example/in/${first.toLowerCase()}-${last.toLowerCase()}`,
      yearsExperience: rng.int(0, 18),
      skills: rng.pickMany(SKILLS, rng.int(3, 7)),
      currentTitle: rng.pick([j.name, `Senior ${j.name}`, `${j.name} II`, 'Operations Associate', 'Technician', 'Analyst']),
      currentCompany: rng.pick(['Vantage Industrial', 'Copperline Services', 'Northgate Supply', 'Harbor Logistics', 'Bluestem Group', 'Ridgeway Partners', 'Self-employed']),
      desiredSalary: Math.round((j.minSalary + (j.maxSalary - j.minSalary) * rng.float(0.2, 0.95)) / 500) * 500,
      createdAt: isoAt(addDays(today, -appliedDaysAgo), '11:20'),
      rating: rng.int(2, 5),
      tags: rng.pickMany(['Referral', 'Bilingual', 'Veteran', 'Relocating', 'Internal', 'Strong portfolio', 'Immediate availability'], rng.int(0, 2)),
    };
    candidates.push(candidate);

    const appliedAt = candidate.createdAt;
    const history: Application['history'] = [{ stage: 'applied', at: appliedAt, byId: req.recruiterId }];
    const path: CandidateStage[] = ['applied', 'screening', 'interview', 'final_interview', 'offer', 'hired'];
    const endIdx = stage === 'rejected' || stage === 'withdrawn' ? rng.int(1, 4) : path.indexOf(stage);
    for (let s = 1; s <= endIdx; s++) {
      history.push({ stage: path[s], at: isoAt(addDays(today, -appliedDaysAgo + s * rng.int(2, 7)), '14:00'), byId: req.recruiterId });
    }
    if (stage === 'rejected' || stage === 'withdrawn') {
      history.push({ stage, at: isoAt(addDays(today, -rng.int(1, appliedDaysAgo)), '16:30'), byId: req.recruiterId });
    }

    const app: Application = {
      id: `app_${i + 1}`,
      candidateId: candidate.id,
      requisitionId: req.id,
      stage,
      appliedAt,
      stageChangedAt: history[history.length - 1].at,
      rejectionReason: stage === 'rejected'
        ? rng.pick(['Experience not aligned with the role', 'Stronger candidates advanced', 'Compensation expectations out of band', 'Unable to meet schedule requirements', 'Withdrew from consideration'])
        : null,
      score: rng.int(45, 98),
      notes: rng.chance(0.55) ? [{
        id: `note_${i}`, authorId: req.recruiterId,
        at: isoAt(addDays(today, -rng.int(1, 20)), '13:00'),
        body: rng.pick([
          'Strong phone screen. Clear communicator and asks good questions about the operating model.',
          'Solid technical depth but limited experience with our scale. Worth a panel.',
          'Great culture add. Needs schedule flexibility confirmed before we advance.',
          'Referred by a current team member; moving quickly.',
          'Asked about relocation assistance — flagged for the hiring manager.',
        ]),
      }] : [],
      history,
    };
    applications.push(app);

    if (['interview', 'final_interview', 'offer', 'hired'].includes(stage)) {
      const rounds = stage === 'interview' ? 1 : stage === 'final_interview' ? 2 : 3;
      const panel = employees.filter((e) => e.departmentId === req.departmentId && e.status === 'active');
      for (let r = 0; r < rounds; r++) {
        const scheduledDaysAgo = appliedDaysAgo - (r + 1) * rng.int(3, 8);
        const isFuture = scheduledDaysAgo < 0;
        const interviewers = panel.length ? rng.pickMany(panel, Math.min(panel.length, r === 0 ? 1 : 3)).map((e) => e.id) : [req.hiringManagerId];
        interviews.push({
          id: `int_${i}_${r}`,
          applicationId: app.id,
          round: ['Recruiter screen', 'Hiring manager interview', 'Panel interview'][r],
          scheduledAt: isoAt(addDays(today, -scheduledDaysAgo), rng.pick(['09:00', '10:30', '13:00', '15:30'])),
          durationMinutes: r === 0 ? 30 : 60,
          interviewerIds: interviewers,
          mode: r === 0 ? 'phone' : rng.chance(0.6) ? 'video' : 'onsite',
          status: isFuture ? 'scheduled' : rng.chance(0.95) ? 'completed' : 'no_show',
          feedback: isFuture ? [] : interviewers.map((id) => ({
            interviewerId: id,
            recommendation: rng.weighted([['strong_yes', 20], ['yes', 45], ['neutral', 20], ['no', 12], ['strong_no', 3]]),
            rating: rng.int(2, 5),
            strengths: rng.pick([
              'Clear, structured answers and strong ownership examples.',
              'Deep hands-on experience with the exact equipment we run.',
              'Excellent customer instincts under pressure.',
              'Thoughtful about tradeoffs and asked sharp questions.',
            ]),
            concerns: rng.pick([
              'Limited exposure to multi-site operations.',
              'Would need ramp time on our systems.',
              'Compensation expectations at the top of band.',
              'None material.',
            ]),
            submittedAt: isoAt(addDays(today, -scheduledDaysAgo + 1), '17:00'),
          })),
        });
      }
    }

    if (stage === 'offer' || stage === 'hired') {
      const base = Math.round((j.minSalary + (j.maxSalary - j.minSalary) * rng.float(0.35, 0.8)) / 500) * 500;
      const hourly = j.flsa === 'non_exempt';
      offers.push({
        id: `off_${i + 1}`,
        applicationId: app.id,
        candidateId: candidate.id,
        requisitionId: req.id,
        baseSalary: hourly ? 0 : base,
        payType: hourly ? 'hourly' : 'salary',
        hourlyRate: hourly ? Number((j.minSalary + (j.maxSalary - j.minSalary) * rng.float(0.3, 0.85)).toFixed(2)) : 0,
        signingBonus: rng.chance(0.3) ? rng.pick([1000, 2500, 5000]) : 0,
        equity: '—',
        startDate: addDays(today, stage === 'hired' ? -rng.int(1, 40) : rng.int(10, 45)),
        expiresOn: addDays(today, stage === 'hired' ? -rng.int(1, 30) : rng.int(3, 10)),
        status: stage === 'hired' ? 'accepted' : rng.weighted([['sent', 45], ['pending_approval', 25], ['approved', 20], ['draft', 10]]),
        approverId: req.hiringManagerId,
        createdBy: req.recruiterId,
        createdAt: isoAt(addDays(today, -rng.int(2, 25)), '12:00'),
        note: '',
      });
    }
  }

  return { requisitions, candidates, applications, interviews, offers };
};

/* ------------------------------------------------------------- onboarding */

export interface OnboardingSeed {
  packets: OnboardingPacket[];
  tasks: OnboardingTask[];
}

export const seedOnboarding = (rng: Rng, employees: Employee[], today: ISODate): OnboardingSeed => {
  const packets: OnboardingPacket[] = [];
  const tasks: OnboardingTask[] = [];

  const recent = employees.filter(
    (e) => (e.status === 'pending_hire' || diffDays(e.hireDate, today) <= 75) && e.status !== 'terminated',
  );

  recent.forEach((emp, i) => {
    const template = ONBOARDING_TEMPLATES.find((t) => t.departmentIds.includes(emp.departmentId)) ?? ONBOARDING_TEMPLATES[0];
    const packetId = `pkt_${i + 1}`;
    const daysSinceStart = diffDays(emp.hireDate, today);
    const packetTasks: OnboardingTask[] = template.tasks.map((t, ti) => {
      const dueDate = addDays(emp.hireDate, t.dueOffsetDays);
      const elapsed = diffDays(dueDate, today);
      let status: OnboardingTask['status'];
      if (daysSinceStart < 0) status = t.dueOffsetDays < 0 && rng.chance(0.7) ? 'completed' : 'not_started';
      else if (elapsed > 3) status = rng.chance(0.86) ? 'completed' : 'overdue';
      else if (elapsed >= 0) status = rng.weighted([['completed', 55], ['in_progress', 25], ['overdue', 20]]);
      else status = rng.weighted([['not_started', 45], ['in_progress', 35], ['completed', 20]]);
      if (!t.required && status === 'overdue') status = 'in_progress';

      return {
        id: `otk_${i + 1}_${ti}`,
        packetId,
        key: t.key,
        title: t.title,
        owner: t.owner,
        kind: t.kind,
        dueDate,
        required: t.required,
        description: t.description,
        status,
        completedAt: status === 'completed' ? isoAt(dueDate, '15:00') : null,
        completedBy: status === 'completed' ? emp.userId : null,
        documentId: null,
      };
    });
    tasks.push(...packetTasks);

    const done = packetTasks.filter((t) => t.status === 'completed' || t.status === 'waived').length;
    packets.push({
      id: packetId,
      employeeId: emp.id,
      templateId: template.id,
      startDate: emp.hireDate,
      status: done === packetTasks.length ? 'completed' : done === 0 ? 'not_started' : 'in_progress',
      createdAt: isoAt(addDays(emp.hireDate, -7), '10:00'),
      completedAt: done === packetTasks.length ? isoAt(addDays(emp.hireDate, 14), '16:00') : null,
      buddyId: employees.find((e) => e.departmentId === emp.departmentId && e.id !== emp.id && e.status === 'active')?.id ?? null,
    });
    emp.onboardingPacketId = packetId;
  });

  return { packets, tasks };
};

/* ------------------------------------------------------------ performance */

const GOAL_TEMPLATES: Record<string, { title: string; metric: string; unit: string; target: number }[]> = {
  default: [
    { title: 'Complete all required compliance training on time', metric: 'Courses completed', unit: 'courses', target: 3 },
    { title: 'Answer inbound requests within the response SLA', metric: 'Requests answered in SLA', unit: '%', target: 95 },
    { title: 'Document one recurring process this quarter', metric: 'Runbooks published', unit: 'docs', target: 1 },
  ],
  dep_eng: [
    { title: 'Raise deployment frequency for the scheduling service', metric: 'Deploys per quarter', unit: 'deploys', target: 40 },
    { title: 'Ship the scheduling API v2 migration', metric: 'Endpoints migrated', unit: 'endpoints', target: 14 },
    { title: 'Raise unit test coverage on the payroll module', metric: 'Coverage', unit: '%', target: 85 },
    { title: 'Close the top five customer-reported defects', metric: 'Defects closed', unit: 'defects', target: 5 },
  ],
  dep_sls: [
    { title: 'Achieve annual new-logo bookings target', metric: 'New bookings', unit: 'USD', target: 850000 },
    { title: 'Grow qualified pipeline coverage to 3×', metric: 'Pipeline coverage', unit: 'x', target: 3 },
    { title: 'Complete 40 discovery calls this quarter', metric: 'Discovery calls', unit: 'calls', target: 40 },
  ],
  dep_whs: [
    { title: 'Hold inventory accuracy above 99.5%', metric: 'Inventory accuracy', unit: '%', target: 99.5 },
    { title: 'Hold order pick accuracy above target', metric: 'Pick accuracy', unit: '%', target: 99.6 },
    { title: 'Complete forklift recertification', metric: 'Certifications current', unit: 'certs', target: 1 },
  ],
  dep_fld: [
    { title: 'Maintain first-visit resolution rate', metric: 'First-visit resolution', unit: '%', target: 88 },
    { title: 'Sustain an incident-free service year', metric: 'Days without a recordable incident', unit: 'days', target: 365 },
    { title: 'Complete 120 preventive maintenance visits', metric: 'PM visits', unit: 'visits', target: 120 },
  ],
  dep_cs: [
    { title: 'Sustain CSAT above 4.6', metric: 'CSAT', unit: 'score', target: 4.6 },
    { title: 'Resolve tickets within the 8-hour SLA', metric: 'SLA attainment', unit: '%', target: 95 },
    { title: 'Raise first-contact resolution', metric: 'First-contact resolution', unit: '%', target: 82 },
  ],
  dep_fin: [
    { title: 'Close the books on time every month', metric: 'On-time closes', unit: 'months', target: 12 },
    { title: 'Collect aged receivables over 60 days', metric: 'Aged AR collected', unit: 'USD', target: 120000 },
    { title: 'Clear the annual audit checklist', metric: 'Audit items cleared', unit: 'items', target: 42 },
  ],
  dep_hr: [
    { title: 'Fill open requisitions on plan', metric: 'Requisitions filled', unit: 'reqs', target: 24 },
    { title: 'Reach 95% onboarding task completion by day 30', metric: 'Completion by day 30', unit: '%', target: 95 },
    { title: 'Deliver manager training to every new people leader', metric: 'Managers trained', unit: 'managers', target: 12 },
  ],
};

export interface PerformanceSeed {
  cycles: ReviewCycle[];
  reviews: PerformanceReview[];
  goals: Goal[];
  feedback: PeerFeedback[];
}

const COMPETENCIES = [
  'Ownership & accountability', 'Collaboration', 'Communication',
  'Quality of work', 'Customer focus', 'Safety & compliance',
];

export const seedPerformance = (rng: Rng, employees: Employee[], today: ISODate): PerformanceSeed => {
  const year = Number(today.slice(0, 4));
  const cycles: ReviewCycle[] = [
    {
      id: `cyc_${year - 1}`, name: `${year - 1} Annual Review`,
      periodStart: `${year - 1}-01-01`, periodEnd: `${year - 1}-12-31`,
      selfReviewDue: `${year}-01-15`, managerReviewDue: `${year}-01-31`, finalDue: `${year}-02-14`,
      status: 'closed', departmentIds: [], competencies: COMPETENCIES,
      ratingScale: [
        { value: 1, label: 'Below expectations' }, { value: 2, label: 'Developing' },
        { value: 3, label: 'Meets expectations' }, { value: 4, label: 'Exceeds expectations' },
        { value: 5, label: 'Outstanding' },
      ],
    },
    {
      id: `cyc_${year}`, name: `${year} Annual Review`,
      periodStart: `${year}-01-01`, periodEnd: `${year}-12-31`,
      selfReviewDue: `${year}-12-05`, managerReviewDue: `${year}-12-19`, finalDue: `${year + 1}-01-16`,
      status: 'active', departmentIds: [], competencies: COMPETENCIES,
      ratingScale: [
        { value: 1, label: 'Below expectations' }, { value: 2, label: 'Developing' },
        { value: 3, label: 'Meets expectations' }, { value: 4, label: 'Exceeds expectations' },
        { value: 5, label: 'Outstanding' },
      ],
    },
    {
      id: `cyc_mid_${year}`, name: `${year} Mid-Year Check-in`,
      periodStart: `${year}-01-01`, periodEnd: `${year}-06-30`,
      selfReviewDue: `${year}-07-10`, managerReviewDue: `${year}-07-24`, finalDue: `${year}-08-07`,
      status: 'closed', departmentIds: [], competencies: COMPETENCIES.slice(0, 4),
      ratingScale: [
        { value: 1, label: 'Off track' }, { value: 2, label: 'Needs attention' },
        { value: 3, label: 'On track' }, { value: 4, label: 'Ahead of plan' },
      ],
    },
  ];

  const reviews: PerformanceReview[] = [];
  const goals: Goal[] = [];
  const feedback: PeerFeedback[] = [];
  const eligible = employees.filter((e) => e.status === 'active' && e.managerId);

  eligible.forEach((emp, i) => {
    // Prior year — closed and acknowledged.
    const priorRating = rng.weighted([[2, 8], [3, 46], [4, 34], [5, 12]]);
    reviews.push({
      id: `rev_${year - 1}_${emp.id}`, cycleId: `cyc_${year - 1}`, employeeId: emp.id, managerId: emp.managerId!,
      stage: 'acknowledged', selfRating: Math.min(5, priorRating + rng.weighted([[0, 60], [1, 30], [-1, 10]])),
      managerRating: priorRating, finalRating: priorRating,
      competencyRatings: COMPETENCIES.map((c) => ({ competency: c, self: rng.int(3, 5), manager: rng.int(Math.max(2, priorRating - 1), Math.min(5, priorRating + 1)) })),
      selfComments: 'Focused on delivery consistency and picking up more cross-team work this year.',
      managerComments: rng.pick([
        'Dependable contributor who raised the bar on quality this year.',
        'Consistently strong execution; ready for broader scope in the coming year.',
        'Delivered against plan with visible improvement in stakeholder communication.',
      ]),
      strengths: rng.pick(['Reliability, follow-through, and a calm approach under pressure.', 'Technical depth and willingness to mentor.', 'Customer empathy and clear written updates.']),
      opportunities: rng.pick(['Delegate more and document decisions earlier.', 'Increase visibility of work in progress.', 'Take on a cross-functional initiative next year.']),
      peerFeedbackIds: [],
      acknowledgedAt: `${year}-02-${String(rng.int(1, 14)).padStart(2, '0')}T17:00:00.000Z`,
      submittedSelfAt: `${year}-01-${String(rng.int(5, 15)).padStart(2, '0')}T17:00:00.000Z`,
      submittedManagerAt: `${year}-01-${String(rng.int(20, 31)).padStart(2, '0')}T17:00:00.000Z`,
      merit: {
        increasePercent: Number((2 + priorRating * 0.8 + rng.float(-0.4, 0.6, 1)).toFixed(1)),
        newSalary: emp.baseSalary,
        effectiveDate: `${year}-03-01`,
      },
    });

    // Current cycle — in flight.
    const stage: PerformanceReview['stage'] = rng.weighted([
      ['draft', 22], ['self_review', 34], ['manager_review', 24], ['calibration', 10], ['final_review', 7], ['acknowledged', 3],
    ]);
    const hasSelf = ['manager_review', 'calibration', 'final_review', 'acknowledged'].includes(stage);
    const hasMgr = ['calibration', 'final_review', 'acknowledged'].includes(stage);
    const rev: PerformanceReview = {
      id: `rev_${year}_${emp.id}`, cycleId: `cyc_${year}`, employeeId: emp.id, managerId: emp.managerId!,
      stage,
      selfRating: hasSelf ? rng.int(3, 5) : null,
      managerRating: hasMgr ? rng.weighted([[2, 6], [3, 44], [4, 38], [5, 12]]) : null,
      finalRating: stage === 'acknowledged' ? rng.weighted([[3, 45], [4, 40], [5, 15]]) : null,
      competencyRatings: COMPETENCIES.map((c) => ({
        competency: c,
        self: hasSelf ? rng.int(3, 5) : null,
        manager: hasMgr ? rng.int(2, 5) : null,
      })),
      selfComments: hasSelf ? 'Delivered on my primary goals and took on additional scope in the second half of the year.' : '',
      managerComments: hasMgr ? 'Strong year overall with clear growth in ownership and communication.' : '',
      strengths: hasMgr ? 'Consistent delivery and a steady partner for the rest of the team.' : '',
      opportunities: hasMgr ? 'Push for earlier escalation when a project starts to slip.' : '',
      peerFeedbackIds: [],
      acknowledgedAt: stage === 'acknowledged' ? isoAt(addDays(today, -rng.int(1, 20)), '16:00') : null,
      submittedSelfAt: hasSelf ? isoAt(addDays(today, -rng.int(3, 25)), '17:00') : null,
      submittedManagerAt: hasMgr ? isoAt(addDays(today, -rng.int(1, 12)), '17:00') : null,
      merit: null,
    };
    reviews.push(rev);

    if (i % 4 === 0) {
      const peers = employees.filter((p) => p.departmentId === emp.departmentId && p.id !== emp.id && p.status === 'active');
      for (const peer of rng.pickMany(peers, Math.min(2, peers.length))) {
        const fb: PeerFeedback = {
          id: `pfb_${emp.id}_${peer.id}`, reviewId: rev.id, authorId: peer.id,
          relationship: rng.weighted([['peer', 70], ['cross_functional', 22], ['direct_report', 8]]),
          strengths: rng.pick([
            'Always answers questions quickly and explains the reasoning, not just the answer.',
            'Handles pressure well and keeps the team calm during escalations.',
            'Excellent partner on cross-team work — follows through without reminders.',
          ]),
          opportunities: rng.pick([
            'Could share work in progress earlier so others can help.',
            'Would benefit from delegating more of the routine work.',
            'More written summaries after big decisions would help the wider team.',
          ]),
          submittedAt: isoAt(addDays(today, -rng.int(2, 30)), '15:00'),
          anonymous: rng.chance(0.5),
        };
        feedback.push(fb);
        rev.peerFeedbackIds.push(fb.id);
      }
    }

    const templates = GOAL_TEMPLATES[emp.departmentId] ?? GOAL_TEMPLATES.default;
    const count = rng.int(2, 4);
    for (let g = 0; g < count; g++) {
      const t = templates[(g + i) % templates.length];
      const progress = rng.float(0.05, 1.15, 2);
      const current = Number((t.target * Math.min(progress, 1.2)).toFixed(2));
      const dueDate = `${year}-12-31`;
      const status: Goal['status'] = progress >= 1 ? 'completed'
        : progress > 0.7 ? 'on_track'
        : progress > 0.45 ? 'at_risk'
        : progress > 0.05 ? 'behind' : 'not_started';
      goals.push({
        id: `goal_${emp.id}_${g}`, employeeId: emp.id, title: t.title,
        description: `${t.metric} tracked monthly against a target of ${t.target} ${t.unit}.`,
        category: g === 0 ? 'business' : g === 1 ? 'okr' : rng.chance(0.5) ? 'development' : 'team',
        metric: t.metric, target: t.target, current, unit: t.unit,
        startDate: `${year}-01-01`, dueDate, status,
        weight: count === 2 ? 50 : count === 3 ? 34 : 25,
        alignedToId: null, createdBy: emp.managerId!,
        updates: [
          { at: isoAt(`${year}-06-30`, '12:00'), byId: emp.id, value: Number((current * 0.5).toFixed(2)), note: 'Mid-year checkpoint.' },
          { at: isoAt(addDays(today, -rng.int(3, 40)), '12:00'), byId: emp.id, value: current, note: 'Latest update.' },
        ],
      });
    }
  });

  return { cycles, reviews, goals, feedback };
};

/* --------------------------------------------------------------- learning */

const requiredCoursesFor = (emp: Employee): Course[] => {
  const out = COURSES.filter((c) => c.category === 'compliance' && c.code !== 'CMP-103');
  if (emp.departmentId === 'dep_whs') out.push(COURSES.find((c) => c.id === 'crs_safety')!);
  if (emp.departmentId === 'dep_fld') out.push(COURSES.find((c) => c.id === 'crs_ladder')!);
  if (emp.jobTitleId === 'job_driver') out.push(COURSES.find((c) => c.id === 'crs_dot')!);
  return out;
};

export const seedLearning = (rng: Rng, employees: Employee[], today: ISODate): TrainingAssignment[] => {
  const out: TrainingAssignment[] = [];
  let n = 0;

  for (const emp of employees) {
    if (emp.status === 'terminated') continue;
    const isNew = diffDays(emp.hireDate, today) < 75;
    const courses = [...requiredCoursesFor(emp)];
    if (isNew) courses.push(COURSES.find((c) => c.id === 'crs_onb')!, COURSES.find((c) => c.id === 'crs_benefits')!);
    if (emp.roles.includes('manager')) courses.push(COURSES.find((c) => c.id === 'crs_lead1')!, COURSES.find((c) => c.id === 'crs_interview')!);
    if (rng.chance(0.3)) courses.push(rng.pick(COURSES.filter((c) => !c.mandatory)));

    for (const course of [...new Set(courses)]) {
      const assignedAt = isNew ? emp.hireDate : addDays(today, -rng.int(10, 150));
      const dueDate = addDays(assignedAt, course.mandatory ? 30 : 90);
      const overdue = dueDate < today;
      let status: TrainingAssignment['status'];
      let progress: number;
      if (overdue) {
        status = rng.weighted([['completed', 82], ['overdue', 14], ['in_progress', 4]]);
      } else {
        status = rng.weighted([['completed', 40], ['in_progress', 28], ['assigned', 32]]);
      }
      progress = status === 'completed' ? 100 : status === 'in_progress' ? rng.int(15, 90) : 0;

      out.push({
        id: `trn_${++n}`,
        courseId: course.id,
        employeeId: emp.id,
        assignedBy: emp.managerId ?? 'usr_hr',
        assignedAt: isoAt(assignedAt, '08:00'),
        dueDate,
        status,
        progressPercent: progress,
        completedAt: status === 'completed' ? isoAt(addDays(dueDate, -rng.int(0, 20)), '14:00') : null,
        score: status === 'completed' && course.passingScore > 0 ? rng.int(course.passingScore, 100) : null,
        certificateId: status === 'completed' && course.passingScore > 0 ? `cert_${n}` : null,
      });
    }
  }

  return out;
};
