import type { Db } from '../db/connection.ts';
import type { EvidenceRow, TenantDb } from '../db/tenant.ts';
import { getControl, getProfile } from './config-loader.ts';
import type { Control, ProfileDefinition, ProfileItem, Requirement, StatusOrUnknown } from './types.ts';

const POINTS: Record<StatusOrUnknown, number> = { pass: 1, partial: 0.5, fail: 0, unknown: 0 };

/** Score at or above which a client is presentable to an underwriter. */
export const READY_THRESHOLD = 85;

const REQUIREMENT_RANK: Record<Requirement, number> = { mandatory: 0, recommended: 1, optional: 2 };

export type AssessedControl = {
  controlKey: string;
  title: string;
  category: string;
  question: string;
  requirement: Requirement;
  weight: number;
  profileNote: string | null;
  status: StatusOrUnknown;
  answerLabel: string | null;
  gapExplanation: string | null;
  remediation: string | null;
  note: string | null;
  recordedAt: string | null;
  recordedBy: string | null;
  source: string | null;
  /** Share of the total score this control is currently forfeiting. */
  impact: number;
};

export type ReadinessState = 'ready' | 'conditional' | 'not_ready';

export type Assessment = {
  profile: { key: string; name: string; publisher: string; version: string; description: string };
  score: number;
  state: ReadinessState;
  stateHeadline: string;
  stateExplanation: string;
  counts: Record<StatusOrUnknown, number>;
  coverage: { answered: number; total: number };
  controls: AssessedControl[];
  /** Non-passing controls, most damaging first. */
  gaps: AssessedControl[];
};

export function assessClient(
  db: Db,
  tenant: TenantDb,
  clientId: string,
  profileKey: string,
): Assessment {
  const profile = getProfile(db, profileKey);
  if (!profile) throw new Error(`Unknown requirement profile "${profileKey}".`);

  const evidence = tenant.currentEvidence(clientId);
  const totalWeight = profile.items.reduce((sum, item) => sum + item.weight, 0);

  const controls = profile.items.map((item) =>
    assessOne(db, item, evidence.get(item.control), totalWeight),
  );

  const earned = controls.reduce(
    (sum, assessed) => sum + weightOf(profile, assessed.controlKey) * POINTS[assessed.status],
    0,
  );
  const score = Math.round((earned / totalWeight) * 100);

  const counts: Record<StatusOrUnknown, number> = { pass: 0, partial: 0, fail: 0, unknown: 0 };
  for (const assessed of controls) counts[assessed.status] += 1;

  const gaps = controls
    .filter((assessed) => assessed.status !== 'pass')
    .sort(
      (a, b) =>
        REQUIREMENT_RANK[a.requirement] - REQUIREMENT_RANK[b.requirement] ||
        b.impact - a.impact ||
        b.weight - a.weight,
    );

  const { state, stateHeadline, stateExplanation } = describeState(profile, controls, score);

  return {
    profile: {
      key: profile.key,
      name: profile.name,
      publisher: profile.publisher,
      version: profile.version,
      description: profile.description,
    },
    score,
    state,
    stateHeadline,
    stateExplanation,
    counts,
    coverage: {
      answered: controls.filter((c) => c.status !== 'unknown').length,
      total: controls.length,
    },
    controls,
    gaps,
  };
}

function weightOf(profile: ProfileDefinition, controlKey: string): number {
  return profile.items.find((item) => item.control === controlKey)?.weight ?? 0;
}

function assessOne(
  db: Db,
  item: ProfileItem,
  row: EvidenceRow | undefined,
  totalWeight: number,
): AssessedControl {
  const control = getControl(db, item.control);
  if (!control) throw new Error(`Profile references unknown control "${item.control}".`);

  const status: StatusOrUnknown = row?.status ?? 'unknown';
  const share = (item.weight / totalWeight) * 100;

  return {
    controlKey: control.key,
    title: control.title,
    category: control.category,
    question: control.question,
    requirement: item.requirement,
    weight: item.weight,
    profileNote: item.note ?? null,
    status,
    answerLabel: row?.answer_label ?? null,
    gapExplanation: row?.gap_explanation ?? (status === 'unknown' ? unansweredCopy(control).consequence : null),
    remediation: row?.remediation ?? (status === 'unknown' ? unansweredCopy(control).fix : null),
    note: row?.note ?? null,
    recordedAt: row?.recorded_at ?? null,
    recordedBy: row?.recorded_by ?? null,
    source: row?.source ?? null,
    impact: Math.round(share * (1 - POINTS[status]) * 10) / 10,
  };
}

