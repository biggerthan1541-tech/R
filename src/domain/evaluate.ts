import type { AnswerSchema, Condition, Control, GapCopy, Status } from './types.ts';

/**
 * Evaluates a control's answer against the ordered rules in its definition.
 * First match wins. Config loading guarantees a trailing `always` rule, so
 * every answer resolves to a status.
 *
 * All control-specific behaviour lives in config/controls.json. Nothing in
 * this file knows what MFA or a backup is, and nothing should.
 */
export function evaluateControl(
  control: Control,
  rawAnswer: unknown,
): { status: Status; answerValue: string | number | boolean; answerLabel: string; gap: GapCopy | null } {
  const answerValue = coerceAnswer(control.answer, rawAnswer);

  for (const rule of control.rules) {
    if (matches(rule.when, answerValue)) {
      const gap = rule.status === 'pass' ? null : control.gap[rule.status] ?? null;
      return {
        status: rule.status,
        answerValue,
        answerLabel: labelFor(control.answer, answerValue),
        gap,
      };
    }
  }

  throw new Error(
    `Control "${control.key}" has no rule matching answer ${JSON.stringify(answerValue)}. ` +
      `Every control needs a trailing { "when": { "op": "always" } } rule.`,
  );
}

export function matches(condition: Condition, value: string | number | boolean): boolean {
  switch (condition.op) {
    case 'always':
      return true;
    case 'eq':
      return value === condition.value;
    case 'neq':
      return value !== condition.value;
    case 'in':
      return condition.value.includes(value);
    case 'not_in':
      return !condition.value.includes(value);
    case 'gte':
      return typeof value === 'number' && value >= condition.value;
    case 'gt':
      return typeof value === 'number' && value > condition.value;
    case 'lte':
      return typeof value === 'number' && value <= condition.value;
    case 'lt':
      return typeof value === 'number' && value < condition.value;
  }
}

export function coerceAnswer(schema: AnswerSchema, raw: unknown): string | number | boolean {
  switch (schema.type) {
    case 'enum': {
      const value = String(raw ?? '');
      if (!schema.options.some((option) => option.value === value)) {
        throw new Error(
          `"${value}" is not one of the allowed answers (${schema.options.map((o) => o.value).join(', ')}).`,
        );
      }
      return value;
    }
    case 'boolean':
      return raw === true || raw === 'true' || raw === 'yes' || raw === 'on' || raw === 1;
    case 'percent': {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error(`Expected a percentage between 0 and 100, got ${JSON.stringify(raw)}.`);
      }
      return value;
    }
    case 'number': {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Expected a number, got ${JSON.stringify(raw)}.`);
      return value;
    }
  }
}

export function labelFor(schema: AnswerSchema, value: string | number | boolean): string {
  switch (schema.type) {
    case 'enum':
      return (
        (schema.options.find((option) => option.value === value)?.label) ?? String(value)
      );
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'percent':
      return `${value}%`;
    case 'number':
      return String(value);
  }
}
