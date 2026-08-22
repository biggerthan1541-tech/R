/*
 * Generates a fill-in-the-blanks client file straight from the control definitions.
 *
 * Every question is written out with its valid values and the outcome each one
 * produces, so a pack can be filled in from notes without cross-referencing anything.
 * Regenerate after editing config/controls.js and the template follows automatically.
 */

import { QUESTIONNAIRE } from '../../config/controls.js';
import { listBrands } from '../brands.js';

const OUTCOME_TAG = { pass: 'PASS', partial: 'PARTIAL', fail: 'FAIL' };

function outcomeOf(question, value) {
  if (question.evaluation?.pass?.includes(value)) return OUTCOME_TAG.pass;
  if (question.evaluation?.partial?.includes(value)) return OUTCOME_TAG.partial;
  return OUTCOME_TAG.fail;
}

function comparatorText(rule) {
  if (!rule) return null;
  const [op, n] = Object.entries(rule)[0];
  const word = { gte: '>=', gt: '>', lte: '<=', lt: '<', eq: '=' }[op] ?? op;
  return `${word} ${n}`;
}

function wrap(text, width, indent) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => `${indent}${l}`).join('\n');
}

function quote(value) {
  return JSON.stringify(String(value));
}

export function scaffoldClientFile({ name, msp }) {
  const today = new Date().toISOString().slice(0, 10);
  const brand = msp ?? listBrands()[0] ?? 'northgate';

  const out = [];
  out.push('# Evidence pack input.  Fill in, then:  npm run pack -- build <this file>');
  out.push(`# Generated from questionnaire ${QUESTIONNAIRE.id} v${QUESTIONNAIRE.version}.`);
  out.push('#');
  out.push('# Leave any answer blank if the client genuinely does not know — the pack');
  out.push('# reports it as "not answered", which is a finding in its own right.');
  out.push('');
  out.push('client:');
  out.push(`  name: ${quote(name)}`);
  out.push('  industry:            # e.g. Freight & warehousing');
  out.push('  employees:           # headcount, a number');
  out.push('  contact:             # who you spoke to, e.g. "Dawn Whitmore, Operations Director"');
  out.push('');
  out.push('engagement:');
  out.push(`  msp: ${brand}   # brand config: config/brands/${brand}.yaml (available: ${listBrands().join(', ')})`);
  out.push(`  assessedOn: ${today}`);
  out.push('  assessedBy:          # your name, appears on the cover');
  out.push('  method:              # e.g. "On-site review + admin console walkthrough"');
  out.push('  policyRenewal:       # YYYY-MM-DD, optional');
  out.push('  broker:              # optional');
  out.push('');
  out.push('# Optional. Two or three sentences in your own words, shown near the top of');
  out.push('# the pack. Leave blank to omit the section entirely.');
  out.push('summary: >-');
  out.push('');
  out.push('answers:');

  for (const control of QUESTIONNAIRE.controls) {
    out.push('');
    out.push(`  # ${'-'.repeat(72)}`);
    out.push(`  # ${control.domain.toUpperCase()} — ${control.title}  [${control.severity.toUpperCase()}, weight ${control.weight}]`);
    out.push(`  # ${'-'.repeat(72)}`);

    for (const question of control.questions) {
      out.push('');
      out.push(wrap(question.prompt, 76, '  # '));
      if (question.help) out.push(wrap(question.help, 74, '  #   '));

      if (question.type === 'number') {
        const pass = comparatorText(question.evaluation?.pass);
        const partial = comparatorText(question.evaluation?.partial);
        out.push(`  #   a number${question.unit ? ` (${question.unit})` : ''} — PASS ${pass}${partial ? `, PARTIAL ${partial}` : ''}, otherwise FAIL`);
      } else {
        const width = Math.max(...question.options.map((o) => o.value.length));
        for (const option of question.options) {
          const tag = outcomeOf(question, option.value);
          out.push(`  #   ${option.value.padEnd(width)}  ${option.label}  [${tag}]`);
        }
      }
      out.push(`  ${question.id}:`);
    }
  }

  out.push('');
  out.push('# Optional. What you actually saw, per question id. Printed in the pack under');
  out.push('# the relevant finding — this is what makes it an evidence pack rather than a');
  out.push('# self-assessment. Delete the block if unused.');
  out.push('notes: {}');
  out.push('  # mfa.email: Entra ID Conditional Access reviewed 18 Aug; 4 shared mailboxes exempt.');
  out.push('');
  out.push('# Optional. Replace the standard gap/fix wording for this client only.');
  out.push('# Delete the block if unused.');
  out.push('overrides: {}');
  out.push('  # backup.restore_test:');
  out.push('  #   fix: "Veeam is already licensed for this — book the restore test with Priya."');
  out.push('');

  return out.join('\n');
}