function unansweredCopy(control: Control): { consequence: string; fix: string } {
  return {
    consequence: `Nobody has confirmed the state of this yet, so it has to be treated as absent. An insurer or auditor asked to accept "we think so" will assume the worst, and an unanswered question on an application can void a policy on its own.`,
    fix: `Confirm where you stand on this: ${control.question.replace(/\?$/, '')}.`,
  };
}

function describeState(
  profile: ProfileDefinition,
  controls: AssessedControl[],
  score: number,
): { state: ReadinessState; stateHeadline: string; stateExplanation: string } {
  const mandatory = controls.filter((c) => c.requirement === 'mandatory');
  const blocking = mandatory.filter((c) => c.status === 'fail' || c.status === 'unknown');
  const shaky = mandatory.filter((c) => c.status === 'partial');

  if (blocking.length > 0) {
    return {
      state: 'not_ready',
      stateHeadline: 'Not ready',
      stateExplanation:
        `${countPhrase(blocking.length, 'requirement')} this standard treats as non-negotiable ` +
        `${blocking.length === 1 ? 'is' : 'are'} not in place: ${listNames(blocking)}. ` +
        `Until ${blocking.length === 1 ? 'it is' : 'they are'} fixed, expect a declined application or a claim ` +
        `that fails when it is examined \u2014 the rest of the score does not compensate for these.`,
    };
  }

  if (shaky.length > 0) {
    return {
      state: 'conditional',
      stateHeadline: 'Ready with conditions',
      stateExplanation:
        `Nothing is missing outright, but ${listNames(shaky)} ${shaky.length === 1 ? 'is' : 'are'} only ` +
        `partly in place. You can put this in front of an underwriter, though expect questions and a ` +
        `higher price than a clean submission would get.`,
    };
  }

  if (score < READY_THRESHOLD) {
    return {
      state: 'conditional',
      stateHeadline: 'Ready with conditions',
      stateExplanation:
        `Every non-negotiable requirement is met, so this will be accepted for review. The remaining gaps ` +
        `are the difference between a quote and a good quote \u2014 each one is a question you will be asked ` +
        `to answer in writing.`,
    };
  }

  return {
    state: 'ready',
    stateHeadline: 'Ready',
    stateExplanation:
      `Every requirement this standard treats as non-negotiable is in place, and the wider picture is ` +
      `strong. This is a submission that should be straightforward to place, and the evidence behind it is ` +
      `dated and on record if anyone asks you to prove it.`,
  };
}

function countPhrase(n: number, noun: string): string {
  return n === 1 ? `One ${noun}` : `${n} ${noun}s`;
}

function listNames(controls: AssessedControl[]): string {
  const names = controls.map((c) => c.title.toLowerCase());
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}


// ---------------------------------------------------------------------------
// Across every profile a client is assessed against
// ---------------------------------------------------------------------------

export type ProfileScore = {
  key: string;
  name: string;
  publisher: string;
  score: number;
  state: ReadinessState;
  stateHeadline: string;
  blockingCount: number;
};

/**
 * One gap, seen across every profile at once. A control that three standards
 * all demand is one job for the tech, not three -- and knowing all three want
 * it is what makes it the right job to do first.
 */
export type Blocker = {
  controlKey: string;
  title: string;
  status: StatusOrUnknown;
  answerLabel: string | null;
  consequence: string;
  fix: string;
  /** Profiles that treat this as non-negotiable and are not satisfied. */
  requiredBy: string[];
  /** Profiles that expect it but will not refuse over it. */
  expectedBy: string[];
  worstImpact: number;
};

export type PortfolioAssessment = {
  profiles: ProfileScore[];
  /** Mandatory somewhere and not in place. These are what stop "ready". */
  blockers: Blocker[];
  /** Everything else outstanding: costs score, blocks nothing. */
  improvements: Blocker[];
  readyEverywhere: boolean;
};

