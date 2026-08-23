import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db/connection.ts';
import { nowIso, projectRoot } from '../db/connection.ts';
import type { Control, ControlDefinition, ProfileDefinition, Requirement } from './types.ts';

const configDir = () => process.env.CONFIG_DIR ?? join(projectRoot, 'config');

const VALID_OPS = new Set(['always', 'eq', 'neq', 'in', 'not_in', 'gte', 'gt', 'lte', 'lt']);
const VALID_STATUSES = new Set(['pass', 'partial', 'fail']);
const VALID_REQUIREMENTS = new Set<Requirement>(['mandatory', 'recommended', 'optional']);

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);
}

export function loadControlDefinitions(dir = configDir()): ControlDefinition[] {
  const parsed = JSON.parse(readFileSync(join(dir, 'controls.json'), 'utf8')) as {
    controls: ControlDefinition[];
  };
  const seen = new Set<string>();

  for (const control of parsed.controls) {
    const where = `control "${control.key}"`;
    if (!control.key) throw new Error('Every control needs a key.');
    if (seen.has(control.key)) throw new Error(`Duplicate control key "${control.key}".`);
    seen.add(control.key);
    if (!control.title || !control.category || !control.question) {
      throw new Error(`${where} is missing title, category or question.`);
    }
    if (!control.answer?.type) throw new Error(`${where} is missing an answer schema.`);
    if (control.answer.type === 'enum' && !control.answer.options?.length) {
      throw new Error(`${where} is an enum but has no options.`);
    }
    if (!Array.isArray(control.rules) || control.rules.length === 0) {
      throw new Error(`${where} has no evaluation rules.`);
    }
    for (const rule of control.rules) {
      if (!VALID_OPS.has(rule.when?.op)) {
        throw new Error(`${where} uses unknown operator "${rule.when?.op}".`);
      }
      if (!VALID_STATUSES.has(rule.status)) {
        throw new Error(`${where} uses unknown status "${rule.status}".`);
      }
    }
    // Guarantees evaluateControl always resolves.
    if (control.rules.at(-1)!.when.op !== 'always') {
      throw new Error(`${where} must end with a catch-all rule: { "when": { "op": "always" }, ... }.`);
    }
    // Every non-passing outcome the rules can produce needs plain-language copy.
    for (const rule of control.rules) {
      if (rule.status !== 'pass' && !control.gap?.[rule.status]) {
        throw new Error(`${where} can evaluate to "${rule.status}" but has no gap copy for it.`);
      }
    }
  }
  return parsed.controls;
}

export function loadProfileDefinitions(dir = configDir()): ProfileDefinition[] {
  const profileDir = join(dir, 'profiles');
  const files = readdirSync(profileDir).filter((name) => name.endsWith('.json'));
  return files.map((file) => {
    const profile = JSON.parse(readFileSync(join(profileDir, file), 'utf8')) as ProfileDefinition;
    if (!profile.key) throw new Error(`${file} is missing a key.`);
    if (!profile.items?.length) throw new Error(`Profile "${profile.key}" has no items.`);
    for (const item of profile.items) {
      if (!VALID_REQUIREMENTS.has(item.requirement)) {
        throw new Error(`Profile "${profile.key}" uses unknown requirement "${item.requirement}".`);
      }
      if (!(item.weight > 0)) {
        throw new Error(`Profile "${profile.key}" item "${item.control}" needs a positive weight.`);
      }
    }
    return profile;
  });
}

/**
 * Syncs config/ into the database. Safe to run repeatedly -- a control whose
 * definition changed gets a new version hash, which is what future evidence
 * records are stamped with. Existing evidence keeps its original stamp.
 */
export function syncConfig(db: Db, dir = configDir()): { controls: number; profiles: number } {
  const controls = loadControlDefinitions(dir);
  const profiles = loadProfileDefinitions(dir);

  const controlKeys = new Set(controls.map((c) => c.key));
  for (const profile of profiles) {
    for (const item of profile.items) {
      if (!controlKeys.has(item.control)) {
        throw new Error(
          `Profile "${profile.key}" references control "${item.control}", which is not defined in controls.json.`,
        );
      }
    }
  }

  const syncedAt = nowIso();
  const tx = db.transaction(() => {
    const upsertControl = db.prepare(
      `INSERT INTO controls (control_key, title, category, sort_order, version, definition, synced_at)
       VALUES (@control_key, @title, @category, @sort_order, @version, @definition, @synced_at)
       ON CONFLICT (control_key) DO UPDATE SET
         title = excluded.title, category = excluded.category, sort_order = excluded.sort_order,
         version = excluded.version, definition = excluded.definition, synced_at = excluded.synced_at`,
    );
    for (const control of controls) {
      upsertControl.run({
        control_key: control.key,
        title: control.title,
        category: control.category,
        sort_order: control.sortOrder ?? 0,
        version: hash(control),
        definition: JSON.stringify(control),
        synced_at: syncedAt,
      });
    }

    const upsertProfile = db.prepare(
      `INSERT INTO requirement_profiles (profile_key, name, publisher, version, description, definition, synced_at)
       VALUES (@profile_key, @name, @publisher, @version, @description, @definition, @synced_at)
       ON CONFLICT (profile_key) DO UPDATE SET
         name = excluded.name, publisher = excluded.publisher, version = excluded.version,
         description = excluded.description, definition = excluded.definition, synced_at = excluded.synced_at`,
    );
    const clearItems = db.prepare(`DELETE FROM profile_items WHERE profile_key = ?`);
    const insertItem = db.prepare(
      `INSERT INTO profile_items (profile_key, control_key, weight, requirement, note)
       VALUES (@profile_key, @control_key, @weight, @requirement, @note)`,
    );
    for (const profile of profiles) {
      upsertProfile.run({
        profile_key: profile.key,
        name: profile.name,
        publisher: profile.publisher,
        version: profile.version,
        description: profile.description,
        definition: JSON.stringify(profile),
        synced_at: syncedAt,
      });
      clearItems.run(profile.key);
      for (const item of profile.items) {
        insertItem.run({
          profile_key: profile.key,
          control_key: item.control,
          weight: item.weight,
          requirement: item.requirement,
          note: item.note ?? null,
        });
      }
    }
  });
  tx();

  return { controls: controls.length, profiles: profiles.length };
}

// -- read-side helpers (global reference data, not tenant scoped) ------------

export function listControls(db: Db): Control[] {
  const rows = db
    .prepare(`SELECT version, definition FROM controls ORDER BY sort_order, control_key`)
    .all() as { version: string; definition: string }[];
  return rows.map((row) => ({ ...(JSON.parse(row.definition) as ControlDefinition), version: row.version }));
}

export function getControl(db: Db, key: string): Control | undefined {
  const row = db
    .prepare(`SELECT version, definition FROM controls WHERE control_key = ?`)
    .get(key) as { version: string; definition: string } | undefined;
  if (!row) return undefined;
  return { ...(JSON.parse(row.definition) as ControlDefinition), version: row.version };
}

export function listProfiles(db: Db): ProfileDefinition[] {
  const rows = db
    .prepare(`SELECT definition FROM requirement_profiles ORDER BY name`)
    .all() as { definition: string }[];
  return rows.map((row) => JSON.parse(row.definition) as ProfileDefinition);
}

export function getProfile(db: Db, key: string): ProfileDefinition | undefined {
  const row = db
    .prepare(`SELECT definition FROM requirement_profiles WHERE profile_key = ?`)
    .get(key) as { definition: string } | undefined;
  return row ? (JSON.parse(row.definition) as ProfileDefinition) : undefined;
}
