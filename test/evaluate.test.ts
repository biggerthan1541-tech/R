import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coerceAnswer, evaluateControl, matches } from '../src/domain/evaluate.ts';
import type { Control } from '../src/domain/types.ts';
import { getControl, listControls, loadControlDefinitions } from '../src/domain/config-loader.ts';
import { testDb } from './helpers.ts';

const enumControl: Control = {
  key: 'demo',
  title: 'Demo',
  category: 'Test',
  sortOrder: 0,
  question: 'How much?',
  version: 'v1',
  answer: {
    type: 'enum',
    options: [
      { value: 'none', label: 'None' },
      { value: 'some', label: 'Some' },
      { value: 'all', label: 'All' },
    ],
  },
  rules: [
    { when: { op: 'eq', value: 'all' }, status: 'pass' },
    { when: { op: 'eq', value: 'some' }, status: 'partial' },
    { when: { op: 'always' }, status: 'fail' },
  ],
  gap: {
    partial: { consequence: 'partial consequence', fix: 'partial fix' },
    fail: { consequence: 'fail consequence', fix: 'fail fix' },
  },
};

test('rules are evaluated in order, first match wins', () => {
  assert.equal(evaluateControl(enumControl, 'all').status, 'pass');
  assert.equal(evaluateControl(enumControl, 'some').status, 'partial');
  assert.equal(evaluateControl(enumControl, 'none').status, 'fail');
});

test('a passing answer carries no gap copy, a failing one does', () => {
  assert.equal(evaluateControl(enumControl, 'all').gap, null);
  assert.deepEqual(evaluateControl(enumControl, 'some').gap, {
    consequence: 'partial consequence',
    fix: 'partial fix',
  });
});

test('the human-readable label is snapshotted alongside the raw value', () => {
  const result = evaluateControl(enumControl, 'some');
  assert.equal(result.answerValue, 'some');
  assert.equal(result.answerLabel, 'Some');
});

test('an answer outside the allowed options is rejected', () => {
  assert.throws(() => evaluateControl(enumControl, 'made_up'), /not one of the allowed answers/);
});

test('percent answers are range checked', () => {
  assert.equal(coerceAnswer({ type: 'percent' }, '72'), 72);
  assert.throws(() => coerceAnswer({ type: 'percent' }, '140'), /between 0 and 100/);
  assert.throws(() => coerceAnswer({ type: 'percent' }, 'lots'), /between 0 and 100/);
});

test('numeric comparison operators work as written in config', () => {
  assert.equal(matches({ op: 'gte', value: 98 }, 98), true);
  assert.equal(matches({ op: 'gte', value: 98 }, 97), false);
  assert.equal(matches({ op: 'lt', value: 10 }, 9), true);
  assert.equal(matches({ op: 'in', value: ['a', 'b'] }, 'b'), true);
  assert.equal(matches({ op: 'not_in', value: ['a', 'b'] }, 'c'), true);
  assert.equal(matches({ op: 'always' }, 'anything'), true);
});

test('every shipped control resolves for every answer it accepts', () => {
  const db = testDb();
  for (const control of listControls(db)) {
    if (control.answer.type !== 'enum') continue;
    for (const option of control.answer.options) {
      const result = evaluateControl(control, option.value);
      assert.ok(['pass', 'partial', 'fail'].includes(result.status), `${control.key}/${option.value}`);
      if (result.status !== 'pass') {
        assert.ok(result.gap?.consequence, `${control.key}/${option.value} has no consequence copy`);
        assert.ok(result.gap?.fix, `${control.key}/${option.value} has no fix copy`);
      }
    }
  }
});

test('the percent control grades coverage at its configured thresholds', () => {
  const db = testDb();
  const edr = getControl(db, 'edr_deployment')!;
  assert.equal(evaluateControl(edr, 100).status, 'pass');
  assert.equal(evaluateControl(edr, 90).status, 'partial');
  assert.equal(evaluateControl(edr, 40).status, 'fail');
});

test('config loading rejects a control with no catch-all rule', () => {
  assert.throws(
    () => loadControlDefinitions(new URL('./fixtures/no-catchall', import.meta.url).pathname),
    /must end with a catch-all rule/,
  );
});

test('config loading rejects a control missing gap copy for a reachable status', () => {
  assert.throws(
    () => loadControlDefinitions(new URL('./fixtures/no-gap-copy', import.meta.url).pathname),
    /has no gap copy/,
  );
});
