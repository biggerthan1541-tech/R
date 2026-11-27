/**
 * Meridian HCM — unified domain model.
 *
 * One employee record is the spine of the platform: recruiting writes into it,
 * time/scheduling/benefits hang off it, and payroll reads from all of them.
 * Dates are ISO `YYYY-MM-DD`; instants are full ISO-8601 strings.
 */

export type ID = string;
export type ISODate = string;
export type ISODateTime = string;

/* ------------------------------------------------------------------ roles */

export type Role =
  | 'employee'
  | 'manager'
  | 'hr_admin'
  | 'payroll_admin'
  | 'recruiter'
  | 'benefits_admin'
  | 'finance'
  | 'sys_admin'
  | 'executive';

export interface RoleMeta {
  id: Role;
  label: string;
  short: string;
  blurb: string;
}

/* ------------------------------------------------------------- foundation */

export interface Organization {
  id: ID;
  legalName: string;
  dba: string;
  ein: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  fiscalYearStart: string;
  defaultCurrency: string;
  timezone: string;
  workweekStart: 0 | 1;
  industry: string;
  founded: string;
}

export interface Location {
  id: ID;
  code: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  timezone: string;
  geo: { lat: number; lng: number };
  geofenceMeters: number;
  active: boolean;
}

export interface Department {
  id: ID;
  code: string;
  name: string;
  costCenter: string;
  glAccount: string;
  headEmployeeId: ID | null;
  parentId: ID | null;
}

export interface JobTitle {
  id: ID;
  code: string;
  name: string;
  departmentId: ID;
  level: 'IC1' | 'IC2' | 'IC3' | 'IC4' | 'IC5' | 'M1' | 'M2' | 'M3' | 'E1';
  flsa: 'exempt' | 'non_exempt';
  eeoCategory: string;
  minSalary: number;
  maxSalary: number;
  description: string;
}

/* -------------------------------------------------------------- employees */

export type EmploymentStatus =
  | 'active'
  | 'on_leave'
  | 'terminated'
  | 'pending_hire'
  | 'suspended';

export type EmploymentType = 'full_time' | 'part_time' | 'temp' | 'contractor' | 'intern';
export type PayType = 'salary' | 'hourly';

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

export interface Dependent {
  id: ID;
  employeeId: ID;
  firstName: string;
  lastName: string;
  relationship: 'spouse' | 'domestic_partner' | 'child' | 'other';
  dob: ISODate;
  ssnLast4: string;
  isCovered: boolean;
}

export interface DirectDeposit {
  id: ID;
  employeeId: ID;
  nickname: string;
  bankName: string;
  accountType: 'checking' | 'savings';
  routingLast4: string;
  accountLast4: string;
  allocationType: 'percent' | 'fixed' | 'remainder';
  allocationValue: number;
  priority: number;
  active: boolean;
  verified: boolean;
}

export interface TaxProfile {
  employeeId: ID;
  filingStatus: 'single' | 'married_joint' | 'head_of_household';
  federalAllowances: number;
  additionalFederal: number;
  stateCode: string;
  stateAllowances: number;
  additionalState: number;
  exemptFederal: boolean;
  w4Year: number;
  lastUpdated: ISODate;
  complete: boolean;
}

export interface Employee {
  id: ID;
  employeeNumber: string;
  userId: ID;
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  personalEmail: string;
  phone: string;
  avatarSeed: string;
  dob: ISODate;
  ssnLast4: string;
  gender: 'female' | 'male' | 'non_binary' | 'undisclosed';
  ethnicity: string;
  veteranStatus: 'not_a_veteran' | 'veteran' | 'undisclosed';
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;

  status: EmploymentStatus;
  employmentType: EmploymentType;
  hireDate: ISODate;
  seniorityDate: ISODate;
  terminationDate: ISODate | null;
  terminationReason: string | null;
  rehireEligible: boolean;

  departmentId: ID;
  jobTitleId: ID;
  locationId: ID;
  managerId: ID | null;
  payGroupId: ID;

