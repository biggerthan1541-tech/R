import express from 'express';
import { resolve } from 'node:path';

import { QUESTIONNAIRE } from '../config/controls.js';
import { BRANDING } from '../config/branding.js';
import { evaluateAssessment, toEvidenceRecords } from './evaluate.js';
import { currentActor, canAccessClient } from './auth.js';
import * as store from './db.js';
import { homePage, clientPage } from './views/home.js';
import { questionnairePage } from './views/questionnaire.js';
import { reportPage } from './views/report.js';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.urlencoded({ extended: false }));
app.use(express.static(resolve(process.cwd(), 'public')));

/*
 * Resolves :clientId once and refuses anything the actor cannot reach. Every route
 * below reads req.client rather than the raw parameter, so a tenant check can never
 * be forgotten on a new route.
 */
app.param('clientId', (req, res, next, clientId) => {
  const actor = currentActor(req);
  if (!canAccessClient(actor, clientId)) return res.status(403).send('Forbidden');
  const client = store.getClient(clientId);
  if (!client) return res.status(404).send('Client not found');
  req.actor = actor;
  req.client = client;
  next();
});

app.get('/', (req, res) => {
  res.send(
    homePage({
      branding: BRANDING,
      clients: store.listClients(),
      questionnaire: QUESTIONNAIRE,
    }),
  );
});

app.post('/clients', (req, res) => {
  const name = (req.body.name ?? '').trim();
  if (!name) return res.status(400).send('Client name is required');
  const employees = Number.parseInt(req.body.employeeCount, 10);
  const client = store.createClient({
    name,
    industry: (req.body.industry ?? '').trim() || null,
    employeeCount: Number.isNaN(employees) ? null : employees,
  });
  res.redirect(`/clients/${client.id}`);
});

app.get('/clients/:clientId', (req, res) => {
  res.send(
    clientPage({
      branding: BRANDING,
      client: req.client,
      assessments: store.listAssessments(req.client.id),
    }),
  );
});

app.get('/clients/:clientId/assessments/new', (req, res) => {
  res.send(
    questionnairePage({
      branding: BRANDING,
      client: req.client,
      questionnaire: QUESTIONNAIRE,
    }),
  );
});

app.post('/clients/:clientId/assessments', (req, res) => {
  const clientId = req.client.id;

  // Only accept keys the questionnaire actually declares.
  const known = new Set(
    QUESTIONNAIRE.controls.flatMap((c) => c.questions.map((q) => q.id)),
  );
  const answers = {};
  for (const [key, value] of Object.entries(req.body)) {
    if (known.has(key)) answers[key] = Array.isArray(value) ? value[0] : value;
  }

  const result = evaluateAssessment(QUESTIONNAIRE, answers);

  const assessmentId = store.createAssessment(clientId, {
    questionnaireId: QUESTIONNAIRE.id,
    questionnaireVersion: QUESTIONNAIRE.version,
    createdBy: req.actor.email,
  });
  store.insertEvidenceRecords(clientId, assessmentId, toEvidenceRecords(result), {
    recordedBy: req.actor.email,
    source: 'questionnaire',
  });
  store.saveResult(clientId, assessmentId, result);
  store.completeAssessment(clientId, assessmentId);

  res.redirect(`/clients/${clientId}/assessments/${assessmentId}/report`);
});

app.get('/clients/:clientId/assessments/:assessmentId/report', (req, res) => {
  const clientId = req.client.id;
  const assessment = store.getAssessment(clientId, req.params.assessmentId);
  if (!assessment) return res.status(404).send('Assessment not found');
  const stored = store.getResult(clientId, assessment.id);
  if (!stored) return res.status(409).send('Assessment has no result yet');

  res.send(
    reportPage({
      branding: BRANDING,
      client: req.client,
      assessment,
      result: stored.snapshot,
      generatedAt: stored.computed_at,
    }),
  );
});

/* The structured evidence ledger, straight out of the database. */
app.get('/clients/:clientId/assessments/:assessmentId/evidence.json', (req, res) => {
  const clientId = req.client.id;
  const assessment = store.getAssessment(clientId, req.params.assessmentId);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
  res.json({
    client: { id: req.client.id, name: req.client.name },
    assessment,
    evidence: store.listEvidence(clientId, assessment.id),
  });
});

/* Per-control history for one client — the query the future console is built on. */
app.get('/clients/:clientId/controls/:controlId/history.json', (req, res) => {
  res.json(store.controlHistory(req.client.id, req.params.controlId));
});

app.listen(PORT, () => {
  console.log(`Gap analysis running at http://localhost:${PORT}`);
});
