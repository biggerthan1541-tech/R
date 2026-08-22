/*
 * Where a generated pack is kept.
 *
 * Two destinations on purpose:
 *
 *  - packs/<client>/<date>-<id>/record.json is the durable, human-readable, diffable
 *    record. It is the evidence history, it survives `npm run reset`, and it can be
 *    committed to git.
 *  - The SQLite ledger gets the same run as evidence_records, so packs produced by
 *    hand during the pilot show up in the same queries as questionnaire runs — the
 *    history is already there when the console gets built.
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { QUESTIONNAIRE } from '../../config/controls.js';
import { toEvidenceRecords } from '../evaluate.js';
import * as db from '../db.js';

export const PACKS_DIR = resolve(import.meta.dirname, '../../packs');

function dateStamp(iso) {
  return iso.slice(0, 10);
}

/** Reuses the client row if we have assessed this business before. */
function resolveClientRow(input) {
  const existing = db.listClients().find((c) => c.name === input.client.name);
  if (existing) return existing;
  return db.createClient({
    name: input.client.name,
    industry: input.client.industry,
    employeeCount: input.client.employees,
  });
}

export function savePack({ input, brand, result, generatedAt }) {
  const clientRow = resolveClientRow(input);
  const recordedBy = input.engagement.assessedBy ?? 'pack-cli';

  const assessmentId = db.createAssessment(clientRow.id, {
    questionnaireId: QUESTIONNAIRE.id,
    questionnaireVersion: QUESTIONNAIRE.version,
    createdBy: recordedBy,
  });
  db.insertEvidenceRecords(clientRow.id, assessmentId, toEvidenceRecords(result), {
    recordedBy,
    source: 'evidence_pack',
  });
  db.saveResult(clientRow.id, assessmentId, result);
  db.completeAssessment(clientRow.id, assessmentId);

  const dir = join(PACKS_DIR, input.slug, `${dateStamp(generatedAt)}-${assessmentId.slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });

  const record = {
    packVersion: 1,
    generatedAt,
    assessmentId,
    clientId: clientRow.id,
    questionnaire: { id: QUESTIONNAIRE.id, version: QUESTIONNAIRE.version },
    brand: { slug: brand.slug, companyName: brand.companyName },
    client: input.client,
    engagement: input.engagement,
    summary: input.summary,
    answers: input.answers,
    notes: input.notes,
    overrides: input.overrides,
    result,
    sourceFile: input.file,
  };
  writeFileSync(join(dir, 'record.json'), `${JSON.stringify(record, null, 2)}\n`);

  return { dir, assessmentId, clientId: clientRow.id, record };
}

export function listPacks(slug = null) {
  if (!existsSync(PACKS_DIR)) return [];
  const clients = slug ? [slug] : readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const out = [];
  for (const clientSlug of clients) {
    const clientDir = join(PACKS_DIR, clientSlug);
    if (!existsSync(clientDir)) continue;
    for (const runDir of readdirSync(clientDir, { withFileTypes: true })) {
      if (!runDir.isDirectory()) continue;
      const recordPath = join(clientDir, runDir.name, 'record.json');
      if (!existsSync(recordPath)) continue;
      try {
        const record = JSON.parse(readFileSync(recordPath, 'utf8'));
        out.push({ slug: clientSlug, dir: join(clientDir, runDir.name), record });
      } catch {
        out.push({ slug: clientSlug, dir: join(clientDir, runDir.name), record: null });
      }
    }
  }
  return out.sort((a, b) =>
    String(b.record?.generatedAt).localeCompare(String(a.record?.generatedAt)),
  );
}
