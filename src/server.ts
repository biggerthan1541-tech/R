import formbody from '@fastify/formbody';
import Fastify, { type FastifyRequest } from 'fastify';
import { pathToFileURL } from 'node:url';
import { readEnv, type Env } from './config/env.ts';
import { BODY_LIMIT, registerSecurity } from './http/security.ts';
import {
  clientIdParam,
  configKey,
  HttpError,
  keyList,
  optionalCount,
  optionalText,
  packIdParam,
  requiredText,
} from './http/validation.ts';
import type { ViewContext } from './render/layout.ts';
import { db as sharedDb, type Db } from './db/connection.ts';
import { firstMsp, getMspBySlug, type Msp } from './db/msps.ts';
import { forTenant, type NewEvidence, type TenantDb } from './db/tenant.ts';
import { getControl, listControls, listProfiles, syncConfig } from './domain/config-loader.ts';
import { evaluateControl } from './domain/evaluate.ts';
import { assessClient } from './domain/readiness.ts';
import { renderEvidencePack, type PackSnapshot } from './render/evidence-pack.ts';
import { clientPage, clientsPage, errorPage, historyPage } from './render/views.ts';

/**
 * Phase 1 has no login: the acting MSP is resolved from ACTIVE_MSP_SLUG, or the
 * first tenant on file. Phase 2 replaces this function with a session lookup --
 * and nothing else changes, because every read and write below already goes
 * through a TenantDb scoped to whatever this returns.
 */
function activeMsp(db: Db): Msp {
  const slug = process.env.ACTIVE_MSP_SLUG;
  const row = slug ? getMspBySlug(db, slug) : firstMsp(db);
  if (!row) {
    throw new Error(
      slug
        ? `No MSP with slug "${slug}". Run \`npm run seed\` or check ACTIVE_MSP_SLUG.`
        : 'No MSPs on file. Run `npm run seed` first.',
    );
  }
  return row;
}