  payType: PayType;
  baseSalary: number;
  hourlyRate: number;
  standardHoursPerWeek: number;
  ptoPolicyId: ID;
  emergencyContacts: EmergencyContact[];
  skills: string[];
  certifications: { name: string; issuer: string; issued: ISODate; expires: ISODate | null }[];
  badgeId: string;
  roles: Role[];
  onboardingPacketId: ID | null;
  candidateId: ID | null;
  workAuthorized: boolean;
  i9Complete: boolean;
  remote: boolean;
  bio: string;
}

export type LifecycleAction =
  | 'hire'
  | 'rehire'
  | 'transfer'
  | 'promotion'
  | 'compensation_change'
  | 'manager_change'
  | 'department_change'
  | 'location_change'
  | 'leave_start'
  | 'leave_return'
  | 'status_change'
  | 'termination';

export interface EmploymentEvent {
  id: ID;
  employeeId: ID;
  action: LifecycleAction;
  effectiveDate: ISODate;
  createdAt: ISODateTime;
  createdBy: ID;
  summary: string;
  changes: { field: string; from: string; to: string }[];
  note: string;
}

export interface CompensationRecord {
  id: ID;
  employeeId: ID;
  effectiveDate: ISODate;
  payType: PayType;
  annualSalary: number;
  hourlyRate: number;
  changeReason: string;
  changePercent: number;
  approvedBy: ID | null;
}

/* ----------------------------------------------------------- time & pay ops */

export type PunchType = 'in' | 'out' | 'break_start' | 'break_end';
export type PunchSource = 'web' | 'mobile' | 'kiosk' | 'badge' | 'biometric' | 'admin';

export interface Punch {
  id: ID;
  employeeId: ID;
  timecardId: ID;
  type: PunchType;
  at: ISODateTime;
  source: PunchSource;
  locationId: ID | null;
  geo: { lat: number; lng: number } | null;
  withinGeofence: boolean;
  ipAddress: string;
  device: string;
  jobCode: string;
  note: string;
  edited: boolean;
  editedBy: ID | null;
}

export type TimecardStatus = 'open' | 'submitted' | 'approved' | 'rejected' | 'locked' | 'paid';

export interface TimecardDay {
  date: ISODate;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  breakMinutes: number;
  ptoHours: number;
  holidayHours: number;
  exceptions: TimeException[];
  jobCode: string;
}

export type TimeExceptionKind =
  | 'missed_punch'
  | 'short_break'
  | 'no_break'
  | 'late_in'
  | 'early_out'
  | 'overtime'
  | 'outside_geofence'
  | 'long_shift'
  | 'unscheduled';

export interface TimeException {
  kind: TimeExceptionKind;
  severity: 'info' | 'warning' | 'error';
  message: string;
  resolved: boolean;
}

export interface Timecard {
  id: ID;
  employeeId: ID;
  periodStart: ISODate;
  periodEnd: ISODate;
  payPeriodId: ID;
  status: TimecardStatus;
  days: TimecardDay[];
  totalRegular: number;
  totalOvertime: number;
  totalDoubleTime: number;
  totalPto: number;
  totalHoliday: number;
  submittedAt: ISODateTime | null;
  approvedBy: ID | null;
  approvedAt: ISODateTime | null;
  rejectionNote: string | null;
}

export interface PunchCorrectionRequest {
  id: ID;
  employeeId: ID;
  timecardId: ID;
  date: ISODate;
  requestedChange: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: ISODateTime;
  decidedBy: ID | null;
  decidedAt: ISODateTime | null;
  decisionNote: string;
}

/* ------------------------------------------------------------- scheduling */

export type ShiftStatus = 'draft' | 'published' | 'open' | 'swap_pending' | 'cancelled' | 'completed';

export interface Shift {
  id: ID;
  employeeId: ID | null;
  departmentId: ID;
  locationId: ID;
  date: ISODate;
  start: string;
  end: string;
  breakMinutes: number;
  role: string;
  jobCode: string;
  status: ShiftStatus;
  note: string;
  publishedAt: ISODateTime | null;
  createdBy: ID;
}

