import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award, Check, MessageSquare, Plus, Target, TrendingUp, Users,
} from 'lucide-react';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Column, DataTable, EmptyState, Field,
  Input, KeyValue, Modal, PermissionDenied, Progress, SectionHeader, Select, StageStepper,
  StatTile, StatusBadge, Tabs, Textarea,
} from '@/components/ui';
import { BarChart, HeatGrid } from '@/components/charts';
import { useApp, useLookups } from '@/lib/store';
import { useTalentActions } from '@/lib/actions';
import { goalsFor } from '@/lib/selectors';
import { num, percent } from '@/lib/format';
import { fmtDate, timeAgo } from '@/lib/dates';
import type { Goal, PerformanceReview } from '@/lib/types';

const REVIEW_STAGES = [
  { id: 'draft', label: 'Draft' },
  { id: 'self_review', label: 'Self review' },
  { id: 'manager_review', label: 'Manager review' },
  { id: 'calibration', label: 'Calibration' },
  { id: 'final_review', label: 'Final review' },
  { id: 'acknowledged', label: 'Acknowledged' },
];

export const PerformancePage = () => {
  const { db, can, employee, visibleIds } = useApp();
  const [tab, setTab] = useState('mine');

  if (!can('performance.view.self', 'performance.view.team', 'performance.view.all')) {
    return <PermissionDenied what="performance" />;
  }

  const scope = visibleIds('performance');
  const teamReviews = db.reviews.filter(
    (r) => r.managerId === employee?.id && r.cycleId.includes(String(new Date().getFullYear())) && r.stage === 'manager_review',
  );

  const tabs = [
    { id: 'mine', label: 'My review', icon: Award },
    { id: 'goals', label: 'Goals', icon: Target },
    ...(can('performance.view.team', 'performance.view.all') ? [
      { id: 'team', label: 'My team', count: teamReviews.length, icon: Users },
    ] : []),
    ...(can('performance.manage') ? [
      { id: 'cycles', label: 'Cycles', icon: TrendingUp },
      { id: 'calibration', label: 'Calibration', icon: Users },
    ] : []),
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Performance"
        subtitle="Goals, reviews and calibration on one timeline. Final ratings feed merit planning."
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'mine' ? <MyReview /> : null}
      {tab === 'goals' ? <GoalsTab scope={scope} /> : null}
      {tab === 'team' ? <TeamReviews /> : null}
      {tab === 'cycles' ? <Cycles /> : null}
      {tab === 'calibration' ? <Calibration /> : null}
    </div>
  );
};

/* ----------------------------------------------------------- my review */

