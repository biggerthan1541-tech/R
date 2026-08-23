import formbody from '@fastify/formbody';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { pathToFileURL } from 'node:url';
import { readEnv, type Env } from './config/env.ts';
import { db as sharedDb, type Db } from './db/connection.ts';
import { forTenant, lookupTenantForLogin, type NewEvidence, type TenantDb, type UserRow } from './db/tenant.ts';
import { listControls, listProfiles, syncConfig } from './domain/config-loader.ts';
import { evaluateControl } from './domain/evaluate.ts';
import { assessClient } from './domain/readiness.ts';
import { can, roleLabel, roles } from './domain/roles.ts';
import {
  endSession,
  requireActor,
  requirePermission,
  resolveActor,
  startSession,
  type Actor,
} from './auth/session.ts';
import { hashToken, isLive, issueToken, readToken } from './auth/tokens.ts';
import { hashPassword, verifyPassword } from './auth/passwords.ts';
import { getMspById, type Msp } from './db/msps.ts';
import { BODY_LIMIT, registerSecurity } from './http/security.ts';
import {
  clientIdParam,
  configKey,
  HttpError,
  idParam,
  keyList,
  optionalCount,
  optionalText,
  packIdParam,
  requiredText,
} from './http/validation.ts';
import { renderEvidencePack, type PackSnapshot } from './render/evidence-pack.ts';
import type { ViewContext } from './render/layout.ts';
import { auditPage, loginPage, portalLinksSection, usersPage } from './render/auth-views.ts';
import {
  clientPage,
  consolePage,
  errorPage,
  historyPage,
  type ClientSummary,
} from './render/views.ts';

const PORTAL_TTL_DAYS = 30;

