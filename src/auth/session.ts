import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db/connection.ts';
import { getMspById, type Msp } from '../db/msps.ts';
import { forTenant, type TenantDb, type UserRow } from '../db/tenant.ts';
import { can, roleLabel } from '../domain/roles.ts';
import { serializeCookie } from '../http/cookies.ts';
import { HttpError } from '../http/validation.ts';
import { hashToken, isLive, issueToken, readToken } from './tokens.ts';

export const SESSION_COOKIE = 'rd_session';
export const SESSION_TTL_HOURS = 12;

export type Actor = { msp: Msp; user: UserRow; tenant: TenantDb; tokenHash: string };

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null;
  }
}

function expiryFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

/**
 * Starts a fresh session. A new token is always minted, so a value planted in
 * the browser before login can never become an authenticated session -- the
 * defence against session fixation.
 */
export function startSession(
  db: Db,
  msp: Msp,
  user: UserRow,
  reply: FastifyReply,
  options: { secret: string; secureCookies: boolean },
): void {
  const tenant = forTenant(db, msp.id);
  const { token, hash } = issueToken(msp.id, options.secret);
  tenant.createSession({ userId: user.id, tokenHash: hash, expiresAt: expiryFromNow(SESSION_TTL_HOURS) });
  tenant.recordLogin(user.id);

  reply.header(
    'set-cookie',
    serializeCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: options.secureCookies,
      sameSite: 'Lax',
      maxAge: SESSION_TTL_HOURS * 3600,
    }),
  );
}

export function endSession(
  db: Db,
  request: FastifyRequest,
  reply: FastifyReply,
  options: { secureCookies: boolean },
): void {
  const actor = request.actor;
  if (actor) actor.tenant.revokeSession(actor.tokenHash);

  reply.header(
    'set-cookie',
    serializeCookie(SESSION_COOKIE, '', {
      httpOnly: true,
      secure: options.secureCookies,
      sameSite: 'Lax',
      maxAge: 0,
    }),
  );
}

/**
 * Resolves the cookie to an actor, or null. Every step is a reason to refuse:
 * a bad signature, an unknown tenant, an expired or revoked session, a deleted
 * or disabled user.
 */
export function resolveActor(db: Db, request: FastifyRequest, secret: string): Actor | null {
  const parts = readToken(request.cookies?.[SESSION_COOKIE], secret);
  if (!parts) return null;

  // Tenants are not customer data, so this lookup is not tenant scoped. The id
  // comes from a token the server itself signed, not from user input.
  const msp = getMspById(db, parts.mspId);
  if (!msp) return null;

  const tenant = forTenant(db, msp.id);
  const tokenHash = hashToken(parts.token);
  const session = tenant.getSessionByHash(tokenHash);
  if (!session || !isLive(session)) return null;

  const user = tenant.getUser(session.user_id);
  if (!user || user.status !== 'active') return null;

  tenant.touchSession(tokenHash);
  return { msp, user, tenant, tokenHash };
}

export function requireActor(request: FastifyRequest): Actor {
  if (!request.actor) throw new HttpError(401, 'Sign in to continue.');
  return request.actor;
}

export function requirePermission(request: FastifyRequest, permission: string): Actor {
  const actor = requireActor(request);
  if (!can(actor.user.role, permission)) {
    throw new HttpError(
      403,
      `Your role (${roleLabel(actor.user.role)}) does not allow this. Ask an owner if you need it.`,
    );
  }
  return actor;
}