export interface Availability {
  id: ID;
  employeeId: ID;
  dayOfWeek: number;
  available: boolean;
  start: string;
  end: string;
  note: string;
}

export interface ShiftSwapRequest {
  id: ID;
  shiftId: ID;
  requesterId: ID;
  targetEmployeeId: ID | null;
  type: 'swap' | 'giveaway' | 'pickup';
  status: 'pending_employee' | 'pending_manager' | 'approved' | 'denied' | 'cancelled';
  createdAt: ISODateTime;
  reason: string;
  decidedBy: ID | null;
  decidedAt: ISODateTime | null;
}

/* --------------------------------------------------------------- time off */

export type PtoKind = 'vacation' | 'sick' | 'personal' | 'bereavement' | 'jury_duty' | 'parental' | 'unpaid';

export interface PtoPolicy {
  id: ID;
  name: string;
  description: string;
  accrualMethod: 'per_pay_period' | 'monthly' | 'annual_grant' | 'unlimited';
  hoursPerYear: number;
  maxCarryoverHours: number;
  maxBalanceHours: number;
  waitingPeriodDays: number;
  requiresApproval: boolean;
  minNoticeDays: number;
  allowNegative: boolean;
  kinds: PtoKind[];
  active: boolean;
}

export interface PtoBalance {
  employeeId: ID;
  kind: PtoKind;
  accruedHours: number;
  usedHours: number;
  pendingHours: number;
  carryoverHours: number;
  asOf: ISODate;
}

export interface PtoRequest {
  id: ID;
  employeeId: ID;
  kind: PtoKind;
  startDate: ISODate;
  endDate: ISODate;
  hours: number;
  partialDay: boolean;
  note: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  createdAt: ISODateTime;
  decidedBy: ID | null;
  decidedAt: ISODateTime | null;
  decisionNote: string;
  flags: string[];
}

export interface Holiday {
  id: ID;
  name: string;
  date: ISODate;
  paid: boolean;
  locationIds: ID[];
}

export interface BlackoutPeriod {
  id: ID;
  name: string;
  startDate: ISODate;
  endDate: ISODate;
  departmentIds: ID[];
  reason: string;
}

/* ----------------------------------------------------------------- payroll */

export interface PayGroup {
  id: ID;
  name: string;
  frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  locationIds: ID[];
  checkDateOffsetDays: number;
  glSegment: string;
}

export interface PayPeriod {
  id: ID;
  payGroupId: ID;
  start: ISODate;
  end: ISODate;
  checkDate: ISODate;
  sequence: number;
  status: 'future' | 'open' | 'processing' | 'closed';
}

export type PayrollRunStatus =
  | 'draft'
  | 'gathering'
  | 'calculated'
  | 'validation'
  | 'employee_review'
  | 'pending_approval'
  | 'approved'
  | 'finalized'
  | 'paid'
  | 'cancelled';

export interface PayrollRun {
  id: ID;
  payGroupId: ID;
  payPeriodId: ID;
  runNumber: string;
  type: 'regular' | 'off_cycle' | 'bonus' | 'correction';
  status: PayrollRunStatus;
  createdAt: ISODateTime;
  createdBy: ID;
  calculatedAt: ISODateTime | null;
  approvedBy: ID | null;
  approvedAt: ISODateTime | null;
  finalizedAt: ISODateTime | null;
  totals: PayrollTotals;
  employeeCount: number;
  note: string;
}

export interface PayrollTotals {
  grossPay: number;
  netPay: number;
  employeeTaxes: number;
  employerTaxes: number;
  preTaxDeductions: number;
  postTaxDeductions: number;
  reimbursements: number;
  employerBenefits: number;
  totalCost: number;
  hours: number;
}

export type EarningCode =
  | 'regular'
  | 'overtime'
  | 'double_time'
  | 'salary'
  | 'pto'
  | 'holiday'
  | 'bonus'
  | 'commission'
  | 'reimbursement'
  | 'retro';

