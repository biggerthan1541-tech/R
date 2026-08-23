import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../db/connection.ts';

/**
 * Roles are data, the same way controls and requirement profiles are. Nothing
 * in this file knows that an "operator" exists; it validates config/roles.json
 * and answers permission questions from it.
 */
export type Permission = { key: string; description: string };
export type Role = { key: string; label: string; description: string; permissions: string[] };
export type RoleCatalogue = { permissions: Permission[]; roles: Role[] };

const configDir = () => process.env.CONFIG_DIR ?? join(projectRoot, 'config');

export function loadRoles(dir = configDir()): RoleCatalogue {
  const parsed = JSON.parse(readFileSync(join(dir, 'roles.json'), 'utf8')) as RoleCatalogue;

  if (!parsed.permissions?.length) throw new Error('roles.json defines no permissions.');
  if (!parsed.roles?.length) throw new Error('roles.json defines no roles.');

  const known = new Set(parsed.permissions.map((permission) => permission.key));
  const seen = new Set<string>();

  for (const role of parsed.roles) {
    if (!role.key || !role.label) throw new Error('Every role needs a key and a label.');
    if (seen.has(role.key)) throw new Error(`Duplicate role key "${role.key}".`);
    seen.add(role.key);
    if (!Array.isArray(role.permissions) || role.permissions.length === 0) {
      throw new Error(`Role "${role.key}" grants no permissions.`);
    }
    // A grant must resolve to something real, or a typo silently removes access.
    for (const grant of role.permissions) {
      if (grant === '*') continue;
      const matches = grant.endsWith(':*')
        ? [...known].some((key) => key.startsWith(grant.slice(0, -1)))
        : known.has(grant);
      if (!matches) {
        throw new Error(`Role "${role.key}" grants "${grant}", which matches no declared permission.`);
      }
    }
  }
  return parsed;
}

let cached: RoleCatalogue | null = null;

export function roles(): RoleCatalogue {
  if (!cached) cached = loadRoles();
  return cached;
}

/** Test seam: forces the next roles() call to re-read from disk. */
export function resetRoleCache(): void {
  cached = null;
}

export function getRole(key: string): Role | undefined {
  return roles().roles.find((role) => role.key === key);
}

export function isRoleKey(key: string): boolean {
  return getRole(key) !== undefined;
}

export function roleLabel(key: string): string {
  return getRole(key)?.label ?? key;
}

/** Does this role hold this permission? Grants may be exact, "group:*", or "*". */
export function can(roleKey: string, permission: string): boolean {
  const role = getRole(roleKey);
  if (!role) return false;

  return role.permissions.some((grant) => {
    if (grant === '*') return true;
    if (grant.endsWith(':*')) return permission.startsWith(grant.slice(0, -1));
    return grant === permission;
  });
}

export function permissionsOf(roleKey: string): string[] {
  return roles()
    .permissions.map((permission) => permission.key)
    .filter((key) => can(roleKey, key));
}
