/*
 * Runs the sample answers through the real pipeline — same evaluation, same evidence
 * writes, same renderer as the web app — and drops a standalone HTML report in
 * samples/. Also seeds the client into the local database so `npm start` shows it.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { QUESTIONNAIRE } from '../config/controls.js';
import { BRANDING } from '../config/branding.js';
import { evaluateAssessment, toEvidenceRecords } from '../src/evaluate.js';
import * as store from '../src/db.js';
import { reportPage } from '../src/views/report.js';

const root = resolve(import.meta.dirname, '..');
const sample = JSON.parse(readFileSync(resolve(root, 'samples/sample-answers.json'), 'utf8'));
const css = readFileSync(resolve(root, 'public/styles.css'), 'utf8');

const operator = 'operator@msp.example';

const client =
  store.listClients().find((c) => c.name === sample.client.name) ??
  store.createClient(sample.client);

const result = evaluateAssessment(QUESTIONNAIRE, sample.answers);

const assessmentId = store.createAssessment(client.id, {
  questionnaireId: QUESTIONNAIRE.id,
  questionnaireVersion: QUESTIONNAIRE.version,
  createdBy: operator,
});
store.insertEvidenceRecords(client.id, assessmentId, toEvidenceRecords(result), {
  recordedBy: operator,
  source: 'sample_seed',
});
store.saveResult(client.id, assessmentId, result);
store.completeAssessment(client.id, assessmentId);

const assessment = store.getAssessment(client.id, assessmentId);

const html = reportPage({
  branding: BRANDING,
  client,
  assessment,
  result,
  generatedAt: new Date().toISOString(),
  inlineCss: css,
  standalone: true,
});

mkdirSync(resolve(root, 'samples'), { recursive: true });
writeFileSync(resolve(root, 'samples/sample-gap-report.html'), html);
writeFileSync(
  resolve(root, 'samples/sample-evidence.json'),
  JSON.stringify(
    {
      client: { id: client.id, name: client.name },
      assessment,
      evidence: store.listEvidence(client.id, assessmentId),
    },
    null,
    2,
  ),
);

console.log(`Client:    ${client.name} (${client.id})`);
console.log(`Score:     ${result.score}/100 — ${result.band.label}`);
console.log(
  `Questions: ${result.counts.pass} pass, ${result.counts.partial} partial, ${result.counts.fail} fail, ${result.counts.unknown} unanswered`,
);
console.log(`Findings:  ${result.findings.length}`);
console.log('Wrote      samples/sample-gap-report.html');
console.log('Wrote      samples/sample-evidence.json');
