import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Cookie parsing, serialisation and signing.
 *
 * Hand-rolled to hold the dependency budget: the parsing here is string
 * formatting, and the one security-critical part -- the signature -- is
 * HMAC-SHA256 from node:crypto with a constant-time comparison, not homemade
 * cryptography.
 */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export type CookieOptions = {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  path?: string;
};

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  if (!/^[\w!#$%&'*.^`|~+-]+$/.test(name)) throw new Error(`Unsafe cookie name: ${name}`);

  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? '/'}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}

export function sign(value: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${mac}`;
}

/** Returns the payload if the signature verifies, otherwise null. */
export function unsign(signed: string | undefined, secret: string): string | null {
  if (!signed) return null;
  const index = signed.lastIndexOf('.');
  if (index < 1) return null;

  const value = signed.slice(0, index);
  const provided = Buffer.from(signed.slice(index + 1));
  const expected = Buffer.from(createHmac('sha256', secret).update(value).digest('base64url'));

  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? value : null;
}
