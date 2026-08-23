import type { Db } from './connection.ts';
import type { Control, ControlDefinition, ProfileDefinition } from '../domain/types.ts';

/**
 * Global reference data: control definitions and requirement profiles synced
 * from config/. These rows are shared across every tenant and contain no
 * customer data, so they are deliberately NOT tenant scoped.
 *
 * All SQL lives under src/db/ -- see test/no-raw-sql.test.ts, which fails the
 * build if a query appears anywhere else.
 */

export type ControlUpsert = {
  key: string;
  title: string;
  category: string;
  sortOrder: number;
  version: string;
  definition: ControlDefinition;
};

export type ProfileUpsert = { profile: ProfileDefinition; syncedAt: string };

export function replaceReferenceData(
  db: Db,
  controls: ControlUpsert[],
  profiles: ProfileDefinition[],
  syncedAt: string,
): void {
  const upsertControl = db.prepare(
    `INSERT INTO controls (control_key, title, category, sort_order, version, definition, synced_at)
     VALUES (@control_key, @title, @category, @sort_order, @version, @definition, @synced_at)
     ON CONFLICT (control_key) DO UPDATE SET
       title = excluded.title, category = excluded.category, sort_order = excluded.sort_order,
       version = excluded.version, definition = excluded.definition, synced_at = excluded.synced_at`,
  );
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

  const tx = db.transaction(() => {
    for (const control of controls) {
      upsertControl.run({
        control_key: control.key,
        title: control.title,
        category: control.category,
        sort_order: control.sortOrder,
        version: control.version,
        definition: JSON.stringify(control.definition),
        synced_at: syncedAt,
      });
    }
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
}

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
