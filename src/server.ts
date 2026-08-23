import formbody from '@fastify/formbody';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { pathToFileURL } from 'node:url';
import { readEnv, type Env } from './config/env.ts';
import { db as sharedDb, type Db } from './db/connection.ts';
import { forTenant, lookupTenantForLogin, type NewEvidence, type TenantDb, type UserRow } from './db/tenant.ts';
import { listControls, listProfiles, syncConfig } from './domain/config-loader.ts';
import { evaluateControl } from './domain/evaluate.ts';
import {
  assessAcrossProfiles,
  assessClient,
  diffAssessments,
  type Assessment,
  type AssessmentDelta,
} from './domain/readiness.ts';
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
import { assertUsable, hashPassword, verifyPassword } from './auth/passwords.ts';
import { ensureMsp, getMspById, getMspBySlug, type Msp } from './db/msps.ts';
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
import { auditPage, loginPage, portalLinksSection, signupPage, usersPage } from './render/auth-views.ts';
import { pdfFilename, PdfUnavailableError, renderPdf } from './render/pdf.ts';
import {
  clientPage,
  consolePage,
  errorPage,
  historyPage,
  type ClientSummary,
} from './render/views.ts';

const PORTAL_TTL_DAYS = 30;

/** The role a practice's first user gets. Must exist in config/roles.json. */
const OWNER_ROLE = 'owner';

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

  app.get('/signup', async (request, reply) => {
    if (request.actor) return reply.redirect('/');
    reply.type('text/html').send(signupPage(view(request), { inviteRequired: Boolean(env.signupInviteCode) }));
  });

  app.post('/signup', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string>;
    const values = {
      mspName: (body.mspName ?? '').trim(),
      name: (body.name ?? '').trim(),
      email: (body.email ?? '').trim().toLowerCase(),
    };
    const inviteRequired = Boolean(env.signupInviteCode);
    const fail = (message: string) =>
      reply.code(400).type('text/html').send(signupPage(view(request), { error: message, values, inviteRequired }));

    if (inviteRequired && body.invite !== env.signupInviteCode) {
      return fail('That invite code is not valid.');
    }

    const mspName = requiredText(body, 'mspName', 'Company name', 160);
    const name = requiredText(body, 'name', 'Your name', 120);
    const email = requiredText(body, 'email', 'Email', 200).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('That does not look like an email address.');
    if (findLogin(db, email)) return fail('That email address is already in use.');

    try {
      assertUsable(body.password ?? '');
    } catch (error) {
      return fail((error as Error).message);
    }

    // Slug is derived, then de-duplicated, so two practices may share a name.
    const mspId = ensureMsp(db, uniqueSlug(db, mspName), mspName);
    const tenant = forTenant(db, mspId);
    const user = tenant.createUser({
      email,
      name,
      role: OWNER_ROLE,
      passwordHash: await hashPassword(body.password!),
      createdBy: null,
    });

    tenant.appendAudit({
      actorUserId: user.id,
      actorLabel: email,
      action: 'msp.create',
      subjectType: 'msp',
      subjectId: mspId,
      detail: { name: mspName },
    });

    startSession(db, { id: mspId, slug: '', name: mspName }, user, reply, cookieOptions);
    reply.redirect('/?ok=' + encodeURIComponent(`${mspName} is set up. Add your first client below.`));
  });

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
    const ctx = view(request, actor);
    const canShare = can(actor.user.role, 'portal:share');
    const portalSection = can(actor.user.role, 'pack:read')
      ? portalLinksSection(ctx, id, actor.tenant.listPortalLinks(id), actor.tenant.listPacks(id), {
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
        portfolio: assessAcrossProfiles(db, actor.tenant, id, assignedProfiles),
        delta: latestDelta(db, actor.tenant, id, assignedProfiles),
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
    reply.type('text/html').send(
      renderEvidencePack(JSON.parse(pack.snapshot) as PackSnapshot, request.cspNonce, `/packs/${id}.pdf`),
    );
  });

  app.get('/packs/:id.pdf', async (request, reply) => {
    const actor = requirePermission(request, 'pack:read');
    const id = packIdParam({ id: (request.params as Record<string, string>).id });
    const pack = actor.tenant.getPack(id);
    if (!pack) throw new HttpError(404, 'No such evidence pack.');
    await sendPdf(reply, JSON.parse(pack.snapshot) as PackSnapshot);
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
  app.get('/portal/:token/pdf', async (request, reply) => {
    const link = resolvePortalLink(db, (request.params as Record<string, string>).token ?? '', env.sessionSecret);
    await sendPdf(reply, JSON.parse(link.pack.snapshot) as PackSnapshot);
  });

  app.get('/portal/:token', async (request, reply) => {
    const raw = (request.params as Record<string, string>).token ?? '';
    const { tenant, pack } = resolvePortalLink(db, raw, env.sessionSecret);

    tenant.recordPortalView(hashToken(raw));
    reply.type('text/html').send(
      renderEvidencePack(JSON.parse(pack.snapshot) as PackSnapshot, request.cspNonce, `/portal/${raw}/pdf`),
    );
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

/**
 * Resolves a portal token to its tenant and pack, or throws. Shared by the page
 * and the PDF download so the two can never diverge on who may read what.
 */
function resolvePortalLink(db: Db, raw: string, secret: string) {
  const parts = readToken(raw, secret);
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
  return { tenant, link, pack };
}

async function sendPdf(reply: FastifyReply, snapshot: PackSnapshot): Promise<void> {
  // The PDF is rendered from the frozen snapshot, so it matches the web page
  // byte for byte in content -- there is no second source of truth.
  const html = renderEvidencePack(snapshot, 'pdf', null);
  let pdf: Buffer;
  try {
    pdf = await renderPdf(html);
  } catch (error) {
    if (error instanceof PdfUnavailableError) throw new HttpError(503, error.message);
    throw error;
  }

  reply
    .header('content-type', 'application/pdf')
    .header(
      'content-disposition',
      `attachment; filename="${pdfFilename(snapshot.client.name, snapshot.generatedAt)}"`,
    )
    .send(pdf);
}

/** Score movement since this client's most recent pack, if there is one. */
function latestDelta(
  db: Db,
  tenant: TenantDb,
  clientId: string,
  profileKeys: string[],
): AssessmentDelta | null {
  const primary = profileKeys[0];
  if (!primary) return null;

  const previous = tenant.latestPackForProfile(clientId, primary);
  if (!previous) return null;

  const snapshot = JSON.parse(previous.snapshot) as PackSnapshot;
  return diffAssessments(
    snapshot.assessment,
    assessClient(db, tenant, clientId, primary),
    previous.generated_at,
  );
}

/** `Northwind IT Services` -> `northwind-it-services`, made unique if taken. */
function uniqueSlug(db: Db, name: string): string {
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'msp';
  let candidate = base;
  for (let suffix = 2; getMspBySlug(db, candidate); suffix += 1) candidate = `${base}-${suffix}`;
  return candidate;
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

  // Freeze the comparison too, so the pack shows what moved without depending
  // on what happens to the evidence log afterwards.
  const previous = tenant.latestPackForProfile(clientId, profileKey);
  const delta = previous
    ? diffAssessments(
        (JSON.parse(previous.snapshot) as PackSnapshot).assessment,
        assessment,
        previous.generated_at,
      )
    : null;

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
      delta,
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
