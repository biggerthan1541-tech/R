import formbody from '@fastify/formbody';
import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
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

export function buildServer(db: Db = sharedDb()) {
  const app = Fastify({ logger: false });
  app.register(formbody);

  const scope = (): { msp: Msp; tenant: TenantDb } => {
    const msp = activeMsp(db);
    return { msp, tenant: forTenant(db, msp.id) };
  };

  const flashOf = (query: unknown) => {
    const q = (query ?? {}) as Record<string, string>;
    return { ok: q.ok, err: q.err };
  };

  app.setErrorHandler((error: Error, request, reply) => {
    request.log?.error?.(error);
    let mspName = 'Readiness';
    try {
      mspName = activeMsp(db).name;
    } catch {
      /* no tenant yet -- fall through with the generic name */
    }
    reply.code(500).type('text/html').send(errorPage(mspName, error.message));
  });

  // -- clients ---------------------------------------------------------------

  app.get('/', async (request, reply) => {
    const { msp, tenant } = scope();
    reply.type('text/html').send(clientsPage(msp.name, tenant.listClients(), flashOf(request.query)));
  });

  app.post('/clients', async (request, reply) => {
    const { tenant } = scope();
    const body = request.body as Record<string, string>;
    const name = (body.name ?? '').trim();
    if (!name) return reply.redirect('/?err=' + encodeURIComponent('A company name is required.'));

    const employeeCount = body.employeeCount ? Number(body.employeeCount) : null;
    const client = tenant.createClient({
      name,
      industry: body.industry?.trim() || null,
      employeeCount: Number.isFinite(employeeCount) ? employeeCount : null,
      primaryContact: body.primaryContact?.trim() || null,
    });
    reply.redirect(`/clients/${client.id}?ok=` + encodeURIComponent(`${name} added. Assign a profile and record their controls.`));
  });

  app.get('/clients/:id', async (request, reply) => {
    const { msp, tenant } = scope();
    const { id } = request.params as { id: string };
    const client = tenant.getClient(id);
    if (!client) return reply.code(404).type('text/html').send(errorPage(msp.name, 'No such client.'));

    const assignedProfiles = tenant.listClientProfiles(id);
    const query = (request.query ?? {}) as Record<string, string>;
    const activeProfile =
      query.profile && assignedProfiles.includes(query.profile) ? query.profile : assignedProfiles[0];

    reply.type('text/html').send(
      clientPage({
        mspName: msp.name,
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
    const { id } = request.params as { id: string };
    if (!tenant.getClient(id)) return reply.code(404).send('No such client.');

    const raw = (request.body as Record<string, unknown>).profileKey;
    const keys = raw === undefined ? [] : Array.isArray(raw) ? raw.map(String) : [String(raw)];
    const known = new Set(listProfiles(db).map((p) => p.key));
    tenant.setClientProfiles(id, keys.filter((key) => known.has(key)));

    reply.redirect(`/clients/${id}?ok=` + encodeURIComponent('Requirement profiles updated.'));
  });

  // -- evidence --------------------------------------------------------------

  app.post('/clients/:id/evidence', async (request, reply) => {
    const { tenant } = scope();
    const { id } = request.params as { id: string };
    if (!tenant.getClient(id)) return reply.code(404).send('No such client.');

    const body = request.body as Record<string, string>;
    const recordedBy = (body.recordedBy ?? '').trim() || 'unknown';
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
    const { id } = request.params as { id: string };
    const client = tenant.getClient(id);
    if (!client) return reply.code(404).type('text/html').send(errorPage(msp.name, 'No such client.'));

    const controlFilter = ((request.query ?? {}) as Record<string, string>).control ?? null;
    reply.type('text/html').send(
      historyPage({
        mspName: msp.name,
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
    const { id } = request.params as { id: string };
    const client = tenant.getClient(id);
    if (!client) return reply.code(404).send('No such client.');

    const body = request.body as Record<string, string>;
    const profileKey = body.profileKey ?? '';
    if (!tenant.listClientProfiles(id).includes(profileKey)) {
      return reply.redirect(`/clients/${id}?err=` + encodeURIComponent('That profile is not assigned to this client.'));
    }

    const packId = generatePack(db, tenant, msp.name, id, profileKey, (body.generatedBy ?? '').trim() || 'unknown');
    reply.redirect(`/packs/${packId}`);
  });

  app.get('/packs/:id', async (request, reply) => {
    const { msp, tenant } = scope();
    const { id } = request.params as { id: string };
    const pack = tenant.getPack(id);
    if (!pack) return reply.code(404).type('text/html').send(errorPage(msp.name, 'No such evidence pack.'));
    reply.type('text/html').send(renderEvidencePack(JSON.parse(pack.snapshot) as PackSnapshot));
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
  const db = sharedDb();
  syncConfig(db);
  const port = Number(process.env.PORT ?? 3000);
  buildServer(db)
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
