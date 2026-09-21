import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowRight, Briefcase, CalendarPlus, Check, FileText, Mail, MapPin, MessageSquarePlus,
  Plus, Star, ThumbsDown, ThumbsUp, UserPlus, Users, X,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Column, DataTable, EmptyState, Field,
  Input, KeyValue, Modal, PermissionDenied, SearchInput, SectionHeader, Select, StageStepper,
  StatTile, StatusBadge, Tabs, Textarea, Timeline, cx,
} from '@/components/ui';
import { BarChart } from '@/components/charts';
import { useApp, useLookups } from '@/lib/store';
import { usePeopleActions, useTalentActions } from '@/lib/actions';
import { recruitingFunnel } from '@/lib/selectors';
import { currency, num, phoneFmt } from '@/lib/format';
import { addDays, fmtDate, fmtDateShort, fmtDateTime, timeAgo } from '@/lib/dates';
import type { Application, CandidateStage, Requisition } from '@/lib/types';

const PIPELINE: { id: CandidateStage; label: string }[] = [
  { id: 'applied', label: 'Applied' },
  { id: 'screening', label: 'Screening' },
  { id: 'interview', label: 'Interview' },
  { id: 'final_interview', label: 'Final interview' },
  { id: 'offer', label: 'Offer' },
  { id: 'hired', label: 'Hired' },
];

export const RecruitingPage = () => {
  const { db, can } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'pipeline';
  const [detailId, setDetailId] = useState<string | null>(() => {
    const cand = params.get('candidate');
    return cand ? db.applications.find((a) => a.candidateId === cand)?.id ?? null : null;
  });

  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  if (!can('recruiting.view')) return <PermissionDenied what="recruiting" />;

  const openReqs = db.requisitions.filter((r) => r.status === 'open');
  const activeApps = db.applications.filter((a) => !['hired', 'rejected', 'withdrawn'].includes(a.stage));
  const interviews = db.interviews.filter((i) => i.status === 'scheduled');

  const tabs = [
    { id: 'pipeline', label: 'Pipeline', count: activeApps.length, icon: Users },
    { id: 'requisitions', label: 'Requisitions', count: openReqs.length, icon: Briefcase },
    { id: 'interviews', label: 'Interviews', count: interviews.length, icon: CalendarPlus },
    { id: 'offers', label: 'Offers', count: db.offers.filter((o) => !['accepted', 'declined', 'rescinded'].includes(o.status)).length, icon: FileText },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Recruiting"
        subtitle="From requisition to accepted offer. Hiring a candidate creates their employee record, onboarding packet and training assignments in one step."
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'pipeline' ? <Pipeline onOpen={setDetailId} /> : null}
      {tab === 'requisitions' ? <Requisitions /> : null}
      {tab === 'interviews' ? <Interviews onOpen={setDetailId} /> : null}
      {tab === 'offers' ? <Offers onOpen={setDetailId} /> : null}
      <CandidateDrawer applicationId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
};

/* ------------------------------------------------------------ pipeline */

