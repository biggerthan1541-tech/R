import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing with scrypt from node:crypto -- memory-hard, in the standard
 * library, and no dependency to audit.
 *
 * Hashes are self-describing: `scrypt$N$r$p$salt$hash`. Parameters travel with
 * the hash, so raising the cost later verifies old passwords correctly and
 * `needsRehash` reports which stored hashes are below current strength.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  assertUsable(password);
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, salt, expected] = parts;
  const expectedBuffer = Buffer.from(expected!, 'base64url');

  let derived: Buffer;
  try {
    derived = await scrypt(
      password.normalize('NFKC'),
      Buffer.from(salt!, 'base64url'),
      expectedBuffer.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem },
    );
  } catch {
    return false;
  }

  return derived.length === expectedBuffer.length && timingSafeEqual(derived, expectedBuffer);
}

/** True when a stored hash was made with weaker parameters than we use now. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return Number(parts[1]) < PARAMS.N || Number(parts[2]) < PARAMS.r || Number(parts[3]) < PARAMS.p;
}

const MIN_LENGTH = 12;

export function assertUsable(password: string): void {
  if (typeof password !== 'string' || password.normalize('NFKC').length < MIN_LENGTH) {
    throw new Error(`Password must be at least ${MIN_LENGTH} characters.`);
  }
  if (password.length > 1024) throw new Error('Password must be 1024 characters or fewer.');
}
