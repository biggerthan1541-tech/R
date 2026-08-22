/*
 * Evaluation engine. Pure functions — no database, no HTTP, no knowledge of any
 * specific control. Everything it does is driven by config/controls.js.
 */

export const STATUS = {
  PASS: 'pass',
  PARTIAL: 'partial',
  FAIL: 'fail',
  UNKNOWN: 'unknown',
};

const STATUS_RANK = { pass: 3, partial: 2, unknown: 1, fail: 0 };
const STATUS_FACTOR = { pass: 1, partial: 0.5, unknown: 0, fail: 0 };

export const STATUS_LABEL = {
  pass: 'Meets expectations',
  partial: 'Partial — likely queried',
  fail: 'Will likely fail',
  unknown: 'Not answered',
};

function matchesComparator(value, rule) {
  if (!rule) return false;
  if ('gte' in rule && !(value >= rule.gte)) return false;
  if ('gt' in rule && !(value > rule.gt)) return false;
  if ('lte' in rule && !(value <= rule.lte)) return false;
  if ('lt' in rule && !(value < rule.lt)) return false;
  if ('eq' in rule && !(value === rule.eq)) return false;
  return true;
}

function statusForAnswer(question, raw) {
  if (raw === undefined || raw === null || raw === '') return STATUS.UNKNOWN;

  const { pass, partial } = question.evaluation ?? {};

  if (question.type === 'number') {
    const n = Number(raw);
    if (Number.isNaN(n)) return STATUS.UNKNOWN;
    if (matchesComparator(n, pass)) return STATUS.PASS;
    if (matchesComparator(n, partial)) return STATUS.PARTIAL;
    return STATUS.FAIL;
  }

  if (Array.isArray(pass) && pass.includes(raw)) return STATUS.PASS;
  if (Array.isArray(partial) && partial.includes(raw)) return STATUS.PARTIAL;
  return STATUS.FAIL;
}

function labelForAnswer(question, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (question.type === 'number') return `${raw}${question.unit ?? ''}`;
  return question.options?.find((o) => o.value === raw)?.label ?? String(raw);
}

function narrativeFor(question, status) {
  if (status === STATUS.PASS) return { gap: null, fix: null };
  if (status === STATUS.UNKNOWN) {
    return {
      gap: 'This question was left unanswered. Insurers treat an unanswered control as an unmet one, and an incomplete questionnaire is itself a reason for a carrier to hold or decline a quote.',
      fix: 'Find out the answer before the questionnaire goes to the carrier. If nobody in the business knows, that is worth noting in its own right.',
    };
  }
  const outcome = question.outcomes?.[status] ?? question.outcomes?.fail ?? {};
  return { gap: outcome.gap ?? null, fix: outcome.fix ?? null };
}

const BANDS = {
  ready: {
    key: 'ready',
    label: 'Insurance ready',
    summary:
      'The controls carriers ask about are in place. Expect this questionnaire to be accepted on standard terms.',
  },
  conditional: {
    key: 'conditional',
    label: 'Insurable with conditions',
    summary:
      'Most controls are in place, but there are gaps a carrier will query. Expect a loaded premium, a higher excess, or remediation required as a condition of cover.',
  },
  not_ready: {
    key: 'not_ready',
    label: 'Not yet insurable',
    summary:
      'One or more controls that carriers treat as a precondition are missing. Expect a decline, or a policy with exclusions covering exactly the losses these controls prevent.',
  },
};

/**
 * @param questionnaire  the QUESTIONNAIRE object from config/controls.js
 * @param answers        { [questionId]: rawValue }
 */
export function evaluateAssessment(questionnaire, answers) {
  const controls = questionnaire.controls.map((control) => {
    const questions = control.questions.map((question) => {
      const raw = answers[question.id];
      const status = statusForAnswer(question, raw);
      const { gap, fix } = narrativeFor(question, status);
      return {
        id: question.id,
        prompt: question.prompt,
        help: question.help ?? null,
        answerValue: raw ?? null,
        answerLabel: labelForAnswer(question, raw),
        status,
        gap,
        fix,
      };
    });

    const worst = questions.reduce(
      (acc, q) => (STATUS_RANK[q.status] < STATUS_RANK[acc] ? q.status : acc),
      STATUS.PASS,
    );
    const factor =
      questions.reduce((sum, q) => sum + STATUS_FACTOR[q.status], 0) / questions.length;

    return {
      id: control.id,
      title: control.title,
      domain: control.domain,
      severity: control.severity,
      weight: control.weight,
      insurerContext: control.insurerContext,
      status: worst,
      earned: control.weight * factor,
      questions,
    };
  });

  const totalWeight = controls.reduce((s, c) => s + c.weight, 0);
  const earned = controls.reduce((s, c) => s + c.earned, 0);
  const score = totalWeight === 0 ? 0 : Math.round((earned / totalWeight) * 100);

  const criticalFailures = controls.filter(
    (c) => c.severity === 'critical' && (c.status === STATUS.FAIL || c.status === STATUS.UNKNOWN),
  );

  let band;
  if (criticalFailures.length > 0) band = BANDS.not_ready;
  else if (score >= 85) band = BANDS.ready;
  else if (score >= 65) band = BANDS.conditional;
  else band = BANDS.not_ready;

  const allQuestions = controls.flatMap((c) => c.questions);
  const counts = {
    total: allQuestions.length,
    pass: allQuestions.filter((q) => q.status === STATUS.PASS).length,
    partial: allQuestions.filter((q) => q.status === STATUS.PARTIAL).length,
    fail: allQuestions.filter((q) => q.status === STATUS.FAIL).length,
    unknown: allQuestions.filter((q) => q.status === STATUS.UNKNOWN).length,
  };

  // Ordered worklist: what to fix first. Critical before high before moderate,
  // outright failures before partials.
  const severityRank = { critical: 0, high: 1, moderate: 2 };
  const findings = controls
    .flatMap((c) =>
      c.questions
        .filter((q) => q.status !== STATUS.PASS)
        .map((q) => ({
          controlId: c.id,
          controlTitle: c.title,
          domain: c.domain,
          severity: c.severity,
          ...q,
        })),
    )
    .sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        STATUS_RANK[a.status] - STATUS_RANK[b.status],
    );

  return {
    questionnaireId: questionnaire.id,
    questionnaireVersion: questionnaire.version,
    score,
    band,
    controls,
    counts,
    criticalFailures: criticalFailures.map((c) => ({ id: c.id, title: c.title })),
    findings,
  };
}

/** Flattens an evaluation into the rows written to evidence_records. */
export function toEvidenceRecords(evaluation) {
  return evaluation.controls.flatMap((control) =>
    control.questions.map((q) => ({
      controlId: control.id,
      controlTitle: control.title,
      domain: control.domain,
      severity: control.severity,
      questionId: q.id,
      questionPrompt: q.prompt,
      answerValue: q.answerValue,
      answerLabel: q.answerLabel,
      status: q.status,
      gap: q.gap,
      fix: q.fix,
    })),
  );
}
