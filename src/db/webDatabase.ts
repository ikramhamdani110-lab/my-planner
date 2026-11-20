/**
 * Browser SQLite engine.
 *
 * The desktop app used better-sqlite3 (native Node binding). For the website we
 * run the SAME SQLite engine compiled to WebAssembly (sql.js), behind a small
 * shim that exposes the subset of the better-sqlite3 API the repositories use:
 *
 *   db.prepare(sql).run(...args)  -> { changes, lastInsertRowid }
 *   db.prepare(sql).get(...args)  -> row | undefined
 *   db.prepare(sql).all(...args)  -> rows
 *   db.exec(sql)
 *   db.transaction(fn)()          -> runs fn inside BEGIN/COMMIT (with ROLLBACK)
 *
 * Because the SQL is unchanged, every repository, the recurrence engine, the
 * rescheduling logic and all statistics queries behave exactly as they did on
 * the desktop.
 */
import * as SqlJsModule from 'sql.js';
import type { Database as SqlJsDatabase } from 'sql.js';

/** sql.js exposes its initialiser as the default (CJS) or as `initSqlJs` (ESM interop). */
const initSqlJs: any = (SqlJsModule as any).default ?? (SqlJsModule as any).initSqlJs ?? SqlJsModule;

type SqlValue = string | number | null | Uint8Array;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface Statement {
  run(...args: any[]): RunResult;
  get(...args: any[]): any;
  all(...args: any[]): any[];
}

/** better-sqlite3 throws when a bound value is `undefined`; keep that contract. */
function normalize(args: any[]): SqlValue[] {
  return args.map((a, i) => {
    if (a === undefined) {
      throw new TypeError(`Cannot bind undefined to SQLite parameter #${i + 1}`);
    }
    if (typeof a === 'boolean') return a ? 1 : 0;
    if (a === null) return null;
    if (typeof a === 'number') return a;
    if (typeof a === 'bigint') return Number(a);
    if (a instanceof Uint8Array) return a;
    if (typeof a === 'object' && a !== null && 'buffer' in a && (a as any).buffer instanceof ArrayBuffer) {
      return new Uint8Array((a as any).buffer);
    }
    return String(a);
  });
}

/** sql.js returns column values positionally; convert to plain objects. */

/**
 * Loads the sql.js WebAssembly binary at runtime.
 *
 * The build tool rewrites static asset imports differently in development and
 * production, so the binary is fetched here instead. Vite copies the file into
 * `dist/assets/` at build time (see vite.config.ts); the development server
 * serves it straight from node_modules.
 */
let wasmBytes: ArrayBuffer | null = null;

async function loadWasmBinary(): Promise<ArrayBuffer> {
  if (wasmBytes) return wasmBytes;
  const candidates = [
    new URL('./sql-wasm.wasm', import.meta.url).href,
    new URL('assets/sql-wasm.wasm', document.baseURI).href,
    new URL('node_modules/sql.js/dist/sql-wasm.wasm', document.baseURI).href
  ];
  let lastError = 'unknown error';
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) { lastError = `${res.status} for ${url}`; continue; }
      const buf = await res.arrayBuffer();
      // A 32-bit wasm module always starts with 0x00 0x61 0x73 0x6D.
      const magic = new Uint8Array(buf, 0, 4);
      if (magic[0] !== 0x00 || magic[1] !== 0x61 || magic[2] !== 0x73 || magic[3] !== 0x6D) {
        lastError = `${url} did not return a WebAssembly module`;
        continue;
      }
      wasmBytes = buf;
      return buf;
    } catch (err: any) {
      lastError = `${url}: ${err?.message ?? err}`;
    }
  }
  throw new Error('Could not load the SQLite engine (sql-wasm.wasm). ' + lastError);
}

export class WebDatabase {
  private db: SqlJsDatabase;
  /** Resume point for nested transactions (SQLite has no nested BEGIN). */
  private txDepth = 0;

  private constructor(db: SqlJsDatabase) {
    this.db = db;
  }

  /** Loads WASM and opens either a fresh in-memory DB or one restored from bytes. */
  static async open(bytes?: Uint8Array | null): Promise<WebDatabase> {
    const wasmBinary = await loadWasmBinary();
    const sql = await initSqlJs({ wasmBinary } as any);
    const db = bytes && bytes.length ? new sql.Database(bytes) : new sql.Database();
    const self = new WebDatabase(db);
    self.db.run('PRAGMA foreign_keys = ON');
    return self;
  }

  get raw(): SqlJsDatabase { return this.db; }

  prepare(sql: string): Statement {
    const db = this.db;
    return {
      run: (...args: any[]) => {
        const stmt = db.prepare(sql);
        try {
          stmt.bind(normalize(args));
          stmt.step();
          const changes = db.getRowsModified();
          const idRow = db.exec('SELECT last_insert_rowid() AS id');
          const lastInsertRowid = idRow.length ? Number(idRow[0].values[0][0]) : 0;
          return { changes, lastInsertRowid };
        } finally {
          stmt.free();
        }
      },
      get: (...args: any[]) => {
        const stmt = db.prepare(sql);
        try {
          stmt.bind(normalize(args));
          if (!stmt.step()) return undefined;
          const row = stmt.getAsObject();
          return Object.keys(row).length ? row : undefined;
        } finally {
          stmt.free();
        }
      },
      all: (...args: any[]) => {
        const stmt = db.prepare(sql);
        try {
          stmt.bind(normalize(args));
          const rows: any[] = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          return rows;
        } finally {
          stmt.free();
        }
      }
    };
  }

  /** Multi-statement DDL, exactly like better-sqlite3's exec(). */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(_sql: string): void {
    /* WAL/foreign_keys are irrelevant for an in-memory DB; foreign keys are on. */
  }

  /** better-sqlite3-style: `db.transaction(fn)()` runs fn atomically. */
  transaction<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => T {
    return (...args: Parameters<T>): T => {
      const outermost = this.txDepth === 0;
      if (outermost) this.db.run('BEGIN');
      this.txDepth++;
      try {
        const result = fn(...args);
        this.txDepth--;
        if (outermost) this.db.run('COMMIT');
        return result;
      } catch (err) {
        this.txDepth--;
        if (outermost) {
          try { this.db.run('ROLLBACK'); } catch { /* already rolled back */ }
        }
        throw err;
      }
    };
  }

  /** Full database file bytes — this is what gets persisted. */
  export(): Uint8Array {
    return this.db.export();
  }

  close(): void {
    this.db.close();
  }
}