export function buildServer(db: Db = sharedDb(), env: Env = readEnv()) {
  const app = Fastify({ logger: false, bodyLimit: BODY_LIMIT });
  app.register(formbody, { bodyLimit: BODY_LIMIT });
  registerSecurity(app, { secret: env.sessionSecret, secureCookies: env.secureCookies });

  const scope = (): { msp: Msp; tenant: TenantDb } => {
    const msp = activeMsp(db);
    return { msp, tenant: forTenant(db, msp.id) };
  };

  const view = (request: FastifyRequest, msp: Msp): ViewContext => ({
    nonce: request.cspNonce,
    csrf: request.csrfToken,
    msp: { name: msp.name },
  });

  const flashOf = (query: unknown) => {
    const q = (query ?? {}) as Record<string, string>;
    return { ok: q.ok, err: q.err };
  };

  app.setErrorHandler((error: Error, request, reply) => {
    request.log?.error?.(error);
    const fallback: ViewContext = {
      nonce: request.cspNonce ?? '',
      csrf: request.csrfToken ?? '',
      msp: { name: 'Readiness' },
    };
    try {
      fallback.msp = { name: activeMsp(db).name };
    } catch {
      /* no tenant yet -- fall through with the generic name */
    }
    // HttpError carries our own status; Fastify's own errors (413, 400 from the
    // body parser) carry statusCode. Anything else is a genuine 500.
    const fastifyStatus = (error as unknown as { statusCode?: number }).statusCode;
    const status = error instanceof HttpError ? error.status : (fastifyStatus ?? 500);
    reply.code(status).type('text/html').send(errorPage(fallback, error.message));
  });

  // -- clients ---------------------------------------------------------------

  app.get('/', async (request, reply) => {
    const { msp, tenant } = scope();
    reply.type('text/html').send(clientsPage(view(request, msp), tenant.listClients(), flashOf(request.query)));
  });

  app.post('/clients', async (request, reply) => {
    const { tenant } = scope();
    const name = requiredText(request.body, 'name', 'Company name');
    const client = tenant.createClient({
      name,
      industry: optionalText(request.body, 'industry'),
      employeeCount: optionalCount(request.body, 'employeeCount'),
      primaryContact: optionalText(request.body, 'primaryContact'),
    });
    reply.redirect(`/clients/${client.id}?ok=` + encodeURIComponent(`${name} added. Assign a profile and record their controls.`));
  });

  app.get('/clients/:id', async (request, reply) => {
    const { msp, tenant } = scope();
    const id = clientIdParam(request.params);
    const client = tenant.getClient(id);
    if (!client) return reply.code(404).type('text/html').send(errorPage(view(request, msp), 'No such client.'));

    const assignedProfiles = tenant.listClientProfiles(id);
    const query = (request.query ?? {}) as Record<string, string>;
    const activeProfile =
      query.profile && assignedProfiles.includes(query.profile) ? query.profile : assignedProfiles[0];

    reply.type('text/html').send(
      clientPage({
        ctx: view(request, msp),
        client,
        controls: listControls(db),
        current: tenant.currentEvidence(id),
        profiles: listProfiles(db),
        assignedProfiles,
        assessment: activeProfile ? assessClient(db, tenant, id, activeProfile) : null,
        packs: tenant.listPacks(id),
        flash: flashOf(request.query),
      }),
    );
  });

  app.post('/clients/:id/profiles', async (request, reply) => {
    const { tenant } = scope();
    const id = clientIdParam(request.params);
    if (!tenant.getClient(id)) return reply.code(404).send('No such client.');

    const known = new Set(listProfiles(db).map((p) => p.key));
    const keys = keyList(request.body, 'profileKey', 'requirement profile');
    tenant.setClientProfiles(id, keys.filter((key) => known.has(key)));

    reply.redirect(`/clients/${id}?ok=` + encodeURIComponent('Requirement profiles updated.'));
  });

  // -- evidence --------------------------------------------------------------

  app.post('/clients/:id/evidence', async (request, reply) => {
    const { tenant } = scope();
    const id = clientIdParam(request.params);
    if (!tenant.getClient(id)) return reply.code(404).send('No such client.');

    const body = request.body as Record<string, string>;
    const recordedBy = requiredText(body, 'recordedBy', 'Recorded by', 120);
    const current = tenant.currentEvidence(id);
    const pending: NewEvidence[] = [];
    const problems: string[] = [];

    for (const control of listControls(db)) {
      const rawAnswer = body[`answer__${control.key}`];
      if (rawAnswer === undefined || rawAnswer === '') continue;

      const note = (body[`note__${control.key}`] ?? '').trim() || null;
      const existing = current.get(control.key);

      let evaluated;
      try {
        evaluated = evaluateControl(control, rawAnswer);
      } catch (error) {
        problems.push(`${control.title}: ${(error as Error).message}`);
        continue;
      }

      // Append only on a real change -- an unchanged re-save would add noise to
      // the audit trail without adding information.
      const unchanged =
        existing !== undefined &&
        JSON.parse(existing.answer_value) === evaluated.answerValue &&
        existing.note === note &&
        existing.control_version === control.version;
      if (unchanged) continue;

      pending.push({
        clientId: id,
        controlKey: control.key,
        controlVersion: control.version,
        answerValue: evaluated.answerValue,
        answerLabel: evaluated.answerLabel,
        status: evaluated.status,
        gapExplanation: evaluated.gap?.consequence ?? null,
        remediation: evaluated.gap?.fix ?? null,
        note,
        source: 'manual',
        recordedBy,
      });
    }

    if (problems.length > 0) {
      return reply.redirect(`/clients/${id}?err=` + encodeURIComponent(problems.join(' ')));
    }

    tenant.appendEvidenceBatch(pending);
    const message =
      pending.length === 0
        ? 'No changes to record.'
        : `${pending.length} evidence record${pending.length === 1 ? '' : 's'} added.`;
    reply.redirect(`/clients/${id}?ok=` + encodeURIComponent(message));
  });

  app.get('/clients/:id/history', async (request, reply) => {
    const { msp, tenant } = scope();
    const id = clientIdParam(request.params);
    const client = tenant.getClient(id);
    if (!client) return reply.code(404).type('text/html').send(errorPage(view(request, msp), 'No such client.'));

    const controlFilter = ((request.query ?? {}) as Record<string, string>).control ?? null;
    reply.type('text/html').send(
      historyPage({
        ctx: view(request, msp),
        client,
        records: tenant.evidenceHistory(id, controlFilter ?? undefined),
        controls: new Map(listControls(db).map((control) => [control.key, control])),
        controlFilter,
      }),
    );
  });

  // -- packs -----------------------------------------------------------------

  app.post('/clients/:id/packs', async (request, reply) => {
    const { msp, tenant } = scope();
    const id = clientIdParam(request.params);
    const client = tenant.getClient(id);
    if (!client) return reply.code(404).send('No such client.');

    const body = request.body as Record<string, string>;
    const profileKey = configKey(body.profileKey, 'requirement profile');
    if (!tenant.listClientProfiles(id).includes(profileKey)) {
      return reply.redirect(`/clients/${id}?err=` + encodeURIComponent('That profile is not assigned to this client.'));
    }

    const generatedBy = requiredText(body, 'generatedBy', 'Generated by', 120);
    const packId = generatePack(db, tenant, msp.name, id, profileKey, generatedBy);
    reply.redirect(`/packs/${packId}`);
  });

  app.get('/packs/:id', async (request, reply) => {
    const { msp, tenant } = scope();
    const id = packIdParam(request.params);
    const pack = tenant.getPack(id);
    if (!pack) {
      return reply.code(404).type('text/html').send(errorPage(view(request, msp), 'No such evidence pack.'));
    }
    reply.type('text/html').send(renderEvidencePack(JSON.parse(pack.snapshot) as PackSnapshot, request.cspNonce));
  });

  return app;
}

/**
 * Computes an assessment and freezes it as an immutable pack row. The rendered
 * document is derived from the stored snapshot, so reopening an old pack shows
 * what was true on the day it was generated.
 */
export function generatePack(
  db: Db,
  tenant: TenantDb,
  mspName: string,
  clientId: string,
  profileKey: string,
  generatedBy: string,
): string {
  const client = tenant.getClient(clientId);
  if (!client) throw new Error('No such client.');

  const assessment = assessClient(db, tenant, clientId, profileKey);
  const generatedAt = new Date().toISOString();
  const packId = tenant.newPackId();

  tenant.savePack({
    packId,
    clientId,
    profileKey,
    score: assessment.score,
    state: assessment.state,
    generatedBy,
    snapshot: {
      packId,
      generatedAt,
      generatedBy,
      msp: { name: mspName },
      client: {
        id: client.id,
        name: client.name,
        industry: client.industry,
        employeeCount: client.employee_count,
        primaryContact: client.primary_contact,
      },
      assessment,
    } satisfies PackSnapshot,
  });

  return packId;
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  // readEnv throws before anything else happens if configuration is missing.
  const env = readEnv();
  const db = sharedDb();
  syncConfig(db);
  const port = env.port;
  buildServer(db, env)
    .listen({ port, host: '0.0.0.0' })
    .then(() => {
      const msp = activeMsp(db);
      console.log(`Readiness running at http://localhost:${port}  (acting as ${msp.name})`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
