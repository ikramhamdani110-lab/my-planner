import type { WebDatabase } from './webDatabase';

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      icon TEXT
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_date TEXT NOT NULL,
      target_date TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
      status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed','archived')),
      category TEXT DEFAULT 'Other',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      target_date TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      start_time TEXT NOT NULL DEFAULT '00:00',
      end_time TEXT NOT NULL DEFAULT '00:00',
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
      status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed','rescheduled','missed')),
      color TEXT,
      reminder INTEGER,
      recurrence_rule TEXT,
      parent_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
      notes TEXT DEFAULT '',
      original_start_date TEXT,
      original_end_date TEXT,
      original_start_time TEXT,
      original_end_time TEXT,
      is_all_day INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_start ON tasks(start_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id);

    CREATE TABLE IF NOT EXISTS task_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      previous_schedule TEXT,
      new_schedule TEXT,
      change_type TEXT NOT NULL,
      reason TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_history_task ON task_history(task_id);

    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily','weekly','custom')),
      custom_schedule TEXT,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS habit_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      completion_date TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 1,
      UNIQUE (habit_id, completion_date)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      category TEXT DEFAULT 'General',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      linked_goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
      linked_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      scheduled_at TEXT NOT NULL,
      reminder_type TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      fired INTEGER NOT NULL DEFAULT 0,
      UNIQUE (task_id, reminder_type)
    );

    INSERT OR IGNORE INTO categories (name, color, icon) VALUES
      ('Study', '#701F39', 'book'),
      ('Work', '#87334F', 'briefcase'),
      ('Personal', '#D88AA6', 'heart'),
      ('Health & Fitness', '#4C7A5C', 'activity'),
      ('Family', '#C77D99', 'users'),
      ('Projects', '#5B5F97', 'folder'),
      ('Other', '#947584', 'circle');

    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('theme', 'dark-red'),
      ('displayName', ''),
      ('weekStart', 'monday'),
      ('timeFormat', '24h'),
      ('dateFormat', 'YYYY-MM-DD'),
      ('notificationsEnabled', 'true'),
      ('defaultReminder', '10');
    `
  },
  {
    version: 2,
    sql: `
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT 'dark-red',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    `
  },
  {
    // RECURRENCE: materialized occurrences + series rescheduling metadata.
    // A recurring task (recurrence_rule NOT NULL) is a SERIES; each scheduled
    // date becomes one row in task_occurrences, which is what the UI displays,
    // completes, misses and reschedules. Completion of one occurrence never
    // touches other occurrences. Rescheduling keeps history in original_*
    // columns and reschedule notes.
    version: 3,
    sql: `
    CREATE TABLE IF NOT EXISTS task_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      occurrence_date TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      status TEXT NOT NULL DEFAULT 'not_started',
      completed_at TEXT,
      original_start_date TEXT,
      original_start_time TEXT,
      reschedule_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      account_id INTEGER,
      UNIQUE(series_id, occurrence_date)
    );
    CREATE INDEX IF NOT EXISTS idx_occ_series ON task_occurrences(series_id, occurrence_date);
    CREATE INDEX IF NOT EXISTS idx_occ_date ON task_occurrences(occurrence_date);
    CREATE INDEX IF NOT EXISTS idx_occ_account ON task_occurrences(account_id);

    CREATE TABLE IF NOT EXISTS habit_migration_log (
      habit_id INTEGER PRIMARY KEY,
      task_id INTEGER NOT NULL,
      migrated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    `
  }
];

/** Add a column to a table if it does not already exist (SQLite has no ADD COLUMN IF NOT EXISTS). */
function ensureColumn(db: WebDatabase, table: string, column: string, ddl: string) {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

export function runMigrations(db: WebDatabase): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`);
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  const current = row ? row.version : 0;
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      const tx = db.transaction(() => {
        db.exec(m.sql);
        if (row) db.prepare('UPDATE schema_version SET version = ?').run(m.version);
        else db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version);
      });
      tx();
    }
  }

  // Per-account data columns (added outside the versioned migration so they are
  // idempotent even on databases created before multi-account support).
  ensureColumn(db, 'tasks', 'account_id', 'account_id INTEGER');
  ensureColumn(db, 'goals', 'account_id', 'account_id INTEGER');
  ensureColumn(db, 'habits', 'account_id', 'account_id INTEGER');
  ensureColumn(db, 'notes', 'account_id', 'account_id INTEGER');
  ensureColumn(db, 'habit_completions', 'account_id', 'account_id INTEGER');
  ensureColumn(db, 'task_history', 'account_id', 'account_id INTEGER');
  ensureColumn(db, 'milestones', 'account_id', 'account_id INTEGER');

  migrateHabitsToTasks(db);

  return (db.prepare('SELECT version FROM schema_version').get() as { version: number }).version;
}

