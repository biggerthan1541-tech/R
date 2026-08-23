import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseCookies, serializeCookie, sign, unsign } from './cookies.ts';

export const CSRF_COOKIE = 'rd_csrf';
export const CSRF_FIELD = '_csrf';

/** Largest form body we will parse. Nothing legitimate here approaches it. */
export const BODY_LIMIT = 64 * 1024;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

declare module 'fastify' {
  interface FastifyRequest {
    cookies: Record<string, string>;
    cspNonce: string;
    csrfToken: string;
  }
}

/**
 * Content Security Policy.
 *
 * Styles and the single print script are nonce-allowed per response; everything
 * else is denied outright. No external origins are referenced anywhere in the
 * app, so default-src 'none' is achievable rather than aspirational.
 */
function contentSecurityPolicy(nonce: string): string {
  return [
    `default-src 'none'`,
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    `img-src 'self' data:`,
    `form-action 'self'`,
    `base-uri 'none'`,
    `frame-ancestors 'none'`,
    `connect-src 'none'`,
  ].join('; ');
}

export function registerSecurity(app: FastifyInstance, options: { secret: string; secureCookies: boolean }): void {
  app.decorateRequest('cookies', null as unknown as Record<string, string>);
  app.decorateRequest('cspNonce', '');
  app.decorateRequest('csrfToken', '');

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    request.cookies = parseCookies(request.headers.cookie);
    request.cspNonce = randomBytes(16).toString('base64url');

    // CSRF: a signed random token in an HttpOnly cookie, mirrored into a hidden
    // field on every form. An attacker's site can trigger a cross-origin POST
    // but cannot read the cookie to populate the field.
    const existing = unsign(request.cookies[CSRF_COOKIE], options.secret);
    const token = existing ?? randomBytes(32).toString('base64url');
    request.csrfToken = token;
    if (!existing) {
      reply.header(
        'set-cookie',
        serializeCookie(CSRF_COOKIE, sign(token, options.secret), {
          httpOnly: true,
          secure: options.secureCookies,
          sameSite: 'Lax',
        }),
      );
    }

    reply.headers({
      'content-security-policy': contentSecurityPolicy(request.cspNonce),
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'geolocation=(), microphone=(), camera=(), interest-cohort=()',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
    });
    if (options.secureCookies) {
      reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    }
  });

  // CSRF check runs after body parsing so the hidden field is available.
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (SAFE_METHODS.has(request.method)) return;

    const body = (request.body ?? {}) as Record<string, unknown>;
    const submitted = typeof body[CSRF_FIELD] === 'string' ? (body[CSRF_FIELD] as string) : '';
    const expected = unsign(request.cookies[CSRF_COOKIE], options.secret) ?? '';

    if (!expected || !submitted || !constantTimeEquals(submitted, expected)) {
      reply.code(403).type('text/plain').send('Request rejected: invalid or missing CSRF token.');
    }
  });
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
