import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { sign, unsign } from '../http/cookies.ts';

/**
 * Session and portal tokens.
 *
 * The token embeds the tenant it belongs to and is HMAC-signed, so the msp id
 * is known -- and trustworthy -- before any database work. That is what lets
 * every session and portal-link lookup go through the scoped repository: there
 * is no unscoped "find by token" query anywhere in the codebase.
 *
 * The stored value is sha256 of the token, never the token itself, so a dump of
 * the sessions or portal_links table cannot be replayed.
 */
export type TokenParts = { mspId: string; token: string };

export function issueToken(mspId: string, secret: string): { token: string; hash: string } {
  const token = sign(`${mspId}.${randomBytes(32).toString('base64url')}`, secret);
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Returns the tenant the token claims, or null if the signature does not verify. */
export function readToken(token: string | undefined, secret: string): TokenParts | null {
  const payload = unsign(token, secret);
  if (!payload) return null;

  const separator = payload.indexOf('.');
  if (separator < 1) return null;

  const mspId = payload.slice(0, separator);
  if (!/^msp_[a-z0-9]{8,32}$/.test(mspId)) return null;
  return { mspId, token: token! };
}

/** True while `expiresAt` is in the future and the row has not been revoked. */
export function isLive(row: { expires_at: string; revoked_at: string | null }, now = new Date()): boolean {
  if (row.revoked_at !== null) return false;
  return new Date(row.expires_at).getTime() > now.getTime();
}

export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
