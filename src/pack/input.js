/*
 * Loads and validates one client input file (YAML or JSON).
 *
 * Validation is strict and noisy on purpose: this is a tool for producing a client
 * deliverable by hand at speed, and a silently-ignored typo in an answer value would
 * put a wrong pass/fail in front of an MSP's customer.
 */

import { readFileSync, existsSync } from 'node:fs';
import { extname, basename, resolve } from 'node:path';
import { parse } from 'yaml';

import { QUESTIONNAIRE } from '../../config/controls.js';
import { listBrands } from '../brands.js';

function questionIndex() {
  const index = new Map();
  for (const control of QUESTIONNAIRE.controls) {
    for (const question of control.questions) {
      index.set(question.id, { control, question });
    }
  }
  return index;
}

/** Cheap edit distance, used only to suggest a correction on a typo'd key. */
function distance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let corner = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] =
        a[i - 1] === b[j - 1] ? corner : 1 + Math.min(corner, prev[j], prev[j - 1]);
      corner = up;
    }
  }
  return prev[b.length];
}

function suggest(value, candidates) {
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = distance(String(value).toLowerCase(), c.toLowerCase());
    if (d < bestScore) {
      bestScore = d;
      best = c;
    }
  }
  return bestScore <= Math.max(2, Math.ceil(String(value).length / 3)) ? best : null;
}

export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function loadClientFile(path) {
  const file = resolve(path);
  if (!existsSync(file)) throw new Error(`Client file not found: ${file}`);

  const text = readFileSync(file, 'utf8');
  let doc;
  try {
    doc = extname(file).toLowerCase() === '.json' ? JSON.parse(text) : parse(text);
  } catch (err) {
    throw new Error(`Could not parse ${basename(file)}: ${err.message}`);
  }
  if (!doc || typeof doc !== 'object') throw new Error(`${basename(file)} is empty`);

  const errors = [];
  const warnings = [];
  const index = questionIndex();
  const knownIds = [...index.keys()];

  // -- required scalars ----------------------------------------------------
  const client = doc.client ?? {};
  if (!client.name) errors.push('client.name is required');

  const engagement = doc.engagement ?? {};
  if (!engagement.msp) {
    errors.push(`engagement.msp is required (available brands: ${listBrands().join(', ')})`);
  } else if (!listBrands().includes(engagement.msp)) {
    const hint = suggest(engagement.msp, listBrands());
    errors.push(
      `engagement.msp "${engagement.msp}" is not a known brand${
        hint ? ` — did you mean "${hint}"?` : ''
      } (available: ${listBrands().join(', ')})`,
    );
  }

  // -- answers -------------------------------------------------------------
  const rawAnswers = doc.answers ?? {};
  const answers = {};
  for (const [key, value] of Object.entries(rawAnswers)) {
    const entry = index.get(key);
    if (!entry) {
      const hint = suggest(key, knownIds);
      errors.push(`answers.${key} is not a question in this questionnaire${hint ? ` — did you mean "${hint}"?` : ''}`);
      continue;
    }
    if (value === null || value === undefined || value === '') continue;

    const { question } = entry;
    if (question.type === 'number') {
      const n = Number(value);
      if (Number.isNaN(n)) {
        errors.push(`answers.${key} must be a number, got "${value}"`);
        continue;
      }
      if (n < 0 || n > 100) warnings.push(`answers.${key} is ${n}${question.unit ?? ''}, outside the expected 0-100 range`);
      answers[key] = String(n);
    } else {
      const valid = question.options.map((o) => o.value);
      if (!valid.includes(value)) {
        const hint = suggest(value, valid);
        errors.push(
          `answers.${key} = "${value}" is not a valid option${
            hint ? ` — did you mean "${hint}"?` : ''
          }\n      valid values: ${valid.join(', ')}`,
        );
        continue;
      }
      answers[key] = value;
    }
  }

  const missing = knownIds.filter((id) => !(id in answers));
  if (missing.length) {
    warnings.push(
      `${missing.length} question${missing.length === 1 ? '' : 's'} unanswered — ${
        missing.length === 1 ? 'it' : 'they'
      } will appear in the pack as "not answered": ${missing.join(', ')}`,
    );
  }

  // -- notes and overrides -------------------------------------------------
  const notes = {};
  for (const [key, value] of Object.entries(doc.notes ?? {})) {
    if (!index.has(key)) {
      const hint = suggest(key, knownIds);
      errors.push(`notes.${key} is not a question id${hint ? ` — did you mean "${hint}"?` : ''}`);
      continue;
    }
    if (value) notes[key] = String(value).trim();
  }

  const overrides = {};
  for (const [key, value] of Object.entries(doc.overrides ?? {})) {
    if (!index.has(key)) {
      const hint = suggest(key, knownIds);
      errors.push(`overrides.${key} is not a question id${hint ? ` — did you mean "${hint}"?` : ''}`);
      continue;
    }
    if (!value || typeof value !== 'object') {
      errors.push(`overrides.${key} must be a mapping with "gap" and/or "fix"`);
      continue;
    }
    const unknown = Object.keys(value).filter((k) => k !== 'gap' && k !== 'fix');
    if (unknown.length) {
      errors.push(`overrides.${key} has unsupported key(s): ${unknown.join(', ')} — only "gap" and "fix" are allowed`);
      continue;
    }
    overrides[key] = value;
  }

  if (errors.length) {
    throw new Error(
      `${basename(file)} has ${errors.length} problem${errors.length === 1 ? '' : 's'}:\n` +
        errors.map((e) => `  - ${e}`).join('\n'),
    );
  }

  return {
    file,
    slug: client.slug ? slugify(client.slug) : slugify(client.name),
    client: {
      name: client.name,
      industry: client.industry ?? null,
      employees: client.employees ?? null,
      contact: client.contact ?? null,
    },
    engagement: {
      msp: engagement.msp,
      assessedOn: engagement.assessedOn ? String(engagement.assessedOn) : null,
      assessedBy: engagement.assessedBy ?? null,
      method: engagement.method ?? null,
      policyRenewal: engagement.policyRenewal ? String(engagement.policyRenewal) : null,
      broker: engagement.broker ?? null,
    },
    summary: doc.summary ?? null,
    answers,
    notes,
    overrides,
    warnings,
  };
}
