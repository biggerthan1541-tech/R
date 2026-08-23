import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../db/connection.ts';

/**
 * Runtime configuration. Secrets come from the environment, never the repo.
 *
 * Startup fails loudly if anything required is missing: a compliance product
 * that silently falls back to a default signing key is worse than one that
 * refuses to boot.
 */
export type Env = {
  sessionSecret: string;
  port: number;
  databaseFile: string | undefined;
  secureCookies: boolean;
  nodeEnv: string;
  /** When set, self-serve signup requires this code. Unset means open signup. */
  signupInviteCode: string | null;
  /**
   * Canonical https origin, e.g. https://readiness.example.com.
   *
   * Client portal links are absolute URLs that get emailed and pasted around.
   * Building them from the incoming Host header would let anyone who can reach
   * the server mint a link pointing wherever they like, so in production the
   * origin is configuration, not user input.
   */
  publicUrl: string | null;
  /** Redirect http to https and refuse to issue insecure links. */
  requireHttps: boolean;
};

const MIN_SECRET_LENGTH = 32;

let loaded = false;

/** Node 22 can read .env natively -- no dotenv dependency. */
function loadDotEnv(): void {
  if (loaded) return;
  loaded = true;
  const path = join(projectRoot, '.env');
  if (existsSync(path)) process.loadEnvFile(path);
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  loadDotEnv();
  const missing: string[] = [];

  const sessionSecret = source.SESSION_SECRET ?? '';
  if (!sessionSecret) {
    missing.push('SESSION_SECRET — signs session and portal-link tokens');
  } else if (sessionSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters (got ${sessionSecret.length}). ` +
        `Generate one with: npm run setup`,
    );
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration:\n` +
        missing.map((line) => `  - ${line}`).join('\n') +
        `\n\nRun \`npm run setup\` to write a .env with a generated secret, ` +
        `or set these in the environment.`,
    );
  }

  const nodeEnv = source.NODE_ENV ?? 'development';
  const production = nodeEnv === 'production';

  const publicUrl = source.PUBLIC_URL?.trim().replace(/\/+$/, '') || null;
  if (publicUrl && !/^https?:\/\/[^\s/]+$/.test(publicUrl)) {
    throw new Error(`PUBLIC_URL must be a bare origin like https://readiness.example.com (got "${publicUrl}").`);
  }
  if (production && !publicUrl) {
    throw new Error(
      'PUBLIC_URL is required in production — client portal links are absolute URLs and must not\n' +
        'be built from a request header. Set it to your https origin, e.g.\n' +
        '  PUBLIC_URL=https://readiness.example.com',
    );
  }

  return {
    sessionSecret,
    port: Number(source.PORT ?? 3000),
    databaseFile: source.DATABASE_FILE,
    // Secure cookies require HTTPS, which local development does not have.
    secureCookies: source.SECURE_COOKIES ? source.SECURE_COOKIES === 'true' : nodeEnv === 'production',
    nodeEnv,
    signupInviteCode: source.SIGNUP_INVITE_CODE?.trim() || null,
    publicUrl,
    requireHttps: source.REQUIRE_HTTPS ? source.REQUIRE_HTTPS === 'true' : production,
  };
}