export function buildServer(db: Db = sharedDb(), env: Env = readEnv()) {
  // Portal tokens travel as a route parameter and are ~110 characters signed,
  // well past Fastify's 100-character default.
  const app = Fastify({ logger: false, bodyLimit: BODY_LIMIT, maxParamLength: 512 });
  app.register(formbody, { bodyLimit: BODY_LIMIT });
  registerSecurity(app, { secret: env.sessionSecret, secureCookies: env.secureCookies });

  const cookieOptions = { secret: env.sessionSecret, secureCookies: env.secureCookies };

  app.decorateRequest('actor', null);
  app.addHook('preHandler', async (request: FastifyRequest) => {
    request.actor = resolveActor(db, request, env.sessionSecret);
  });

  const view = (request: FastifyRequest, actor?: Actor | null): ViewContext => {
    const resolved = actor ?? request.actor;
    return {
      nonce: request.cspNonce,
      csrf: request.csrfToken,
      msp: { name: resolved?.msp.name ?? 'Readiness' },
      user: resolved ? { name: resolved.user.name, roleLabel: roleLabel(resolved.user.role) } : null,
    };
  };

  const flashOf = (query: unknown) => {
    const q = (query ?? {}) as Record<string, string>;
    return { ok: q.ok, err: q.err };
  };

  const back = (reply: FastifyReply, path: string, kind: 'ok' | 'err', message: string) =>
    reply.redirect(`${path}?${kind}=${encodeURIComponent(message)}`);

  app.setErrorHandler((error: Error, request, reply) => {
    const status =
      error instanceof HttpError
        ? error.status
        : ((error as unknown as { statusCode?: number }).statusCode ?? 500);

    // An unauthenticated request to a protected page is a redirect, not an error page.
    if (status === 401) return reply.redirect('/login');

    reply.code(status).type('text/html').send(errorPage(view(request), error.message));
  });

  // -- authentication --------------------------------------------------------

  app.get('/login', async (request, reply) => {
    if (request.actor) return reply.redirect('/');
    const query = (request.query ?? {}) as Record<string, string>;
    reply.type('text/html').send(loginPage(view(request), { notice: query.notice }));
  });

  app.post('/login', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string>;
    const email = (body.email ?? '').trim().toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';

    const found = findLogin(db, email);

    // One generic failure for every cause, and the password check runs even when
    // no user matched, so response time does not reveal whether an address exists.
    const ok = found
      ? await verifyPassword(password, found.user.password_hash)
      : await verifyPassword(password, DUMMY_HASH);

    if (!found || !ok || found.user.status !== 'active') {
      if (found) {
        forTenant(db, found.msp.id).appendAudit({
          actorUserId: found.user.id,
          actorLabel: found.user.email,
          action: 'auth.login.failed',
          subjectType: 'user',
          subjectId: found.user.id,
          detail: { reason: found.user.status !== 'active' ? 'disabled' : 'bad_password' },
        });
      }
      return reply
        .code(401)
        .type('text/html')
        .send(loginPage(view(request), { error: 'That email and password combination was not recognised.', email }));
    }

    startSession(db, found.msp, found.user, reply, cookieOptions);
    forTenant(db, found.msp.id).appendAudit({
      actorUserId: found.user.id,
      actorLabel: found.user.email,
      action: 'auth.login',
      subjectType: 'user',
      subjectId: found.user.id,
      detail: {},
    });
    reply.redirect('/');
  });

  app.post('/logout', async (request, reply) => {
    const actor = request.actor;
    if (actor) {
      actor.tenant.appendAudit({
        actorUserId: actor.user.id,
        actorLabel: actor.user.email,
        action: 'auth.logout',
        subjectType: 'user',
        subjectId: actor.user.id,
        detail: {},
      });
    }
    endSession(db, request, reply, cookieOptions);
    reply.redirect('/login?notice=' + encodeURIComponent('Signed out.'));
  });

  // -- roll-up console -------------------------------------------------------

  app.get('/', async (request, reply) => {
    const actor = requirePermission(request, 'client:read');
    const summaries = clientSummaries(db, actor.tenant);

    reply.type('text/html').send(
      consolePage({
        ctx: view(request, actor),
        summaries,
        profiles: listProfiles(db),
        canCreate: can(actor.user.role, 'client:create'),
        flash: flashOf(request.query),
      }),
    );
  });

  // -- clients ---------------------------------------------------------------

  app.post('/clients', async (request, reply) => {
    const actor = requirePermission(request, 'client:create');
    const name = requiredText(request.body, 'name', 'Company name');

    const client = actor.tenant.createClient({
      name,
      industry: optionalText(request.body, 'industry'),
      employeeCount: optionalCount(request.body, 'employeeCount'),
      primaryContact: optionalText(request.body, 'primaryContact'),
    });

    // Onboarding in one submit: profiles are assigned here rather than in a
    // second visit, so the operator lands straight on the control form.
    const known = new Set(listProfiles(db).map((profile) => profile.key));
    const chosen = keyList(request.body, 'profileKey', 'requirement profile').filter((key) => known.has(key));
    if (chosen.length > 0) actor.tenant.setClientProfiles(client.id, chosen);

    audit(actor, 'client.create', 'client', client.id, { name, profiles: chosen.join(',') });
    back(reply, `/clients/${client.id}`, 'ok', `${name} added. Record where they stand below.`);
  });

  app.get('/clients/:id', async (request, reply) => {
    const actor = requirePermission(request, 'client:read');
    const id = clientIdParam(request.params);
    const client = actor.tenant.getClient(id);
    if (!client) throw new HttpError(404, 'No such client.');

    const assignedProfiles = actor.tenant.listClientProfiles(id);
    const query = (request.query ?? {}) as Record<string, string>;
    const activeProfile =
      query.profile && assignedProfiles.includes(query.profile) ? query.profile : assignedProfiles[0];

    const ctx = view(request, actor);
    const canShare = can(actor.user.role, 'portal:share');
    const portalSection = can(actor.user.role, 'pack:read')
      ? portalLinksSection(ctx, id, actor.tenant.listPortalLinks(id), {
          canShare,
          canRevoke: can(actor.user.role, 'portal:revoke'),
          issued: query.portalUrl && query.portalExpires
            ? { url: query.portalUrl, expiresAt: query.portalExpires }
            : undefined,
        })
      : null;

    reply.type('text/html').send(
      clientPage({
        ctx,
        client,
        controls: listControls(db),
        current: actor.tenant.currentEvidence(id),
        profiles: listProfiles(db),
        assignedProfiles,
        assessment: activeProfile ? assessClient(db, actor.tenant, id, activeProfile) : null,
        packs: actor.tenant.listPacks(id),
        portalSection,
        permissions: {
          evidenceWrite: can(actor.user.role, 'evidence:write'),
          configure: can(actor.user.role, 'client:configure'),
          generate: can(actor.user.role, 'pack:generate'),
        },
        flash: flashOf(request.query),
      }),
    );
  });

  app.post('/clients/:id/profiles', async (request, reply) => {
    const actor = requirePermission(request, 'client:configure');
    const id = clientIdParam(request.params);
    if (!actor.tenant.getClient(id)) throw new HttpError(404, 'No such client.');

    const known = new Set(listProfiles(db).map((profile) => profile.key));
    const keys = keyList(request.body, 'profileKey', 'requirement profile').filter((key) => known.has(key));
    actor.tenant.setClientProfiles(id, keys);

    audit(actor, 'client.profiles.set', 'client', id, { profiles: keys.join(',') });
    back(reply, `/clients/${id}`, 'ok', 'Requirement profiles updated.');
  });

  // -- evidence --------------------------------------------------------------

  app.post('/clients/:id/evidence', async (request, reply) => {
    const actor = requirePermission(request, 'evidence:write');
    const id = clientIdParam(request.params);
    if (!actor.tenant.getClient(id)) throw new HttpError(404, 'No such client.');

    const body = (request.body ?? {}) as Record<string, string>;
    const current = actor.tenant.currentEvidence(id);
    const pending: NewEvidence[] = [];
    const problems: string[] = [];

    for (const control of listControls(db)) {
      const rawAnswer = body[`answer__${control.key}`];
      if (rawAnswer === undefined || rawAnswer === '') continue;

      const note = optionalText(body, `note__${control.key}`, 500);
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
        recordedBy: actor.user.name,
      });
    }

    if (problems.length > 0) return back(reply, `/clients/${id}`, 'err', problems.join(' '));

    actor.tenant.appendEvidenceBatch(pending);
    if (pending.length > 0) {
      audit(actor, 'evidence.record', 'client', id, {
        count: pending.length,
        controls: pending.map((record) => record.controlKey).join(','),
      });
    }

    back(
      reply,
      `/clients/${id}`,
      'ok',
      pending.length === 0
        ? 'No changes to record.'
        : `${pending.length} evidence record${pending.length === 1 ? '' : 's'} added.`,
    );
  });

  app.get('/clients/:id/history', async (request, reply) => {
    const actor = requirePermission(request, 'client:read');
    const id = clientIdParam(request.params);
    const client = actor.tenant.getClient(id);
    if (!client) throw new HttpError(404, 'No such client.');

    const controlFilter = ((request.query ?? {}) as Record<string, string>).control ?? null;
    reply.type('text/html').send(
      historyPage({
        ctx: view(request, actor),
        client,
        records: actor.tenant.evidenceHistory(id, controlFilter ?? undefined),
        controls: new Map(listControls(db).map((control) => [control.key, control])),
        controlFilter,
      }),
    );
  });

  // -- packs -----------------------------------------------------------------

  app.post('/clients/:id/packs', async (request, reply) => {
    const actor = requirePermission(request, 'pack:generate');
    const id = clientIdParam(request.params);
    const client = actor.tenant.getClient(id);
    if (!client) throw new HttpError(404, 'No such client.');

    const profileKey = configKey((request.body as Record<string, string>).profileKey, 'requirement profile');
    if (!actor.tenant.listClientProfiles(id).includes(profileKey)) {
      return back(reply, `/clients/${id}`, 'err', 'That profile is not assigned to this client.');
    }

    const packId = generatePack(db, actor.tenant, actor.msp.name, id, profileKey, actor.user.name);
    audit(actor, 'pack.generate', 'pack', packId, { client: id, profile: profileKey });
    reply.redirect(`/packs/${packId}`);
  });

  app.get('/packs/:id', async (request, reply) => {
    const actor = requirePermission(request, 'pack:read');
    const id = packIdParam(request.params);
    const pack = actor.tenant.getPack(id);
    if (!pack) throw new HttpError(404, 'No such evidence pack.');
    reply.type('text/html').send(renderEvidencePack(JSON.parse(pack.snapshot) as PackSnapshot, request.cspNonce));
  });

  // -- read-only client portal ----------------------------------------------

  app.post('/clients/:id/portal', async (request, reply) => {
    const actor = requirePermission(request, 'portal:share');
    const id = clientIdParam(request.params);
    if (!actor.tenant.getClient(id)) throw new HttpError(404, 'No such client.');

    const packId = packIdParam({ id: (request.body as Record<string, string>).packId });
    const pack = actor.tenant.getPack(packId);
    if (!pack || pack.client_id !== id) {
      return back(reply, `/clients/${id}`, 'err', 'That evidence pack does not belong to this client.');
    }

    const { token, hash } = issueToken(actor.msp.id, env.sessionSecret);
    const expiresAt = new Date(Date.now() + PORTAL_TTL_DAYS * 86_400_000).toISOString();
    const linkId = actor.tenant.createPortalLink({
      clientId: id,
      packId,
      tokenHash: hash,
      label: optionalText(request.body, 'label', 120),
      expiresAt,
      createdBy: actor.user.name,
    });

    audit(actor, 'portal.share', 'portal_link', linkId, { client: id, pack: packId, expiresAt });

    const url = `${originOf(request)}/portal/${token}`;
    reply.redirect(
      `/clients/${id}?portalUrl=${encodeURIComponent(url)}&portalExpires=${encodeURIComponent(expiresAt)}`,
    );
  });

  app.post('/clients/:id/portal/:linkId/revoke', async (request, reply) => {
    const actor = requirePermission(request, 'portal:revoke');
    const id = clientIdParam(request.params);
    const linkId = idParam({ id: (request.params as Record<string, string>).linkId }, 'plk', 'portal link');

    actor.tenant.revokePortalLink(linkId);
    audit(actor, 'portal.revoke', 'portal_link', linkId, { client: id });
    back(reply, `/clients/${id}`, 'ok', 'Portal link revoked.');
  });

  /**
   * The client-facing view. No session, no account -- the signed token is the
   * whole credential, it grants read access to exactly one pack, and it stops
   * working when it expires or is revoked.
   */
  app.get('/portal/:token', async (request, reply) => {
    const raw = (request.params as Record<string, string>).token ?? '';
    const parts = readToken(raw, env.sessionSecret);
    if (!parts) throw new HttpError(404, 'This link is not valid.');

    const msp = getMspById(db, parts.mspId);
    if (!msp) throw new HttpError(404, 'This link is not valid.');

    const tenant = forTenant(db, msp.id);
    const link = tenant.getPortalLinkByHash(hashToken(raw));
    if (!link) throw new HttpError(404, 'This link is not valid.');
    if (!isLive(link)) {
      throw new HttpError(410, 'This link has expired or been withdrawn. Ask your IT provider for a new one.');
    }

    const pack = tenant.getPack(link.pack_id);
    if (!pack) throw new HttpError(404, 'This link is not valid.');

    tenant.recordPortalView(hashToken(raw));
    reply.type('text/html').send(renderEvidencePack(JSON.parse(pack.snapshot) as PackSnapshot, request.cspNonce));
  });

  // -- people ----------------------------------------------------------------

  app.get('/users', async (request, reply) => {
    const actor = requirePermission(request, 'user:read');
    reply.type('text/html').send(
      usersPage({
        ctx: view(request, actor),
        users: actor.tenant.listUsers(),
        roles: roles().roles,
        canManage: can(actor.user.role, 'user:manage'),
        flash: flashOf(request.query),
      }),
    );
  });

  app.post('/users', async (request, reply) => {
    const actor = requirePermission(request, 'user:manage');
    const body = (request.body ?? {}) as Record<string, string>;
    const name = requiredText(body, 'name', 'Name', 120);
    const email = requiredText(body, 'email', 'Email', 200).toLowerCase();
    const role = configKey(body.role, 'role');
    if (!roles().roles.some((candidate) => candidate.key === role)) {
      throw new HttpError(400, 'Unrecognised role.');
    }

    if (findLogin(db, email)) return back(reply, '/users', 'err', 'That email address is already in use.');

    let passwordHash: string;
    try {
      passwordHash = await hashPassword(body.password ?? '');
    } catch (error) {
      return back(reply, '/users', 'err', (error as Error).message);
    }

    const user = actor.tenant.createUser({ email, name, role, passwordHash, createdBy: actor.user.id });
    audit(actor, 'user.create', 'user', user.id, { email, role });
    back(reply, '/users', 'ok', `${name} can now sign in.`);
  });

  app.post('/users/:id/role', async (request, reply) => {
    const actor = requirePermission(request, 'user:manage');
    const userId = idParam(request.params, 'usr', 'user');
    const role = configKey((request.body as Record<string, string>).role, 'role');
    if (!roles().roles.some((candidate) => candidate.key === role)) {
      throw new HttpError(400, 'Unrecognised role.');
    }

    const target = actor.tenant.getUser(userId);
    if (!target) throw new HttpError(404, 'No such user.');
    if (target.id === actor.user.id && !can(role, 'user:manage')) {
      return back(reply, '/users', 'err', 'You cannot remove your own ability to manage people.');
    }

    actor.tenant.setUserRole(userId, role);
    audit(actor, 'user.role.set', 'user', userId, { from: target.role, to: role });
    back(reply, '/users', 'ok', `${target.name} is now ${roleLabel(role)}.`);
  });

  app.post('/users/:id/status', async (request, reply) => {
    const actor = requirePermission(request, 'user:manage');
    const userId = idParam(request.params, 'usr', 'user');
    const status = (request.body as Record<string, string>).status === 'disabled' ? 'disabled' : 'active';

    const target = actor.tenant.getUser(userId);
    if (!target) throw new HttpError(404, 'No such user.');
    if (target.id === actor.user.id && status === 'disabled') {
      return back(reply, '/users', 'err', 'You cannot disable your own account.');
    }

    actor.tenant.setUserStatus(userId, status);
    audit(actor, 'user.status.set', 'user', userId, { status });
    back(reply, '/users', 'ok', `${target.name} is now ${status}.`);
  });

  // -- audit log -------------------------------------------------------------

  app.get('/audit', async (request, reply) => {
    const actor = requirePermission(request, 'audit:read');
    reply.type('text/html').send(
      auditPage({
        ctx: view(request, actor),
        entries: actor.tenant.auditTrail(),
        chainOk: actor.tenant.verifyAuditChain().ok,
      }),
    );
  });

  return app;
}