const MyReview = () => {
  const { db, employee } = useApp();
  const { advanceReview } = useTalentActions();
  const lookups = useLookups();
  const [selfForm, setSelfForm] = useState({ rating: 4, comments: '' });
  if (!employee) return null;

  const cycles = [...db.reviewCycles].sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const active = cycles.find((c) => c.status === 'active');
  const review = db.reviews.find((r) => r.employeeId === employee.id && r.cycleId === active?.id);
  const history = db.reviews.filter((r) => r.employeeId === employee.id && r.cycleId !== active?.id);
  const manager = lookups.employee.get(employee.managerId ?? '');
  const feedback = review ? db.peerFeedback.filter((f) => review.peerFeedbackIds.includes(f.id)) : [];

  if (!review || !active) {
    return <Card><EmptyState icon={Award} title="No active review" body="You will be notified when the next review cycle opens." /></Card>;
  }

  const needsSelf = review.stage === 'draft' || review.stage === 'self_review';
  const canAcknowledge = review.stage === 'final_review';

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={active.name}
          subtitle={`${fmtDate(active.periodStart)} – ${fmtDate(active.periodEnd)} · self review due ${fmtDate(active.selfReviewDue)}`}
          icon={Award}
          actions={<StatusBadge status={review.stage} />}
        />
        <StageStepper stages={REVIEW_STAGES} current={review.stage} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {needsSelf ? (
            <Card>
              <CardHeader title="Your self review" icon={MessageSquare}
                subtitle="Your manager sees this before writing their assessment." />
              <div className="space-y-4">
                <Field label={`Overall self rating: ${selfForm.rating} — ${active.ratingScale.find((s) => s.value === selfForm.rating)?.label ?? ''}`}>
                  <input type="range" min={1} max={active.ratingScale.length} value={selfForm.rating}
                    onChange={(e) => setSelfForm({ ...selfForm, rating: Number(e.target.value) })}
                    className="w-full accent-[#5B3FD6]" />
                </Field>
                <Field label="What went well, and what would you do differently?" required>
                  <Textarea rows={5} value={selfForm.comments} onChange={(e) => setSelfForm({ ...selfForm, comments: e.target.value })}
                    placeholder="Point to specific outcomes, not activity." />
                </Field>
                <div className="flex justify-end">
                  <Button variant="primary" disabled={!selfForm.comments}
                    onClick={() => advanceReview(review.id, {
                      stage: 'manager_review', selfRating: selfForm.rating,
                      selfComments: selfForm.comments, submittedSelfAt: new Date().toISOString(),
                    })}>
                    Submit self review
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Your self review" icon={MessageSquare} actions={<Badge tone="success">Submitted</Badge>} />
              <KeyValue items={[
                { label: 'Self rating', value: review.selfRating ?? '—' },
                { label: 'Submitted', value: review.submittedSelfAt ? fmtDate(review.submittedSelfAt.slice(0, 10)) : '—' },
              ]} />
              <p className="mt-3 rounded-lg bg-sunken p-3 text-sm leading-relaxed text-muted">{review.selfComments}</p>
            </Card>
          )}

          {review.managerComments ? (
            <Card>
              <CardHeader title="Manager assessment" icon={Award}
                subtitle={manager ? `${manager.firstName} ${manager.lastName}` : ''} />
              <KeyValue items={[
                { label: 'Manager rating', value: review.managerRating ?? '—' },
                { label: 'Final rating', value: review.finalRating ?? 'Pending calibration' },
              ]} />
              <div className="mt-3 space-y-3">
                <div><p className="text-2xs font-semibold uppercase tracking-wide text-faint">Overall</p><p className="mt-1 text-sm leading-relaxed text-muted">{review.managerComments}</p></div>
                {review.strengths ? <div><p className="text-2xs font-semibold uppercase tracking-wide text-faint">Strengths</p><p className="mt-1 text-sm leading-relaxed text-muted">{review.strengths}</p></div> : null}
                {review.opportunities ? <div><p className="text-2xs font-semibold uppercase tracking-wide text-faint">Opportunities</p><p className="mt-1 text-sm leading-relaxed text-muted">{review.opportunities}</p></div> : null}
              </div>
              {canAcknowledge ? (
                <div className="mt-4 flex justify-end">
                  <Button variant="primary" icon={Check}
                    onClick={() => advanceReview(review.id, { stage: 'acknowledged', acknowledgedAt: new Date().toISOString() })}>
                    Acknowledge review
                  </Button>
                </div>
              ) : review.acknowledgedAt ? (
                <Alert className="mt-4" tone="success" icon={Check} title="Acknowledged">
                  You acknowledged this review on {fmtDate(review.acknowledgedAt.slice(0, 10))}.
                </Alert>
              ) : null}
            </Card>
          ) : (
            <Card>
              <EmptyState compact icon={Award} title="Manager assessment pending"
                body={`${manager?.preferredName ?? 'Your manager'} writes their assessment after your self review is submitted.`} />
            </Card>
          )}

          {feedback.length ? (
            <Card>
              <CardHeader title="Peer feedback" icon={Users} subtitle={`${feedback.length} colleague(s) contributed`} />
              <ul className="space-y-3">
                {feedback.map((f) => {
                  const author = f.anonymous ? null : lookups.employee.get(f.authorId);
                  return (
                    <li key={f.id} className="rounded-lg border border-line p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral" className="capitalize">{f.relationship.replace(/_/g, ' ')}</Badge>
                        <span className="text-xs text-muted">{author ? `${author.preferredName} ${author.lastName}` : 'Anonymous'}</span>
                        <span className="text-2xs text-faint">{timeAgo(f.submittedAt)}</span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted"><strong className="text-ink">Strengths:</strong> {f.strengths}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted"><strong className="text-ink">Opportunities:</strong> {f.opportunities}</p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Competencies" dense />
            <ul className="space-y-3">
              {review.competencyRatings.map((c) => (
                <li key={c.competency}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs">{c.competency}</span>
                    <span className="tnum text-xs text-muted">{c.self ?? '—'} / {c.manager ?? '—'}</span>
                  </div>
                  <Progress className="mt-1" size="sm" value={((c.manager ?? c.self ?? 0) / 5) * 100} tone="brand" />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-2xs text-faint">Self rating / manager rating on a 5-point scale.</p>
          </Card>

          <Card>
            <CardHeader title="Review history" dense icon={TrendingUp} />
            {history.length === 0 ? <p className="text-xs text-muted">No prior reviews on file.</p> : (
              <ul className="space-y-2.5">
                {history.map((r) => {
                  const c = db.reviewCycles.find((x) => x.id === r.cycleId);
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{c?.name}</p>
                        {r.merit ? <p className="text-2xs text-success-700">Merit +{r.merit.increasePercent}%</p> : null}
                      </div>
                      <Badge tone={(r.finalRating ?? 0) >= 4 ? 'success' : (r.finalRating ?? 0) >= 3 ? 'brand' : 'warning'}>
                        {r.finalRating ?? '—'}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

/* --------------------------------------------------------------- goals */

const GoalsTab = ({ scope }: { scope: Set<string> }) => {
  const { db, employee, can, today } = useApp();
  const { updateGoal, createGoal } = useTalentActions();
  const lookups = useLookups();
  const [view, setView] = useState<'mine' | 'team'>('mine');
  const [updating, setUpdating] = useState<Goal | null>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);

  const goals = view === 'mine'
    ? goalsFor(db, employee?.id ?? '')
    : db.goals.filter((g) => scope.has(g.employeeId) && g.employeeId !== employee?.id);

  const stats = {
    onTrack: goals.filter((g) => g.status === 'on_track' || g.status === 'completed').length,
    atRisk: goals.filter((g) => g.status === 'at_risk').length,
    behind: goals.filter((g) => g.status === 'behind').length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button variant={view === 'mine' ? 'primary' : 'secondary'} onClick={() => setView('mine')}>My goals</Button>
          {can('performance.view.team', 'performance.view.all') ? (
            <Button variant={view === 'team' ? 'primary' : 'secondary'} onClick={() => setView('team')}>Team goals</Button>
          ) : null}
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New goal</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="On track or complete" value={num(stats.onTrack)} icon={Check} tone="success" />
        <StatTile label="At risk" value={num(stats.atRisk)} icon={Target} tone="warning" />
        <StatTile label="Behind" value={num(stats.behind)} icon={Target} tone="danger" />
      </div>

      {goals.length === 0 ? (
        <Card><EmptyState icon={Target} title="No goals yet" body="Set a goal with a measurable target and a due date." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => {
            const owner = lookups.employee.get(g.employeeId);
            const pct = g.target ? (g.current / g.target) * 100 : 0;
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{g.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{g.description}</p>
                  </div>
                  <StatusBadge status={g.status} />
                </div>
                {view === 'team' && owner ? (
                  <div className="mt-2 flex items-center gap-2">
                    <Avatar first={owner.firstName} last={owner.lastName} seed={owner.avatarSeed} size={20} />
                    <span className="text-xs text-muted">{owner.preferredName} {owner.lastName}</span>
                  </div>
                ) : null}
                <Progress className="mt-3" value={pct} showValue size="lg"
                  tone={g.status === 'completed' ? 'success' : g.status === 'behind' ? 'danger' : g.status === 'at_risk' ? 'warning' : 'brand'} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-2xs text-faint">
                  <span>{num(g.current, 1)} of {num(g.target, 1)} {g.unit} · weight {g.weight}%</span>
                  <span>Due {fmtDate(g.dueDate)}</span>
                </div>
                {g.updates.length ? (
                  <p className="mt-2 border-t border-line pt-2 text-2xs text-muted">
                    Last update {timeAgo(g.updates[g.updates.length - 1].at)}: {g.updates[g.updates.length - 1].note}
                  </p>
                ) : null}
                {(view === 'mine' || can('performance.manage')) && g.status !== 'completed' ? (
                  <Button className="mt-3" size="sm" block onClick={() => { setUpdating(g); setValue(String(g.current)); }}>
                    Update progress
                  </Button>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(updating)} onClose={() => setUpdating(null)} title="Update goal progress" icon={Target}
        subtitle={updating?.title}
        footer={
          <>
            <Button onClick={() => setUpdating(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => { if (updating) updateGoal(updating.id, Number(value), note); setUpdating(null); setNote(''); }}>
              Save update
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={`Current value (${updating?.unit ?? ''})`} required hint={`Target: ${updating ? num(updating.target, 1) : ''} ${updating?.unit ?? ''}`}>
            <Input type="number" step="0.1" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="What changed?">
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Closed three of the five outstanding defects this sprint." />
          </Field>
        </div>
      </Modal>

      <NewGoalModal open={creating} onClose={() => setCreating(false)}
        onCreate={(g) => { createGoal(g); setCreating(false); }} today={today} />
    </div>
  );
};

const NewGoalModal = ({
  open, onClose, onCreate, today,
}: { open: boolean; onClose: () => void; onCreate: (g: Omit<Goal, 'id' | 'updates'>) => void; today: string }) => {
  const { employee } = useApp();
  const [form, setForm] = useState({
    title: '', description: '', metric: '', target: 100, unit: '%', weight: 25,
    category: 'business' as Goal['category'], dueDate: `${today.slice(0, 4)}-12-31`,
  });
  if (!employee) return null;

  return (
    <Modal
      open={open} onClose={onClose} title="Create a goal" icon={Target}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!form.title || !form.metric}
            onClick={() => onCreate({
              employeeId: employee.id, title: form.title, description: form.description,
              category: form.category, metric: form.metric, target: form.target, current: 0,
              unit: form.unit, startDate: today, dueDate: form.dueDate, status: 'not_started',
              weight: form.weight, alignedToId: null, createdBy: employee.id,
            })}>
            Create goal
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Goal" required>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Raise first-visit resolution to 90%" />
        </Field>
        <Field label="Why it matters">
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Metric" required>
            <Input value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} placeholder="First-visit resolution rate" />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Goal['category'] })}>
              <option value="business">Business</option><option value="okr">OKR</option>
              <option value="development">Development</option><option value="team">Team</option>
            </Select>
          </Field>
          <Field label="Target"><Input type="number" value={form.target} onChange={(e) => setForm({ ...form, target: Number(e.target.value) })} /></Field>
          <Field label="Unit"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
          <Field label="Weight (%)"><Input type="number" min={0} max={100} value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} /></Field>
          <Field label="Due date"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
};

/* --------------------------------------------------------- team review */

const TeamReviews = () => {
  const { db, employee } = useApp();
  const { advanceReview } = useTalentActions();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [writing, setWriting] = useState<PerformanceReview | null>(null);
  const [form, setForm] = useState({ rating: 3, comments: '', strengths: '', opportunities: '' });

  const active = db.reviewCycles.find((c) => c.status === 'active');
  const reviews = db.reviews.filter((r) => r.managerId === employee?.id && r.cycleId === active?.id);

  const columns: Column<PerformanceReview>[] = [
    {
      key: 'employee', header: 'Employee', sortValue: (r) => lookups.employee.get(r.employeeId)?.lastName ?? '',
      render: (r) => {
        const e = lookups.employee.get(r.employeeId);
        return e ? (
          <button className="flex items-center gap-2.5 text-left" onClick={() => navigate(`/people/${e.id}`)}>
            <Avatar first={e.firstName} last={e.lastName} seed={e.avatarSeed} size={28} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{e.preferredName} {e.lastName}</span>
              <span className="block truncate text-xs text-muted">{lookups.jobTitle.get(e.jobTitleId)?.name}</span>
            </span>
          </button>
        ) : '—';
      },
    },
    { key: 'stage', header: 'Stage', align: 'center', sortValue: (r) => r.stage, render: (r) => <StatusBadge status={r.stage} /> },
    { key: 'self', header: 'Self', align: 'center', sortValue: (r) => r.selfRating ?? 0, render: (r) => r.selfRating ?? '—' },
    { key: 'mgr', header: 'Manager', align: 'center', sortValue: (r) => r.managerRating ?? 0, render: (r) => r.managerRating ?? '—' },
    {
      key: 'goals', header: 'Goals on track', align: 'right', hideBelow: 'md',
      render: (r) => {
        const gs = db.goals.filter((g) => g.employeeId === r.employeeId);
        const ok = gs.filter((g) => g.status === 'on_track' || g.status === 'completed').length;
        return <span className="text-sm">{ok}/{gs.length}</span>;
      },
    },
    {
      key: 'action', header: '', align: 'right',
      render: (r) => r.stage === 'manager_review'
        ? <Button size="xs" variant="primary" onClick={() => { setWriting(r); setForm({ rating: r.selfRating ?? 3, comments: '', strengths: '', opportunities: '' }); }}>Write review</Button>
        : r.stage === 'calibration'
          ? <Button size="xs" onClick={() => advanceReview(r.id, { stage: 'final_review', finalRating: r.managerRating })}>Release</Button>
          : null,
    },
  ];

  if (!active) return <Card><EmptyState icon={Award} title="No active review cycle" /></Card>;

  return (
    <div className="space-y-4">
      <Alert tone="info" title={`${active.name} · manager reviews due ${fmtDate(active.managerReviewDue)}`}>
        Employees submit a self review first; your assessment goes to calibration before the final rating is released.
      </Alert>

      <Card padded={false}>
        <DataTable rows={reviews} columns={columns} getRowId={(r) => r.id} pageSize={12}
          empty={<EmptyState icon={Users} title="No reviews assigned to you" />} />
      </Card>

      <Modal
        open={Boolean(writing)} onClose={() => setWriting(null)} size="lg" icon={Award}
        title="Manager review"
        subtitle={writing ? (() => { const e = lookups.employee.get(writing.employeeId); return e ? `${e.firstName} ${e.lastName}` : ''; })() : ''}
        footer={
          <>
            <Button onClick={() => setWriting(null)}>Cancel</Button>
            <Button variant="primary" disabled={!form.comments}
              onClick={() => {
                if (writing) advanceReview(writing.id, {
                  stage: 'calibration', managerRating: form.rating, managerComments: form.comments,
                  strengths: form.strengths, opportunities: form.opportunities,
                  submittedManagerAt: new Date().toISOString(),
                });
                setWriting(null);
              }}>
              Submit for calibration
            </Button>
          </>
        }
      >
        {writing ? (
          <div className="space-y-4">
            {writing.selfComments ? (
              <div className="well p-3">
                <p className="text-2xs font-semibold uppercase tracking-wide text-faint">Employee self review · rated {writing.selfRating}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{writing.selfComments}</p>
              </div>
            ) : null}
            <Field label={`Overall rating: ${form.rating} — ${active.ratingScale.find((s) => s.value === form.rating)?.label ?? ''}`}>
              <input type="range" min={1} max={active.ratingScale.length} value={form.rating}
                onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} className="w-full accent-[#5B3FD6]" />
            </Field>
            <Field label="Overall assessment" required>
              <Textarea rows={4} value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} />
            </Field>
            <Field label="Strengths"><Textarea rows={2} value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} /></Field>
            <Field label="Opportunities"><Textarea rows={2} value={form.opportunities} onChange={(e) => setForm({ ...form, opportunities: e.target.value })} /></Field>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

/* -------------------------------------------------------------- cycles */

const Cycles = () => {
  const { db } = useApp();
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {db.reviewCycles.map((c) => {
        const reviews = db.reviews.filter((r) => r.cycleId === c.id);
        const done = reviews.filter((r) => r.stage === 'acknowledged').length;
        return (
          <Card key={c.id}>
            <CardHeader title={c.name} dense subtitle={`${fmtDate(c.periodStart)} – ${fmtDate(c.periodEnd)}`}
              actions={<StatusBadge status={c.status} />} />
            <Progress value={reviews.length ? (done / reviews.length) * 100 : 0} showValue size="lg"
              tone={c.status === 'closed' ? 'success' : 'brand'} />
            <p className="mt-1.5 text-2xs text-faint">{done} of {reviews.length} acknowledged</p>
            <KeyValue className="mt-3" columns={1} items={[
              { label: 'Self review due', value: fmtDate(c.selfReviewDue) },
              { label: 'Manager review due', value: fmtDate(c.managerReviewDue) },
              { label: 'Final due', value: fmtDate(c.finalDue) },
              { label: 'Competencies', value: `${c.competencies.length} rated` },
              { label: 'Rating scale', value: `1–${c.ratingScale.length}` },
            ]} />
          </Card>
        );
      })}
    </div>
  );
};

/* --------------------------------------------------------- calibration */

const Calibration = () => {
  const { db } = useApp();
  const lookups = useLookups();
  const active = db.reviewCycles.find((c) => c.status === 'active');
  const reviews = db.reviews.filter((r) => r.cycleId === active?.id && r.managerRating !== null);

  const distribution = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: reviews.filter((r) => r.managerRating === rating).length,
  }));

  const departments = [...new Set(reviews.map((r) => lookups.employee.get(r.employeeId)?.departmentId).filter(Boolean))] as string[];
  const grid = departments.map((d) =>
    [1, 2, 3, 4, 5].map((rating) =>
      reviews.filter((r) => lookups.employee.get(r.employeeId)?.departmentId === d && r.managerRating === rating).length));

  if (!active) return <Card><EmptyState icon={Users} title="No active cycle to calibrate" /></Card>;

  return (
    <div className="space-y-5">
      <Alert tone="info" title="Calibration keeps ratings comparable across teams">
        Compare the distribution before releasing final ratings. A healthy curve avoids both grade inflation
        and one manager rating consistently lower than their peers.
      </Alert>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Rating distribution" icon={TrendingUp} subtitle={`${reviews.length} manager ratings submitted`} />
          <BarChart
            categories={distribution.map((d) => `${d.rating} — ${active.ratingScale.find((s) => s.value === d.rating)?.label ?? ''}`)}
            series={[{ key: 'count', label: 'Employees', values: distribution.map((d) => d.count) }]}
            height={220} labelEvery={1}
          />
          <ul className="mt-3 space-y-1.5">
            {distribution.map((d) => (
              <li key={d.rating} className="flex items-center justify-between text-xs">
                <span className="text-muted">{active.ratingScale.find((s) => s.value === d.rating)?.label}</span>
                <span className="tnum">{d.count} · {percent(reviews.length ? (d.count / reviews.length) * 100 : 0, 0)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Ratings by department" icon={Users} subtitle="Counts per rating band" />
          <HeatGrid
            rows={departments.map((d) => lookups.department.get(d)?.name ?? d)}
            columns={['1', '2', '3', '4', '5']}
            values={grid}
          />
        </Card>
      </div>
    </div>
  );
};