export function assessAcrossProfiles(
  db: Db,
  tenant: TenantDb,
  clientId: string,
  profileKeys: string[],
): PortfolioAssessment {
  const assessments = profileKeys.map((key) => ({ key, assessment: assessClient(db, tenant, clientId, key) }));

  const profiles: ProfileScore[] = assessments.map(({ key, assessment }) => ({
    key,
    name: assessment.profile.name,
    publisher: assessment.profile.publisher,
    score: assessment.score,
    state: assessment.state,
    stateHeadline: assessment.stateHeadline,
    blockingCount: assessment.gaps.filter(
      (gap) => gap.requirement === 'mandatory' && gap.status !== 'partial',
    ).length,
  }));

  const merged = new Map<string, Blocker>();
  for (const { assessment } of assessments) {
    for (const gap of assessment.gaps) {
      const existing = merged.get(gap.controlKey) ?? {
        controlKey: gap.controlKey,
        title: gap.title,
        status: gap.status,
        answerLabel: gap.answerLabel,
        consequence: gap.gapExplanation ?? '',
        fix: gap.remediation ?? '',
        requiredBy: [],
        expectedBy: [],
        worstImpact: 0,
      };

      if (gap.requirement === 'mandatory') existing.requiredBy.push(assessment.profile.name);
      else existing.expectedBy.push(assessment.profile.name);
      existing.worstImpact = Math.max(existing.worstImpact, gap.impact);
      merged.set(gap.controlKey, existing);
    }
  }

  const all = [...merged.values()].sort(
    (a, b) => b.requiredBy.length - a.requiredBy.length || b.worstImpact - a.worstImpact,
  );

  return {
    profiles,
    blockers: all.filter((gap) => gap.requiredBy.length > 0),
    improvements: all.filter((gap) => gap.requiredBy.length === 0),
    readyEverywhere: profiles.length > 0 && profiles.every((profile) => profile.state === 'ready'),
  };
}

// ---------------------------------------------------------------------------
// What changed since last time
// ---------------------------------------------------------------------------

export type ChangeDirection = 'improved' | 'regressed' | 'answered' | 'updated';

export type ControlChange = {
  controlKey: string;
  title: string;
  direction: ChangeDirection;
  from: StatusOrUnknown;
  to: StatusOrUnknown;
  fromLabel: string | null;
  toLabel: string | null;
};

export type AssessmentDelta = {
  since: string;
  previousScore: number;
  scoreDelta: number;
  changes: ControlChange[];
};

/** Ordering for "did this get better or worse", where unanswered is its own floor. */
const PROGRESS: Record<StatusOrUnknown, number> = { unknown: 0, fail: 1, partial: 2, pass: 3 };

/**
 * Compares a fresh assessment against the one frozen into the previous pack.
 * This is what makes the pack a running record rather than a snapshot nobody
 * can compare: an underwriter asking "what have you actually done since March"
 * gets an answer.
 */
export function diffAssessments(
  previous: Assessment,
  current: Assessment,
  since: string,
): AssessmentDelta {
  const before = new Map(previous.controls.map((control) => [control.controlKey, control]));
  const changes: ControlChange[] = [];

  for (const control of current.controls) {
    const was = before.get(control.controlKey);
    if (!was) continue;
    if (was.status === control.status && was.answerLabel === control.answerLabel) continue;

    const direction: ChangeDirection =
      was.status === 'unknown' && control.status !== 'unknown'
        ? 'answered'
        : PROGRESS[control.status] > PROGRESS[was.status]
          ? 'improved'
          : PROGRESS[control.status] < PROGRESS[was.status]
            ? 'regressed'
            : 'updated';

    changes.push({
      controlKey: control.controlKey,
      title: control.title,
      direction,
      from: was.status,
      to: control.status,
      fromLabel: was.answerLabel,
      toLabel: control.answerLabel,
    });
  }

  // Regressions first: they are the reason to read this section at all.
  const order: Record<ChangeDirection, number> = { regressed: 0, improved: 1, answered: 2, updated: 3 };
  changes.sort((a, b) => order[a.direction] - order[b.direction] || a.title.localeCompare(b.title));

  return {
    since,
    previousScore: previous.score,
    scoreDelta: current.score - previous.score,
    changes,
  };
}