const Pipeline = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const { db } = useApp();
  const { advanceApplication } = useTalentActions();
  const lookups = useLookups();
  const [query, setQuery] = useState('');
  const [reqFilter, setReqFilter] = useState('all');
  const [dragId, setDragId] = useState<string | null>(null);

  const apps = db.applications
    .filter((a) => (reqFilter === 'all' ? true : a.requisitionId === reqFilter))
    .filter((a) => {
      const c = lookups.candidate.get(a.candidateId);
      const q = query.trim().toLowerCase();
      return !q || !c || `${c.firstName} ${c.lastName} ${c.currentCompany} ${c.skills.join(' ')}`.toLowerCase().includes(q);
    });

  const funnel = recruitingFunnel(db);
  const timeToHire = useMemo(() => {
    const hired = db.applications.filter((a) => a.stage === 'hired');
    if (!hired.length) return 0;
    const total = hired.reduce((s, a) => {
      const start = new Date(a.appliedAt).getTime();
      const end = new Date(a.history.find((h) => h.stage === 'hired')?.at ?? a.stageChangedAt).getTime();
      return s + (end - start) / 86400000;
    }, 0);
    return Math.round(total / hired.length);
  }, [db.applications]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active candidates" value={num(apps.filter((a) => !['hired', 'rejected', 'withdrawn'].includes(a.stage)).length)} icon={Users} />
        <StatTile label="Open requisitions" value={num(db.requisitions.filter((r) => r.status === 'open').length)} icon={Briefcase} tone="teal"
          hint={`${db.requisitions.filter((r) => r.status === 'open').reduce((s, r) => s + r.openings - r.filled, 0)} openings`} />
        <StatTile label="Offers out" value={num(db.offers.filter((o) => o.status === 'sent').length)} icon={FileText} tone="accent" />
        <StatTile label="Median time to hire" value={`${timeToHire} days`} icon={ArrowRight} tone="brand" />
      </div>

      <Card>
        <CardHeader title="Funnel" subtitle="Candidates by stage across all open requisitions" icon={Users} />
        <BarChart
          categories={funnel.map((f) => f.label)}
          series={[{ key: 'count', label: 'Candidates', values: funnel.map((f) => f.value) }]}
          height={180} labelEvery={1}
        />
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search candidates, companies, skills…" className="min-w-[16rem] flex-1" />
        <Select value={reqFilter} onChange={(e) => setReqFilter(e.target.value)} className="w-auto">
          <option value="all">All requisitions</option>
          {db.requisitions.filter((r) => r.status === 'open' || r.status === 'filled').map((r) => (
            <option key={r.id} value={r.id}>{r.code} · {r.title}</option>
          ))}
        </Select>
      </div>

      <div className="scroll-x pb-2">
        <div className="flex min-w-max gap-3">
          {PIPELINE.map((stage) => {
            const cards = apps.filter((a) => a.stage === stage.id);
            return (
              <div
                key={stage.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) { advanceApplication(dragId, stage.id); setDragId(null); } }}
                className="w-[16.5rem] shrink-0 rounded-xl border border-line bg-sunken/50"
              >
                <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{stage.label}</p>
                  <Badge tone={stage.id === 'offer' ? 'brand' : stage.id === 'hired' ? 'success' : 'neutral'}>{cards.length}</Badge>
                </div>
                <ul className="max-h-[32rem] space-y-2 overflow-y-auto p-2">
                  {cards.length === 0 ? (
                    <li className="px-2 py-6 text-center text-xs text-faint">Drop a candidate here</li>
                  ) : cards.slice(0, 25).map((a) => {
                    const c = lookups.candidate.get(a.candidateId);
                    const req = lookups.requisition.get(a.requisitionId);
                    if (!c) return null;
                    return (
                      <li key={a.id}>
                        <button
                          draggable
                          onDragStart={() => setDragId(a.id)}
                          onClick={() => onOpen(a.id)}
                          className="w-full cursor-grab rounded-lg border border-line bg-surface p-2.5 text-left transition-shadow hover:shadow-raised active:cursor-grabbing"
                        >
                          <span className="flex items-start gap-2.5">
                            <Avatar first={c.firstName} last={c.lastName} seed={c.email} size={28} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{c.firstName} {c.lastName}</span>
                              <span className="block truncate text-2xs text-muted">{req?.title}</span>
                              <span className="mt-1 flex items-center gap-2">
                                <span className="flex items-center gap-0.5">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star key={i} className={cx('h-2.5 w-2.5', i < c.rating ? 'fill-accent-400 text-accent-400' : 'text-line-strong')} />
                                  ))}
                                </span>
                                <span className="text-2xs text-faint">{timeAgo(a.stageChangedAt)}</span>
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-faint">Drag a candidate card into another column to move them through the pipeline.</p>
    </div>
  );
};

/* -------------------------------------------------------- requisitions */

const Requisitions = () => {
  const { db, can } = useApp();
  const lookups = useLookups();
  const [detail, setDetail] = useState<Requisition | null>(null);

  const columns: Column<Requisition>[] = [
    {
      key: 'title', header: 'Requisition', sortValue: (r) => r.code,
      render: (r) => (
        <span>
          <span className="block text-sm font-medium">{r.title}</span>
          <span className="block text-xs text-muted">{r.code} · {lookups.department.get(r.departmentId)?.name}</span>
        </span>
      ),
    },
    { key: 'loc', header: 'Location', hideBelow: 'md', sortValue: (r) => lookups.location.get(r.locationId)?.code ?? '', render: (r) => <span className="text-sm">{lookups.location.get(r.locationId)?.name}</span> },
    {
      key: 'manager', header: 'Hiring manager', hideBelow: 'lg',
      render: (r) => {
        const m = lookups.employee.get(r.hiringManagerId);
        return m ? <span className="text-sm">{m.preferredName} {m.lastName}</span> : '—';
      },
    },
    { key: 'openings', header: 'Openings', align: 'center', sortValue: (r) => r.openings, render: (r) => <span className="tnum text-sm">{r.filled}/{r.openings}</span> },
    {
      key: 'candidates', header: 'Candidates', align: 'right', hideBelow: 'sm',
      sortValue: (r) => db.applications.filter((a) => a.requisitionId === r.id).length,
      render: (r) => num(db.applications.filter((a) => a.requisitionId === r.id).length),
    },
    { key: 'salary', header: 'Range', align: 'right', hideBelow: 'lg', render: (r) => <span className="text-sm">{currency(r.salaryMin, { compact: true, cents: false })}–{currency(r.salaryMax, { compact: true, cents: false })}</span> },
    { key: 'posted', header: 'Posted', hideBelow: 'lg', sortValue: (r) => r.postedDate ?? '', render: (r) => <span className="text-sm">{r.postedDate ? fmtDateShort(r.postedDate) : '—'}</span> },
    { key: 'status', header: 'Status', align: 'center', sortValue: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <>
      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <div>
            <h3 className="text-sm font-semibold">Requisitions</h3>
            <p className="text-xs text-muted">Approved openings drive job postings and the candidate pipeline.</p>
          </div>
          {can('recruiting.manage') ? <Button variant="primary" icon={Plus} disabled>New requisition</Button> : null}
        </div>
        <DataTable rows={db.requisitions} columns={columns} getRowId={(r) => r.id} pageSize={12}
          onRowClick={(r) => setDetail(r)} initialSort={{ key: 'status', dir: 'asc' }} />
      </Card>

      <Modal
        open={Boolean(detail)} onClose={() => setDetail(null)} size="lg" icon={Briefcase}
        title={detail?.title ?? ''} subtitle={detail ? `${detail.code} · ${lookups.department.get(detail.departmentId)?.name}` : ''}
      >
        {detail ? (
          <div className="space-y-5">
            <KeyValue columns={3} items={[
              { label: 'Status', value: <StatusBadge status={detail.status} /> },
              { label: 'Openings', value: `${detail.filled} of ${detail.openings} filled` },
              { label: 'Target start', value: fmtDate(detail.targetStartDate) },
              { label: 'Location', value: lookups.location.get(detail.locationId)?.name },
              { label: 'Hiring manager', value: (() => { const m = lookups.employee.get(detail.hiringManagerId); return m ? `${m.firstName} ${m.lastName}` : '—'; })() },
              { label: 'Recruiter', value: (() => { const m = lookups.employee.get(detail.recruiterId); return m ? `${m.firstName} ${m.lastName}` : '—'; })() },
              { label: 'Salary range', value: `${currency(detail.salaryMin, { cents: false })} – ${currency(detail.salaryMax, { cents: false })}` },
              { label: 'Employment type', value: detail.employmentType.replace(/_/g, ' ') },
              { label: 'Posted', value: detail.postedDate ? fmtDate(detail.postedDate) : 'Not posted' },
            ]} />
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Description</h4>
              <p className="text-sm leading-relaxed text-muted">{detail.description}</p>
            </div>
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Requirements</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                {detail.requirements.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Distribution</h4>
              <div className="flex flex-wrap gap-1.5">
                {detail.boards.map((b) => <Badge key={b} tone="neutral">{b}</Badge>)}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
};

/* ---------------------------------------------------------- interviews */

const Interviews = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const { db, employee } = useApp();
  const { submitInterviewFeedback } = useTalentActions();
  const lookups = useLookups();
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [form, setForm] = useState({ recommendation: 'yes' as const, rating: 4, strengths: '', concerns: '' });

  const rows = [...db.interviews].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const mine = rows.filter((i) => employee && i.interviewerIds.includes(employee.id));
  const awaitingMe = mine.filter((i) => i.status === 'completed' && !i.feedback.some((f) => f.interviewerId === employee?.id));

  return (
    <div className="space-y-5">
      {awaitingMe.length ? (
        <Alert tone="warning" title={`${awaitingMe.length} interview(s) awaiting your scorecard`}>
          Structured feedback is required within 24 hours so the panel can calibrate.
        </Alert>
      ) : null}

      <Card padded={false}>
        <div className="p-4 sm:p-5"><CardHeader title="Interview schedule" dense icon={CalendarPlus} /></div>
        {rows.length === 0 ? <EmptyState icon={CalendarPlus} title="No interviews scheduled" /> : (
          <ul className="divide-y divide-line">
            {rows.slice(0, 25).map((i) => {
              const app = db.applications.find((a) => a.id === i.applicationId);
              const cand = app ? lookups.candidate.get(app.candidateId) : null;
              const req = app ? lookups.requisition.get(app.requisitionId) : null;
              const needsMine = employee && i.interviewerIds.includes(employee.id)
                && i.status === 'completed' && !i.feedback.some((f) => f.interviewerId === employee.id);
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    {cand ? <Avatar first={cand.firstName} last={cand.lastName} seed={cand.email} size={32} /> : null}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{cand?.firstName} {cand?.lastName}</p>
                      <p className="text-xs text-muted">{i.round} · {req?.title}</p>
                      <p className="mt-0.5 text-2xs text-faint">
                        {fmtDateTime(i.scheduledAt)} · {i.durationMinutes} min · {i.mode}
                        {' · '}{i.interviewerIds.map((id) => lookups.employee.get(id)?.lastName).filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {i.feedback.length ? <Badge tone="success">{i.feedback.length} scorecard{i.feedback.length === 1 ? '' : 's'}</Badge> : null}
                    <StatusBadge status={i.status} />
                    {needsMine ? <Button size="xs" variant="primary" onClick={() => setFeedbackFor(i.id)}>Add scorecard</Button> : null}
                    {app ? <Button size="xs" onClick={() => onOpen(app.id)}>Candidate</Button> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(feedbackFor)} onClose={() => setFeedbackFor(null)} title="Interview scorecard" icon={MessageSquarePlus}
        footer={
          <>
            <Button onClick={() => setFeedbackFor(null)}>Cancel</Button>
            <Button variant="primary" disabled={!form.strengths}
              onClick={() => { if (feedbackFor) submitInterviewFeedback(feedbackFor, form); setFeedbackFor(null); }}>
              Submit feedback
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Recommendation" required>
            <Select value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value as typeof form.recommendation })}>
              <option value="strong_yes">Strong yes</option>
              <option value="yes">Yes</option>
              <option value="neutral">Neutral</option>
              <option value="no">No</option>
              <option value="strong_no">Strong no</option>
            </Select>
          </Field>
          <Field label={`Overall rating: ${form.rating} of 5`}>
            <input type="range" min={1} max={5} value={form.rating} className="w-full accent-[#5B3FD6]"
              onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} />
          </Field>
          <Field label="Strengths" required>
            <Textarea value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })}
              placeholder="Specific evidence from the conversation." />
          </Field>
          <Field label="Concerns">
            <Textarea value={form.concerns} onChange={(e) => setForm({ ...form, concerns: e.target.value })}
              placeholder="Gaps or risks worth probing in a later round." />
          </Field>
        </div>
      </Modal>
    </div>
  );
};

/* -------------------------------------------------------------- offers */

const Offers = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const { db, can } = useApp();
  const { setOfferStatus } = useTalentActions();
  const lookups = useLookups();

  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5"><CardHeader title="Offers" dense icon={FileText} subtitle="Approval, delivery and acceptance" /></div>
      {db.offers.length === 0 ? <EmptyState icon={FileText} title="No offers created" /> : (
        <ul className="divide-y divide-line">
          {db.offers.map((o) => {
            const cand = lookups.candidate.get(o.candidateId);
            const req = lookups.requisition.get(o.requisitionId);
            return (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  {cand ? <Avatar first={cand.firstName} last={cand.lastName} seed={cand.email} size={32} /> : null}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{cand?.firstName} {cand?.lastName}</p>
                    <p className="text-xs text-muted">{req?.title} · start {fmtDate(o.startDate)}</p>
                    <p className="mt-0.5 text-2xs text-faint">
                      {o.payType === 'salary' ? `${currency(o.baseSalary, { cents: false })} annual` : `${currency(o.hourlyRate)}/hour`}
                      {o.signingBonus ? ` · ${currency(o.signingBonus, { cents: false })} signing bonus` : ''}
                      {' · expires '}{fmtDateShort(o.expiresOn)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={o.status} />
                  {can('recruiting.offer.approve') && o.status === 'pending_approval' ? (
                    <Button size="xs" variant="primary" icon={Check} onClick={() => setOfferStatus(o.id, 'approved')}>Approve</Button>
                  ) : null}
                  {can('recruiting.manage') && o.status === 'approved' ? (
                    <Button size="xs" variant="primary" icon={Mail} onClick={() => setOfferStatus(o.id, 'sent')}>Send offer</Button>
                  ) : null}
                  {can('recruiting.manage') && o.status === 'sent' ? (
                    <Button size="xs" variant="primary" icon={Check} onClick={() => setOfferStatus(o.id, 'accepted')}>Mark accepted</Button>
                  ) : null}
                  <Button size="xs" onClick={() => onOpen(o.applicationId)}>Candidate</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

/* --------------------------------------------------- candidate drawer */

const CandidateDrawer = ({ applicationId, onClose }: { applicationId: string | null; onClose: () => void }) => {
  const { db, can, today } = useApp();
  const { advanceApplication, addApplicationNote, saveOffer, scheduleInterview } = useTalentActions();
  const { hireCandidate } = usePeopleActions();
  const lookups = useLookups();
  const [note, setNote] = useState('');
  const [hiring, setHiring] = useState(false);
  const [offering, setOffering] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const app = applicationId ? db.applications.find((a) => a.id === applicationId) : null;
  if (!app) return null;
  const cand = lookups.candidate.get(app.candidateId);
  const req = lookups.requisition.get(app.requisitionId);
  const interviews = db.interviews.filter((i) => i.applicationId === app.id);
  const offer = db.offers.find((o) => o.applicationId === app.id);
  if (!cand || !req) return null;

  const nextStage = PIPELINE[PIPELINE.findIndex((p) => p.id === app.stage) + 1];

  return (
    <>
      <Modal
        open onClose={onClose} size="lg" icon={Users}
        title={`${cand.firstName} ${cand.lastName}`}
        subtitle={`${req.code} · ${req.title}`}
        footer={
          <>
            {can('recruiting.manage') && app.stage !== 'hired' && app.stage !== 'rejected' ? (
              <Button variant="danger" icon={X} onClick={() => { advanceApplication(app.id, 'rejected', 'Not moving forward'); onClose(); }}>
                Reject
              </Button>
            ) : null}
            <div className="flex-1" />
            {app.stage === 'offer' && can('recruiting.hire') ? (
              <Button variant="primary" icon={UserPlus} onClick={() => setHiring(true)}>Hire &amp; create employee</Button>
            ) : app.stage === 'final_interview' && can('recruiting.offer.create') ? (
              <Button variant="primary" icon={FileText} onClick={() => setOffering(true)}>Create offer</Button>
            ) : nextStage && can('recruiting.manage') ? (
              <Button variant="primary" iconRight={ArrowRight} onClick={() => advanceApplication(app.id, nextStage.id)}>
                Move to {nextStage.label}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-5">
          <StageStepper stages={PIPELINE} current={app.stage === 'rejected' || app.stage === 'withdrawn' ? 'applied' : app.stage} />

          <div className="flex flex-wrap items-start gap-4">
            <Avatar first={cand.firstName} last={cand.lastName} seed={cand.email} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold">{cand.firstName} {cand.lastName}</p>
                <StatusBadge status={app.stage} />
                <span className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={cx('h-3 w-3', i < cand.rating ? 'fill-accent-400 text-accent-400' : 'text-line-strong')} />
                  ))}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{cand.currentTitle} at {cand.currentCompany}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-faint" />{cand.email}</span>
                <span className="flex items-center gap-1.5">{phoneFmt(cand.phone)}</span>
                <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-faint" />{cand.city}, {cand.state}</span>
              </div>
            </div>
          </div>

          <KeyValue columns={3} items={[
            { label: 'Source', value: cand.source },
            { label: 'Experience', value: `${cand.yearsExperience} years` },
            { label: 'Desired salary', value: currency(cand.desiredSalary, { cents: false }) },
            { label: 'Applied', value: fmtDate(app.appliedAt.slice(0, 10)) },
            { label: 'Days in pipeline', value: `${Math.max(0, Math.round((Date.now() - new Date(app.appliedAt).getTime()) / 86400000))}` },
            { label: 'Screening score', value: `${app.score}/100` },
          ]} />

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Skills</h4>
            <div className="flex flex-wrap gap-1.5">{cand.skills.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-sunken p-3">
            <FileText className="h-4 w-4 text-muted" />
            <span className="flex-1 text-sm">{cand.resumeFileName}</span>
            <Button size="xs">Preview</Button>
            {can('recruiting.manage') ? (
              <Button size="xs" icon={CalendarPlus} onClick={() => setScheduling(true)}>Schedule interview</Button>
            ) : null}
          </div>

          {interviews.length ? (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Interviews &amp; feedback</h4>
              <ul className="space-y-3">
                {interviews.map((i) => (
                  <li key={i.id} className="rounded-lg border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{i.round}</p>
                      <span className="text-xs text-muted">{fmtDateTime(i.scheduledAt)}</span>
                    </div>
                    {i.feedback.length === 0 ? (
                      <p className="mt-1 text-xs text-faint">Awaiting scorecards</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {i.feedback.map((f, fi) => {
                          const who = lookups.employee.get(f.interviewerId);
                          const yes = f.recommendation.includes('yes');
                          return (
                            <li key={fi} className="rounded-lg bg-sunken p-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                {yes ? <ThumbsUp className="h-3.5 w-3.5 text-success-600" /> : <ThumbsDown className="h-3.5 w-3.5 text-danger-500" />}
                                <span className="text-xs font-medium">{who?.preferredName} {who?.lastName}</span>
                                <Badge tone={yes ? 'success' : 'danger'} className="capitalize">{f.recommendation.replace(/_/g, ' ')}</Badge>
                                <span className="text-2xs text-faint">{f.rating}/5</span>
                              </div>
                              <p className="mt-1.5 text-xs text-muted"><strong className="text-ink">Strengths:</strong> {f.strengths}</p>
                              {f.concerns ? <p className="mt-0.5 text-xs text-muted"><strong className="text-ink">Concerns:</strong> {f.concerns}</p> : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {offer ? (
            <Alert tone="brand" icon={FileText} title={`Offer ${offer.status.replace(/_/g, ' ')}`}>
              {offer.payType === 'salary' ? currency(offer.baseSalary, { cents: false }) : `${currency(offer.hourlyRate)}/hour`}
              {offer.signingBonus ? ` · ${currency(offer.signingBonus, { cents: false })} signing bonus` : ''}
              {' · start '}{fmtDate(offer.startDate)} · expires {fmtDate(offer.expiresOn)}
            </Alert>
          ) : null}

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Notes</h4>
            {app.notes.length ? (
              <ul className="mb-3 space-y-2">
                {app.notes.map((n) => {
                  const who = lookups.employee.get(n.authorId);
                  return (
                    <li key={n.id} className="rounded-lg bg-sunken p-2.5">
                      <p className="text-xs text-muted">{n.body}</p>
                      <p className="mt-1 text-2xs text-faint">{who?.preferredName} {who?.lastName} · {timeAgo(n.at)}</p>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {can('recruiting.manage') ? (
              <div className="flex gap-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
                <Button disabled={!note} onClick={() => { addApplicationNote(app.id, note); setNote(''); }}>Add</Button>
              </div>
            ) : null}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Stage history</h4>
            <Timeline items={app.history.map((h, i) => ({
              id: String(i),
              title: h.stage.replace(/_/g, ' '),
              meta: fmtDate(h.at.slice(0, 10)),
              tone: h.stage === 'hired' ? 'success' : h.stage === 'rejected' ? 'danger' : 'brand',
            }))} />
          </div>
        </div>
      </Modal>

      <OfferModal open={offering} onClose={() => setOffering(false)} application={app}
        onSave={(payload) => { saveOffer(payload); advanceApplication(app.id, 'offer'); setOffering(false); }} />

      <ScheduleModal open={scheduling} onClose={() => setScheduling(false)} applicationId={app.id}
        departmentId={req.departmentId} onSchedule={(input) => { scheduleInterview(input); setScheduling(false); }} />

      <HireModal
        open={hiring} onClose={() => setHiring(false)} application={app}
        onHire={(overrides) => { hireCandidate(app.id, overrides); setHiring(false); onClose(); }}
        today={today}
      />
    </>
  );
};

/* ---------------------------------------------------------- sub-modals */

const OfferModal = ({
  open, onClose, application, onSave,
}: {
  open: boolean; onClose: () => void; application: Application;
  onSave: (o: { applicationId: string; candidateId: string; requisitionId: string; baseSalary: number; hourlyRate: number; payType: 'salary' | 'hourly'; signingBonus: number; startDate: string; expiresOn: string; status: 'pending_approval' }) => void;
}) => {
  const { db, today } = useApp();
  const lookups = useLookups();
  const req = lookups.requisition.get(application.requisitionId);
  const job = req ? db.jobTitles.find((j) => j.id === req.jobTitleId) : null;
  const hourly = job?.flsa === 'non_exempt';
  const [form, setForm] = useState({
    baseSalary: job ? Math.round((job.minSalary + job.maxSalary) / 2 / 500) * 500 : 0,
    hourlyRate: hourly && job ? Number(((job.minSalary + job.maxSalary) / 2).toFixed(2)) : 0,
    signingBonus: 0,
    startDate: addDays(today, 21),
    expiresOn: addDays(today, 7),
  });

  if (!req || !job) return null;
  const inBand = hourly
    ? form.hourlyRate >= job.minSalary && form.hourlyRate <= job.maxSalary
    : form.baseSalary >= job.minSalary && form.baseSalary <= job.maxSalary;

  return (
    <Modal
      open={open} onClose={onClose} title="Create offer" icon={FileText}
      subtitle={`${req.title} · ${job.level}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave({
            applicationId: application.id, candidateId: application.candidateId, requisitionId: req.id,
            baseSalary: hourly ? 0 : form.baseSalary, hourlyRate: hourly ? form.hourlyRate : 0,
            payType: hourly ? 'hourly' : 'salary', signingBonus: form.signingBonus,
            startDate: form.startDate, expiresOn: form.expiresOn, status: 'pending_approval',
          })}>
            Send for approval
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {hourly ? (
            <Field label="Hourly rate" required hint={`Band: ${currency(job.minSalary)} – ${currency(job.maxSalary)}`}>
              <Input type="number" step="0.25" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })} />
            </Field>
          ) : (
            <Field label="Annual base salary" required hint={`Band: ${currency(job.minSalary, { cents: false })} – ${currency(job.maxSalary, { cents: false })}`}>
              <Input type="number" step="500" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: Number(e.target.value) })} />
            </Field>
          )}
          <Field label="Signing bonus">
            <Input type="number" step="500" value={form.signingBonus} onChange={(e) => setForm({ ...form, signingBonus: Number(e.target.value) })} />
          </Field>
          <Field label="Start date" required>
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="Offer expires" required>
            <Input type="date" value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} />
          </Field>
        </div>
        {!inBand ? (
          <Alert tone="warning" title="Outside the approved salary band">
            This offer needs executive approval before it can be sent.
          </Alert>
        ) : (
          <Alert tone="success" icon={Check} title="Within band">
            The offer sits inside the approved range for {job.name}.
          </Alert>
        )}
      </div>
    </Modal>
  );
};

const ScheduleModal = ({
  open, onClose, applicationId, departmentId, onSchedule,
}: {
  open: boolean; onClose: () => void; applicationId: string; departmentId: string;
  onSchedule: (i: { applicationId: string; round: string; scheduledAt: string; durationMinutes: number; interviewerIds: string[]; mode: 'onsite' | 'video' | 'phone' }) => void;
}) => {
  const { db, today } = useApp();
  const panel = db.employees.filter((e) => e.departmentId === departmentId && e.status === 'active').slice(0, 12);
  const [form, setForm] = useState({
    round: 'Hiring manager interview',
    date: addDays(today, 3),
    time: '10:00',
    durationMinutes: 60,
    mode: 'video' as 'onsite' | 'video' | 'phone',
    interviewerIds: [] as string[],
  });

  return (
    <Modal
      open={open} onClose={onClose} title="Schedule interview" icon={CalendarPlus}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!form.interviewerIds.length}
            onClick={() => onSchedule({
              applicationId, round: form.round,
              scheduledAt: new Date(`${form.date}T${form.time}:00`).toISOString(),
              durationMinutes: form.durationMinutes, interviewerIds: form.interviewerIds, mode: form.mode,
            })}>
            Schedule and notify
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Round">
          <Select value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })}>
            {['Recruiter screen', 'Hiring manager interview', 'Panel interview', 'Executive interview'].map((r) => <option key={r}>{r}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Time"><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
          <Field label="Duration (min)">
            <Select value={String(form.durationMinutes)} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}>
              {[30, 45, 60, 90].map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Mode">
          <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as typeof form.mode })}>
            <option value="video">Video</option><option value="phone">Phone</option><option value="onsite">Onsite</option>
          </Select>
        </Field>
        <Field label="Interviewers" required hint="Each interviewer receives a calendar invite and a scorecard task.">
          <ul className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
            {panel.map((e) => {
              const on = form.interviewerIds.includes(e.id);
              return (
                <li key={e.id}>
                  <button
                    onClick={() => setForm({
                      ...form,
                      interviewerIds: on ? form.interviewerIds.filter((x) => x !== e.id) : [...form.interviewerIds, e.id],
                    })}
                    className={cx('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                      on ? 'bg-brand-50 text-brand-800' : 'hover:bg-sunken')}
                  >
                    <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={24} />
                    <span className="flex-1 truncate text-sm">{e.preferredName} {e.lastName}</span>
                    {on ? <Check className="h-3.5 w-3.5" /> : null}
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

const HireModal = ({
  open, onClose, application, onHire, today,
}: {
  open: boolean; onClose: () => void; application: Application;
  onHire: (o: { startDate: string; managerId: string; locationId: string; payGroupId: string }) => void;
  today: string;
}) => {
  const { db } = useApp();
  const lookups = useLookups();
  const req = lookups.requisition.get(application.requisitionId);
  const cand = lookups.candidate.get(application.candidateId);
  const offer = db.offers.find((o) => o.applicationId === application.id);
  const [form, setForm] = useState({
    startDate: offer?.startDate ?? addDays(today, 14),
    managerId: req?.hiringManagerId ?? '',
    locationId: req?.locationId ?? 'loc_den',
    payGroupId: 'pg_corp',
  });

  if (!req || !cand) return null;
  const managers = db.employees.filter((e) => e.status === 'active' && db.employees.some((x) => x.managerId === e.id));

  return (
    <Modal
      open={open} onClose={onClose} title="Hire candidate" icon={UserPlus} size="lg"
      subtitle={`${cand.firstName} ${cand.lastName} · ${req.title}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={UserPlus} onClick={() => onHire(form)}>Create employee record</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Alert tone="brand" icon={UserPlus} title="This single action creates everything downstream">
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>A full employee record with number, work email and compensation history</li>
            <li>A user account, invited but not yet activated</li>
            <li>An onboarding packet built from the matching template, with tasks for the employee, manager, IT, HR and payroll</li>
            <li>Required compliance training assigned with a 30-day due date</li>
            <li>A tax profile and pay group assignment ready for the first payroll run</li>
          </ul>
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" required>
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="Reports to" required>
            <Select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.preferredName} {m.lastName} — {lookups.jobTitle.get(m.jobTitleId)?.name}</option>)}
            </Select>
          </Field>
          <Field label="Work location" required>
            <Select value={form.locationId} onChange={(e) => setForm({
              ...form,
              locationId: e.target.value,
              payGroupId: ['loc_phx', 'loc_cmh', 'loc_sac'].includes(e.target.value) ? 'pg_field' : 'pg_corp',
            })}>
              {db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Pay group" required hint="Determines pay frequency and check dates.">
            <Select value={form.payGroupId} onChange={(e) => setForm({ ...form, payGroupId: e.target.value })}>
              {db.payGroups.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        </div>

        {offer ? (
          <KeyValue columns={3} items={[
            { label: 'Compensation', value: offer.payType === 'salary' ? currency(offer.baseSalary, { cents: false }) : `${currency(offer.hourlyRate)}/hr` },
            { label: 'Signing bonus', value: offer.signingBonus ? currency(offer.signingBonus, { cents: false }) : 'None' },
            { label: 'Job title', value: lookups.jobTitle.get(req.jobTitleId)?.name },
          ]} />
        ) : (
          <Alert tone="warning" title="No approved offer on file">
            The employee record will use the bottom of the salary band. Create an offer first for accurate compensation.
          </Alert>
        )}
      </div>
    </Modal>
  );
};