export interface PaycheckLine {
  code: EarningCode | string;
  label: string;
  hours: number;
  rate: number;
  amount: number;
}

export interface DeductionLine {
  code: string;
  label: string;
  amount: number;
  employerAmount: number;
  preTax: boolean;
  category: 'benefit' | 'retirement' | 'garnishment' | 'other';
}

export interface TaxLine {
  code: string;
  label: string;
  taxable: number;
  amount: number;
  employerAmount: number;
  jurisdiction: 'federal' | 'state' | 'local';
}

export interface Paycheck {
  id: ID;
  payrollRunId: ID;
  employeeId: ID;
  payPeriodId: ID;
  checkNumber: string;
  checkDate: ISODate;
  method: 'direct_deposit' | 'check' | 'pay_card';
  earnings: PaycheckLine[];
  deductions: DeductionLine[];
  taxes: TaxLine[];
  grossPay: number;
  netPay: number;
  totalHours: number;
  ytdGross: number;
  ytdNet: number;
  ytdTaxes: number;
  status: 'draft' | 'issued' | 'voided';
  employeeAcknowledged: boolean;
}

export interface Garnishment {
  id: ID;
  employeeId: ID;
  type: 'child_support' | 'tax_levy' | 'creditor' | 'student_loan';
  caseNumber: string;
  agency: string;
  amount: number;
  amountType: 'fixed' | 'percent_disposable';
  maxPercent: number;
  startDate: ISODate;
  endDate: ISODate | null;
  active: boolean;
  priority: number;
}

export type PayrollIssueLevel = 'error' | 'warning' | 'review' | 'ready';

export interface PayrollIssue {
  id: ID;
  payrollRunId: ID;
  employeeId: ID | null;
  level: PayrollIssueLevel;
  code: string;
  title: string;
  detail: string;
  suggestedAction: string;
  resolved: boolean;
  resolvedBy: ID | null;
  resolvedAt: ISODateTime | null;
  resolutionNote: string;
}

/* ---------------------------------------------------------------- benefits */

export type BenefitType =
  | 'medical' | 'dental' | 'vision' | 'life' | 'std' | 'ltd'
  | 'retirement_401k' | 'hsa' | 'fsa' | 'commuter' | 'pet';

export interface BenefitPlan {
  id: ID;
  type: BenefitType;
  name: string;
  carrier: string;
  planYear: number;
  network: string;
  deductibleIndividual: number;
  deductibleFamily: number;
  oopMaxIndividual: number;
  coinsurance: number;
  pcpCopay: number;
  rxCopay: number;
  employeeCostMonthly: { employee: number; employee_spouse: number; employee_children: number; family: number };
  employerCostMonthly: { employee: number; employee_spouse: number; employee_children: number; family: number };
  eligibility: { employmentTypes: EmploymentType[]; minHoursPerWeek: number; waitingPeriodDays: number };
  summary: string;
  active: boolean;
}

export type CoverageTier = 'employee' | 'employee_spouse' | 'employee_children' | 'family' | 'waived';

export interface BenefitEnrollment {
  id: ID;
  employeeId: ID;
  planId: ID;
  planYear: number;
  tier: CoverageTier;
  status: 'active' | 'pending' | 'waived' | 'terminated';
  effectiveDate: ISODate;
  endDate: ISODate | null;
  employeeCostPerPay: number;
  employerCostPerPay: number;
  dependentIds: ID[];
  electedAt: ISODateTime;
  contributionAmount: number;
}

export interface EnrollmentWindow {
  id: ID;
  name: string;
  type: 'open_enrollment' | 'new_hire' | 'qualifying_event';
  startDate: ISODate;
  endDate: ISODate;
  planYear: number;
  active: boolean;
}

/* --------------------------------------------------------------- recruiting */

export type RequisitionStatus = 'draft' | 'pending_approval' | 'open' | 'on_hold' | 'filled' | 'closed';

