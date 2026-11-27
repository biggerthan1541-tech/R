import type { Database } from './types';

const DB_NAME = 'meridian-hcm';
const STORE = 'state';
const KEY = 'database';
const LS_KEY = 'meridian.hcm.db.v1';

const openIdb = (): Promise<IDBDatabase | null> =>
  new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    let settled = false;
    const done = (v: IDBDatabase | null) => {
      if (!settled) { settled = true; resolve(v); }
    };
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const idb = req.result;
        if (!idb.objectStoreNames.contains(STORE)) idb.createObjectStore(STORE);
      };
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
      setTimeout(() => done(null), 2500);
    } catch {
      done(null);
    }
  });

export const loadState = async (): Promise<Database | null> => {
  const idb = await openIdb();
  if (idb) {
    const result = await new Promise<Database | null>((resolve) => {
      try {
        const tx = idb.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve((req.result as Database) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (result) return result;
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Database) : null;
  } catch {
    return null;
  }
};

export const saveState = async (db: Database): Promise<'idb' | 'local' | 'memory'> => {
  const idb = await openIdb();
  if (idb) {
    const ok = await new Promise<boolean>((resolve) => {
      try {
        const tx = idb.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(db, KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
    if (ok) return 'idb';
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
    return 'local';
  } catch {
    return 'memory';
  }
};

export const clearState = async (): Promise<void> => {
  const idb = await openIdb();
  if (idb) {
    await new Promise<void>((resolve) => {
      try {
        const tx = idb.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
};

export const readSetting = (key: string, fallback: string): string => {
  try { return localStorage.getItem(`meridian.${key}`) ?? fallback; } catch { return fallback; }
};

export const writeSetting = (key: string, value: string): void => {
  try { localStorage.setItem(`meridian.${key}`, value); } catch { /* ignore */ }
};
