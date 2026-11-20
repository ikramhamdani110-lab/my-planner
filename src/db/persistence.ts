/**
 * Where the website keeps your data.
 *
 * The whole SQLite database file is stored in IndexedDB, with a localStorage
 * mirror as a fallback. IndexedDB is used as the primary store because a
 * localStorage entry is limited to roughly 5 MB per origin, while IndexedDB
 * typically allows hundreds of MB. The mirror means a browser that blocks
 * IndexedDB (rare, e.g. some private-mode configurations) still works for
 * normal-sized planners.
 *
 * Nothing leaves the browser: there is no server, no account and no sync.
 */
const DB_NAME = 'my-planner';
const STORE = 'kv';
const KEY = 'database';
const LS_KEY = 'my-planner:database:v1';

/** True when the database exceeds what localStorage can hold (~5 MB). */
let lastSaveUsedIndexedDbOnly = false;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(): Promise<Uint8Array | null> {
  return openIdb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => {
      db.close();
      const v = req.result;
      resolve(v ? new Uint8Array(v) : null);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  }));
}

function idbPut(bytes: Uint8Array): Promise<void> {
  return openIdb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(bytes, KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Reads the saved database, preferring IndexedDB and falling back to localStorage. */
export async function loadDatabaseBytes(): Promise<Uint8Array | null> {
  try {
    const fromIdb = await idbGet();
    if (fromIdb && fromIdb.length) return fromIdb;
  } catch { /* IndexedDB unavailable — fall through */ }
  try {
    const ls = localStorage.getItem(LS_KEY);
    if (ls) return base64ToBytes(ls);
  } catch { /* storage blocked */ }
  return null;
}

/** Saves the database. Returns a short description of where it went. */
export async function saveDatabaseBytes(bytes: Uint8Array): Promise<string> {
  let where = '';
  try {
    await idbPut(bytes);
    where = 'IndexedDB';
  } catch { /* IndexedDB unavailable */ }

  // Mirror into localStorage when it fits; this is also the fallback store.
  try {
    const encoded = bytesToBase64(bytes);
    localStorage.setItem(LS_KEY, encoded);
    lastSaveUsedIndexedDbOnly = false;
    return where ? `${where} + localStorage` : 'localStorage';
  } catch {
    lastSaveUsedIndexedDbOnly = true;
    if (!where) throw new Error('Could not save: browser storage is full. Export a backup, then remove old data.');
    return `${where} only (localStorage is full)`;
  }
}

export function storageWarning(): string | null {
  return lastSaveUsedIndexedDbOnly
    ? 'Your data is larger than localStorage can hold, so it is saved in IndexedDB only. Export a JSON backup regularly.'
    : null;
}

/** Wipes all stored planner data from this browser. */
export async function clearStoredDatabase(): Promise<void> {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch { /* ignore */ }
}

/** How much space this origin is using, when the browser reports it. */
export async function storageEstimate(): Promise<{ used: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { used: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