export interface Requisition {
  id: ID;
  code: string;
  title: string;
  departmentId: ID;
  locationId: ID;
  jobTitleId: ID;
  hiringManagerId: ID;
  recruiterId: ID;
  openings: number;
  filled: number;
  status: RequisitionStatus;
  employmentType: EmploymentType;
  salaryMin: number;
  salaryMax: number;
  postedDate: ISODate | null;
  targetStartDate: ISODate;
  description: string;
  requirements: string[];
  boards: string[];
  createdAt: ISODateTime;
  approvedBy: ID | null;
}

export type CandidateStage =
  | 'applied' | 'screening' | 'interview' | 'final_interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn';

export interface Candidate {
  id: ID;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  source: string;
  resumeFileName: string;
  linkedIn: string;
  yearsExperience: number;
  skills: string[];
  currentTitle: string;
  currentCompany: string;
  desiredSalary: number;
  createdAt: ISODateTime;
  rating: number;
  tags: string[];
}

export interface Application {
  id: ID;
  candidateId: ID;
  requisitionId: ID;
  stage: CandidateStage;
  appliedAt: ISODateTime;
  stageChangedAt: ISODateTime;
  rejectionReason: string | null;
  score: number;
  notes: { id: ID; authorId: ID; at: ISODateTime; body: string }[];
  history: { stage: CandidateStage; at: ISODateTime; byId: ID }[];
}

export interface Interview {
  id: ID;
  applicationId: ID;
  round: string;
  scheduledAt: ISODateTime;
  durationMinutes: number;
  interviewerIds: ID[];
  mode: 'onsite' | 'video' | 'phone';
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  feedback: InterviewFeedback[];
}

export interface InterviewFeedback {
  interviewerId: ID;
  recommendation: 'strong_yes' | 'yes' | 'neutral' | 'no' | 'strong_no';
  rating: number;
  strengths: string;
  concerns: string;
  submittedAt: ISODateTime;
}

export interface Offer {
  id: ID;
  applicationId: ID;
  candidateId: ID;
  requisitionId: ID;
  baseSalary: number;
  payType: PayType;
  hourlyRate: number;
  signingBonus: number;
  equity: string;
  startDate: ISODate;
  expiresOn: ISODate;
  status: 'draft' | 'pending_approval' | 'approved' | 'sent' | 'accepted' | 'declined' | 'rescinded';
  approverId: ID | null;
  createdBy: ID;
  createdAt: ISODateTime;
  note: string;
}

/* -------------------------------------------------------------- onboarding */

export type OnboardingTaskOwner = 'employee' | 'manager' | 'hr' | 'it' | 'payroll';
export type OnboardingTaskKind =
  | 'form' | 'document_sign' | 'upload' | 'training' | 'benefits' | 'direct_deposit'
  | 'tax_form' | 'equipment' | 'meeting' | 'acknowledgement';

export interface OnboardingTemplate {
  id: ID;
  name: string;
  departmentIds: ID[];
  tasks: {
    key: string; title: string; owner: OnboardingTaskOwner; kind: OnboardingTaskKind;
    dueOffsetDays: number; required: boolean; description: string;
  }[];
  active: boolean;
}

export interface OnboardingTask {
  id: ID;
  packetId: ID;
  key: string;
  title: string;
  owner: OnboardingTaskOwner;
  kind: OnboardingTaskKind;
  dueDate: ISODate;
  required: boolean;
  description: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue' | 'waived';
  completedAt: ISODateTime | null;
  completedBy: ID | null;
  documentId: ID | null;
}

export interface OnboardingPacket {
  id: ID;
  employeeId: ID;
  templateId: ID;
  startDate: ISODate;
  status: 'not_started' | 'in_progress' | 'completed';
  createdAt: ISODateTime;
  completedAt: ISODateTime | null;
  buddyId: ID | null;
}

/* ------------------------------------------------------------- performance */

export interface Goal {
  id: ID;
  employeeId: ID;
  title: string;
  description: string;
  category: 'business' | 'development' | 'team' | 'okr';
  metric: string;
  target: number;
  current: number;
  unit: string;
  startDate: ISODate;
  dueDate: ISODate;
  status: 'not_started' | 'on_track' | 'at_risk' | 'behind' | 'completed' | 'cancelled';
  weight: number;
  alignedToId: ID | null;
  createdBy: ID;
  updates: { at: ISODateTime; byId: ID; value: number; note: string }[];
}