function audit(
  actor: Actor,
  action: string,
  subjectType: string | null,
  subjectId: string | null,
  detail: Record<string, unknown>,
): void {
  actor.tenant.appendAudit({
    actorUserId: actor.user.id,
    actorLabel: actor.user.email,
    action,
    subjectType,
    subjectId,
    detail,
  });
}

/**
 * Email is unique across tenants, so an address resolves to one user and one
 * MSP. Login therefore needs no tenant selector.
 */
function findLogin(db: Db, email: string): { msp: Msp; user: UserRow } | null {
  const mspId = lookupTenantForLogin(db, email);
  if (!mspId) return null;
  const msp = getMspById(db, mspId);
  if (!msp) return null;
  const user = forTenant(db, mspId).getUserByEmail(email);
  return user ? { msp, user } : null;
}

/** Constant-shape hash used when no user matched, so timing does not leak. */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function clientSummaries(db: Db, tenant: TenantDb): ClientSummary[] {
  const summaries = tenant.listClients().map((client): ClientSummary => {
    const profileKeys = tenant.listClientProfiles(client.id);
    const primary = profileKeys[0];
    const history = tenant.evidenceHistory(client.id);

    if (!primary) {
      return {
        client,
        profileName: null,
        score: null,
        state: null,
        stateHeadline: null,
        answered: 0,
        total: 0,
        topGap: null,
        lastActivity: history[0]?.recorded_at ?? null,
      };
    }

    const assessment = assessClient(db, tenant, client.id, primary);
    return {
      client,
      profileName: assessment.profile.name,
      score: assessment.score,
      state: assessment.state,
      stateHeadline: assessment.stateHeadline,
      answered: assessment.coverage.answered,
      total: assessment.coverage.total,
      topGap: assessment.gaps[0]?.title ?? null,
      lastActivity: history[0]?.recorded_at ?? null,
    };
  });

  // Worst first: unconfigured clients need attention as much as failing ones.
  return summaries.sort((a, b) => (a.score ?? -1) - (b.score ?? -1) || a.client.name.localeCompare(b.client.name));
}

function originOf(request: FastifyRequest): string {
  const host = request.headers.host ?? 'localhost:3000';
  const proto = (request.headers['x-forwarded-proto'] as string | undefined) ?? request.protocol;
  return `${proto}://${host}`;
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
  // readEnv and roles() both throw before anything serves if config is missing.
  const env = readEnv();
  roles();
  const db = sharedDb();
  syncConfig(db);
  buildServer(db, env)
    .listen({ port: env.port, host: '0.0.0.0' })
    .then(() => console.log(`Readiness running at http://localhost:${env.port}`))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