/**
 * HABITS -> RECURRING TASKS (idempotent, non-destructive).
 *
 * Every habit not yet migrated becomes a recurring task series in the normal
 * `tasks` table; each past completion becomes a completed occurrence row so
 * history is preserved. Habit rows are KEPT, marked is_active = 0.
 */
function migrateHabitsToTasks(db: WebDatabase): void {
  const habitCols = (db.prepare('PRAGMA table_info(habits)').all() as any[]).map(c => c.name);
  if (!habitCols.length) return; // fresh database without habits table
  const habits = db.prepare('SELECT * FROM habits').all() as any[];
  const done = new Set((db.prepare('SELECT habit_id FROM habit_migration_log').all() as any[]).map(r => r.habit_id));
  const pending = habits.filter(h => !done.has(h.id));
  if (!pending.length) return;

  const occCols = (db.prepare('PRAGMA table_info(task_occurrences)').all() as any[]).map(c => c.name);
  if (!occCols.length) return; // occurrence table created elsewhere first run

  const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const todayISO = new Date().toISOString().slice(0, 10);

  const insertTask = db.prepare(
    `INSERT INTO tasks (title, description, start_date, end_date, start_time, end_time,
      priority, status, color, reminder, recurrence_rule, goal_id, notes, is_all_day,
      original_start_date, original_end_date, original_start_time, original_end_time, account_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,'',0,?,?,?,?,?)`);
  const insertOcc = db.prepare(
    `INSERT OR IGNORE INTO task_occurrences (series_id, occurrence_date, start_date, end_date, start_time, end_time,
      status, completed_at, original_start_date, original_start_time, account_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const logIt = db.prepare('INSERT OR IGNORE INTO habit_migration_log (habit_id, task_id) VALUES (?,?)');

  for (const h of pending) {
    let rule: any;
    if (h.frequency === 'daily') {
      rule = { freq: 'daily', end: 'never' };
    } else {
      const days: number[] = [];
      if (h.custom_schedule) {
        for (const part of String(h.custom_schedule).toLowerCase().split(/[\s,]+/)) {
          const k = part.slice(0, 3);
          if (k in DAY_INDEX) days.push(DAY_INDEX[k]);
        }
      }
      if (!days.length) days.push(new Date(todayISO + 'T00:00:00').getDay());
      rule = { freq: 'custom', weekdays: [...new Set(days)].sort((a, b) => a - b), end: 'never' };
    }

    const completions = (db.prepare(
      'SELECT completion_date FROM habit_completions WHERE habit_id = ? AND is_completed = 1 ORDER BY completion_date')
      .all(h.id) as any[]).map(r => r.completion_date);
    const seriesStart = completions.length ? completions[0] : todayISO;

    const info = insertTask.run(
      h.title, h.description ?? '', seriesStart, seriesStart, '08:00', '08:30',
      'medium', 'not_started', h.color ?? null, 10, JSON.stringify(rule),
      seriesStart, seriesStart, '08:00', '08:30', h.account_id ?? null
    );
    const taskId = Number(info.lastInsertRowid);

    for (const d of completions) {
      insertOcc.run(taskId, d, d, d, '08:00', '08:30', 'completed',
        new Date().toISOString(), null, null, h.account_id ?? null);
    }
    logIt.run(h.id, taskId);
    if (habitCols.includes('is_active')) db.prepare('UPDATE habits SET is_active = 0 WHERE id = ?').run(h.id);
  }
}