export type ReviewStage =
  | 'draft' | 'self_review' | 'manager_review' | 'calibration' | 'final_review' | 'acknowledged';

export interface ReviewCycle {
  id: ID;
  name: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  selfReviewDue: ISODate;
  managerReviewDue: ISODate;
  finalDue: ISODate;
  status: 'planned' | 'active' | 'calibration' | 'closed';
  departmentIds: ID[];
  competencies: string[];
  ratingScale: { value: number; label: string }[];
}

export interface PerformanceReview {
  id: ID;
  cycleId: ID;
  employeeId: ID;
  managerId: ID;
  stage: ReviewStage;
  selfRating: number | null;
  managerRating: number | null;
  finalRating: number | null;
  competencyRatings: { competency: string; self: number | null; manager: number | null }[];
  selfComments: string;
  managerComments: string;
  strengths: string;
  opportunities: string;
  peerFeedbackIds: ID[];
  acknowledgedAt: ISODateTime | null;
  submittedSelfAt: ISODateTime | null;
  submittedManagerAt: ISODateTime | null;
  merit: { increasePercent: number; newSalary: number; effectiveDate: ISODate } | null;
}

export interface PeerFeedback {
  id: ID;
  reviewId: ID;
  authorId: ID;
  relationship: 'peer' | 'direct_report' | 'cross_functional';
  strengths: string;
  opportunities: string;
  submittedAt: ISODateTime;
  anonymous: boolean;
}

/* ---------------------------------------------------------------- learning */

export interface Course {
  id: ID;
  code: string;
  title: string;
  category: 'compliance' | 'safety' | 'leadership' | 'technical' | 'onboarding' | 'professional';
  description: string;
  durationMinutes: number;
  format: 'video' | 'document' | 'quiz' | 'instructor_led';
  mandatory: boolean;
  recurrenceMonths: number | null;
  modules: { title: string; minutes: number }[];
  passingScore: number;
  active: boolean;
}

export interface TrainingAssignment {
  id: ID;
  courseId: ID;
  employeeId: ID;
  assignedBy: ID;
  assignedAt: ISODateTime;
  dueDate: ISODate;
  status: 'assigned' | 'in_progress' | 'completed' | 'overdue' | 'waived';
  progressPercent: number;
  completedAt: ISODateTime | null;
  score: number | null;
  certificateId: ID | null;
}

/* ---------------------------------------------------------------- expenses */

export type ExpenseCategory =
  | 'travel' | 'meals' | 'lodging' | 'supplies' | 'software' | 'training'
  | 'mileage' | 'client_entertainment' | 'other';

export interface Expense {
  id: ID;
  reportId: ID | null;
  employeeId: ID;
  date: ISODate;
  category: ExpenseCategory;
  merchant: string;
  amount: number;
  currency: string;
  description: string;
  receiptFileName: string | null;
  billable: boolean;
  projectCode: string;
  status: 'draft' | 'submitted' | 'manager_approved' | 'finance_review' | 'approved' | 'rejected' | 'reimbursed';
  policyFlags: string[];
}

export interface ExpenseReport {
  id: ID;
  employeeId: ID;
  title: string;
  purpose: string;
  submittedAt: ISODateTime | null;
  status: 'draft' | 'submitted' | 'manager_approved' | 'finance_review' | 'approved' | 'rejected' | 'reimbursed';
  total: number;
  managerId: ID;
  managerDecisionAt: ISODateTime | null;
  financeDecisionAt: ISODateTime | null;
  decisionNote: string;
  reimbursedOnCheck: ID | null;
}

/* --------------------------------------------------------------- documents */

export type DocumentCategory =
  | 'tax' | 'payroll' | 'benefits' | 'policy' | 'contract' | 'performance'
  | 'training' | 'compliance' | 'personal' | 'onboarding';

export interface EmployeeDocument {
  id: ID;
  name: string;
  category: DocumentCategory;
  employeeId: ID | null;
  ownerId: ID;
  fileType: 'pdf' | 'docx' | 'png' | 'jpg' | 'xlsx';
  sizeKb: number;
  uploadedAt: ISODateTime;
  uploadedBy: ID;
  expiresOn: ISODate | null;
  version: number;
  versions: { version: number; at: ISODateTime; byId: ID; note: string }[];
  requiresSignature: boolean;
  signatureRequestId: ID | null;
  visibility: 'employee' | 'manager' | 'hr' | 'company';
  tags: string[];
  confidential: boolean;
}

export type SignatureState = 'draft' | 'sent' | 'viewed' | 'signed' | 'completed' | 'declined' | 'archived';

export interface SignatureRequest {
  id: ID;
  documentId: ID;
  documentName: string;
  requestedBy: ID;
  createdAt: ISODateTime;
  dueDate: ISODate;
  state: SignatureState;
  signers: {
    employeeId: ID;
    order: number;
    state: SignatureState;
    viewedAt: ISODateTime | null;
    signedAt: ISODateTime | null;
    signatureText: string | null;
    ipAddress: string | null;
  }[];
  documentVersion: number;
  auditTrail: { at: ISODateTime; actorId: ID; event: string }[];
}

/* --------------------------------------------- notifications, tasks, audit */

export type NotificationKind =
  | 'pto' | 'schedule' | 'timecard' | 'payroll' | 'document' | 'training'
  | 'performance' | 'expense' | 'task' | 'benefits' | 'recruiting' | 'system';

export interface AppNotification {
  id: ID;
  userId: ID;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: ISODateTime;
  read: boolean;
  actionPath: string | null;
  severity: 'info' | 'success' | 'warning' | 'error';
  channels: ('in_app' | 'email' | 'push' | 'sms')[];
}

export interface WorkTask {
  id: ID;
  assigneeId: ID;
  title: string;
  detail: string;
  kind: NotificationKind;
  dueDate: ISODate;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'completed' | 'dismissed';
  actionPath: string | null;
  createdAt: ISODateTime;
  completedAt: ISODateTime | null;
  relatedId: ID | null;
}

export interface AuditEntry {
  id: ID;
  at: ISODateTime;
  actorId: ID;
  actorName: string;
  action: string;
  objectType: string;
  objectId: ID;
  objectLabel: string;
  changes: { field: string; from: string; to: string }[];
  ipAddress: string;
  device: string;
  severity: 'info' | 'notice' | 'critical';
  module: string;
}

export interface Announcement {
  id: ID;
  title: string;
  body: string;
  authorId: ID;
  publishedAt: ISODateTime;
  pinned: boolean;
  audience: 'company' | 'department' | 'location';
  audienceId: ID | null;
  category: 'general' | 'benefits' | 'policy' | 'celebration' | 'urgent';
}

/* ------------------------------------------------------------- automation */

export type TriggerEvent =
  | 'overtime_recorded' | 'pto_requested' | 'pto_exceeds_balance' | 'onboarding_task_overdue'
  | 'payroll_anomaly' | 'certification_expiring' | 'timecard_unsubmitted' | 'document_expiring'
  | 'training_overdue' | 'review_due' | 'expense_submitted' | 'new_hire_created'
  | 'shift_published' | 'compensation_changed' | 'termination_processed';

export interface AutomationRule {
  id: ID;
  name: string;
  description: string;
  trigger: TriggerEvent;
  conditions: { field: string; operator: 'gt' | 'lt' | 'eq' | 'neq' | 'contains'; value: string }[];
  actions: {
    type: 'notify' | 'create_task' | 'flag' | 'email' | 'assign_training' | 'escalate';
    target: 'employee' | 'manager' | 'hr' | 'payroll' | 'department_head' | 'custom';
    targetId?: ID;
    template: string;
  }[];
  enabled: boolean;
  createdBy: ID;
  createdAt: ISODateTime;
  lastFiredAt: ISODateTime | null;
  fireCount: number;
}

export interface AutomationLogEntry {
  id: ID;
  ruleId: ID;
  ruleName: string;
  at: ISODateTime;
  subjectType: string;
  subjectId: ID;
  outcome: string;
  actionsTaken: string[];
}

/* ---------------------------------------------------------------- accounts */

export interface UserAccount {
  id: ID;
  employeeId: ID | null;
  email: string;
  displayName: string;
  roles: Role[];
  status: 'active' | 'locked' | 'invited' | 'disabled';
  mfaEnabled: boolean;
  mfaMethod: 'app' | 'sms' | 'email' | null;
  lastLoginAt: ISODateTime | null;
  passwordUpdatedAt: ISODate;
  failedAttempts: number;
  sessions: { id: ID; startedAt: ISODateTime; ip: string; device: string; current: boolean }[];
  permissionOverrides: string[];
}

export interface PermissionGroup {
  id: ID;
  name: string;
  description: string;
  permissions: string[];
  memberUserIds: ID[];
  system: boolean;
}

export interface Integration {
  id: ID;
  name: string;
  category: 'accounting' | 'banking' | 'tax' | 'benefits' | 'identity' | 'calendar'
    | 'email' | 'sms' | 'background_check' | 'job_board' | 'learning' | 'expense';
  vendor: string;
  status: 'connected' | 'available' | 'error' | 'disabled';
  connectedAt: ISODateTime | null;
  lastSyncAt: ISODateTime | null;
  syncFrequency: string;
  direction: 'inbound' | 'outbound' | 'bidirectional';
  description: string;
  scopes: string[];
  health: 'healthy' | 'degraded' | 'failing' | 'n/a';
}

/* ------------------------------------------------------------------- store */

export interface Database {
  meta: { version: number; seededAt: ISODateTime; today: ISODate };
  organization: Organization;
  locations: Location[];
  departments: Department[];
  jobTitles: JobTitle[];
  payGroups: PayGroup[];
  payPeriods: PayPeriod[];
  users: UserAccount[];
  employees: Employee[];
  employmentEvents: EmploymentEvent[];
  compensation: CompensationRecord[];
  dependents: Dependent[];
  directDeposits: DirectDeposit[];
  taxProfiles: TaxProfile[];
  punches: Punch[];
  timecards: Timecard[];
  punchCorrections: PunchCorrectionRequest[];
  shifts: Shift[];
  availability: Availability[];
  shiftSwaps: ShiftSwapRequest[];
  ptoPolicies: PtoPolicy[];
  ptoBalances: PtoBalance[];
  ptoRequests: PtoRequest[];
  holidays: Holiday[];
  blackouts: BlackoutPeriod[];
  payrollRuns: PayrollRun[];
  paychecks: Paycheck[];
  payrollIssues: PayrollIssue[];
  garnishments: Garnishment[];
  benefitPlans: BenefitPlan[];
  benefitEnrollments: BenefitEnrollment[];
  enrollmentWindows: EnrollmentWindow[];
  requisitions: Requisition[];
  candidates: Candidate[];
  applications: Application[];
  interviews: Interview[];
  offers: Offer[];
  onboardingTemplates: OnboardingTemplate[];
  onboardingPackets: OnboardingPacket[];
  onboardingTasks: OnboardingTask[];
  goals: Goal[];
  reviewCycles: ReviewCycle[];
  reviews: PerformanceReview[];
  peerFeedback: PeerFeedback[];
  courses: Course[];
  trainingAssignments: TrainingAssignment[];
  expenses: Expense[];
  expenseReports: ExpenseReport[];
  documents: EmployeeDocument[];
  signatureRequests: SignatureRequest[];
  notifications: AppNotification[];
  tasks: WorkTask[];
  auditLog: AuditEntry[];
  announcements: Announcement[];
  automationRules: AutomationRule[];
  automationLog: AutomationLogEntry[];
  permissionGroups: PermissionGroup[];
  integrations: Integration[];
}
