/**
 * The `window.api` the UI talks to.
 *
 * On the desktop this was an Electron preload bridge (ipcRenderer.invoke). Here
 * the same method names call the browser handlers directly, so every page and
 * component works without changes. Results keep the { ok, data, error } shape
 * the UI already relies on.
 */
import { createHandlers, setNotificationScheduler, type Repos } from './desktopHandlers';
import { TaskRepository } from '@/db/repositories/taskRepository';
import { GoalRepository } from '@/db/repositories/goalRepository';
import { HabitRepository } from '@/db/repositories/habitRepository';
import { NoteRepository, SettingsRepository } from '@/db/repositories/miscRepositories';
import { WebDatabase } from '@/db/webDatabase';
import { runMigrations } from '@/db/migrations';
import { loadDatabaseBytes, saveDatabaseBytes, clearStoredDatabase } from '@/db/persistence';
import { ReminderService } from './reminders';
import type { ApiBridge } from '@/types';

let db: WebDatabase | null = null;
let repos: Repos | null = null;
let handlers: ReturnType<typeof createHandlers> | null = null;
let reminders: ReminderService | null = null;
let saveTimer: number | null = null;

const SEED_URL = new URL('../data/seed.json', import.meta.url).href;

/** Writes the current database to browser storage (debounced). */
function scheduleSave() {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { void flushSave(); }, 400);
}

export async function flushSave(): Promise<void> {
  if (saveTimer) { window.clearTimeout(saveTimer); saveTimer = null; }
  if (!db) return;
  try {
    await saveDatabaseBytes(db.export());
  } catch (err) {
    console.error('Saving failed:', err);
  }
}

/** Fills an empty database from the data exported out of the desktop app. */
async function importSeedIfEmpty(d: WebDatabase, r: Repos) {
  const tasks = (d.prepare('SELECT COUNT(*) AS n FROM tasks').get() as any).n as number;
  const goals = (d.prepare('SELECT COUNT(*) AS n FROM goals').get() as any).n as number;
  const notes = (d.prepare('SELECT COUNT(*) AS n FROM notes').get() as any).n as number;
  const settingCount = (d.prepare('SELECT COUNT(*) AS n FROM settings').get() as any).n as number;
  if (tasks > 0 || goals > 0 || notes > 0) return false;

  let seed: any;
  try {
    const res = await fetch(SEED_URL);
    if (!res.ok) return false;
    seed = await res.json();
  } catch {
    return false;
  }
  if (!seed?.tables) return false;

  const cat = d.prepare('SELECT COUNT(*) AS n FROM categories').get() as any;
  const hasCategories = cat.n > 0;

  d.transaction(() => {
    if (!hasCategories) {
      for (const c of seed.tables.categories ?? []) {
        d.prepare('INSERT OR IGNORE INTO categories (name, color, icon) VALUES (?,?,?)').run(c.name, c.color, c.icon);
      }
    }

    // Inserts run in dependency order (parents before children) because
    // foreign keys are enforced: categories -> goals -> milestones -> tasks ->
    // occurrences -> history -> habits -> completions -> notes -> settings.

    for (const g of seed.tables.goals ?? []) {
      insert(d, 'goals',
        ['id', 'title', 'description', 'start_date', 'target_date', 'progress', 'status', 'category', 'priority', 'created_at', 'updated_at'],
        g, 'INSERT OR REPLACE');
    }
    for (const m of seed.tables.milestones ?? []) {
      insert(d, 'milestones', ['id', 'goal_id', 'title', 'target_date', 'is_completed'], m, 'INSERT OR REPLACE');
    }

    // Parent tasks first, then children that reference them.
    const all = seed.tables.tasks ?? [];
    const ordered: any[] = [...all.filter((t: any) => !t.parent_task_id), ...all.filter((t: any) => t.parent_task_id)];
    for (const t of ordered) {
      insert(d, 'tasks',
        ['id', 'title', 'description', 'start_date', 'end_date', 'start_time', 'end_time', 'category_id', 'priority',
         'status', 'color', 'reminder', 'recurrence_rule', 'parent_task_id', 'goal_id', 'notes',
         'original_start_date', 'original_end_date', 'original_start_time', 'original_end_time', 'is_all_day',
         'created_at', 'updated_at', 'completed_at'],
        t, 'INSERT OR REPLACE');
    }
    for (const o of seed.tables.task_occurrences ?? []) {
      insert(d, 'task_occurrences',
        ['id', 'series_id', 'occurrence_date', 'start_date', 'end_date', 'start_time', 'end_time', 'status',
         'completed_at', 'original_start_date', 'original_start_time', 'reschedule_note'],
        { ...o, reschedule_note: o.reschedule_note ?? null }, 'INSERT OR REPLACE');
    }
    for (const h of seed.tables.task_history ?? []) {
      insert(d, 'task_history',
        ['id', 'task_id', 'previous_schedule', 'new_schedule', 'change_type', 'reason', 'changed_at'], h, 'INSERT OR REPLACE');
    }
    for (const h of seed.tables.habits ?? []) {
      insert(d, 'habits',
        ['id', 'title', 'description', 'frequency', 'custom_schedule', 'color', 'created_at', 'is_active'], h, 'INSERT OR REPLACE');
    }
    for (const hc of seed.tables.habit_completions ?? []) {
      insert(d, 'habit_completions', ['id', 'habit_id', 'completion_date', 'is_completed'], hc, 'INSERT OR IGNORE');
    }
    for (const n of seed.tables.notes ?? []) {
      insert(d, 'notes',
        ['id', 'title', 'content', 'category', 'is_pinned', 'linked_goal_id', 'linked_task_id', 'created_at', 'updated_at'],
        n, 'INSERT OR REPLACE');
    }
    for (const s of seed.tables.settings ?? []) {
      insert(d, 'settings', ['key', 'value'], s, 'INSERT OR REPLACE');
    }

    // Keep AUTOINCREMENT counters ahead of the restored rows.
    for (const t of ['tasks', 'goals', 'notes', 'habits', 'milestones', 'task_history', 'task_occurrences', 'habit_completions', 'categories']) {
      const ok = d.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name=?").get(t);
      if (ok) d.prepare('UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM ' + t + ') WHERE name = ?').run(t);
    }
  })();
  return true;
}


/** Builds an insert whose placeholders are derived from the column list. */
function insert(d: WebDatabase, table: string, cols: string[], row: Record<string, any>, mode = 'INSERT OR REPLACE') {
  const marks = cols.map(() => '?').join(',');
  const values = cols.map((k) => (row[k] === undefined ? null : row[k]));
  d.prepare(`${mode} INTO ${table} (${cols.join(',')}) VALUES (${marks})`).run(...values);
}

/** Opens (or creates) the planner database and wires everything up. */
export async function initPlanner(): Promise<void> {
  if (db) return;

  const saved = await loadDatabaseBytes();
  db = await WebDatabase.open(saved);
  runMigrations(db);

  repos = {
    tasks: new TaskRepository(db),
    goals: new GoalRepository(db),
    habits: new HabitRepository(db),
    notes: new NoteRepository(db),
    settings: new SettingsRepository(db)
  };

  if (!saved) {
    const seeded = await importSeedIfEmpty(db, repos);
    if (seeded) {
      // Materialise recurring occurrences immediately so the Calendar and
      // Statistics have something to show on the very first visit.
      try {
        repos.tasks.occurrences().expandAll();
        repos.tasks.occurrences().markMissed();
      } catch { /* demo data still works without occurrences */ }
      await flushSave();
    } else {
      scheduleSave();
    }
  }

  handlers = createHandlers(db, repos);
  reminders = new ReminderService(db, repos);
  setNotificationScheduler(reminders);
  reminders.start();
}

/** Wraps a handler call in the { ok, data, error } shape the UI expects. */
function call<T = any>(name: string, payload: any = {}): Promise<{ ok: boolean; data?: T; error?: string }> {
  return new Promise(resolve => {
    if (!handlers) {
      resolve({ ok: false, error: 'The planner is still loading. Please wait a moment.' });
      return;
    }
    const fn = (handlers as any)[name];
    if (typeof fn !== 'function') {
      resolve({ ok: false, error: `Unknown action: ${name}` });
      return;
    }
    // Run asynchronously so the UI stays responsive, then persist any change.
    Promise.resolve()
      .then(() => fn(payload ?? {}))
      .then(data => {
        scheduleSave();
        reminders?.sync();
        resolve({ ok: true, data });
      })
      .catch((err: any) => resolve({ ok: false, error: err?.message ?? String(err) }));
  });
}

export function buildApi(): ApiBridge {
  return {
    /* tasks */
    tasksCreate: (p) => call('tasks:create', p),
    tasksUpdate: (p) => call('tasks:update', p),
    tasksReschedule: (p) => call('tasks:reschedule', p),
    tasksSetStatus: (p) => call('tasks:setStatus', p),
    tasksDelete: (id) => call('tasks:delete', { id }),
    tasksGet: (id) => call('tasks:get', { id }),
    tasksByDate: (date) => call('tasks:byDate', { date }),
    tasksByDateRange: (from, to) => call('tasks:byDateRange', { from, to }),
    tasksOverdue: (today) => call('tasks:overdue', { today }),
    tasksRescheduledList: () => call('tasks:rescheduledList'),
    tasksUpcoming: (today, limit) => call('tasks:upcoming', { today, limit }),
    tasksFilter: (p) => call('tasks:filter', p),
    tasksSearch: (query) => call('tasks:search', { query }),
    tasksHistory: (id) => call('tasks:history', { id }),
    tasksOverlaps: (p) => call('tasks:overlaps', p),

    /* recurring-task occurrences */
    occurrencesRange: (from, to) => call('occurrences:range', { from, to }),
    occurrencesForSeries: (seriesId) => call('occurrences:forSeries', { seriesId }),
    occurrencesSetStatus: (id, status) => call('occurrences:setStatus', { id, status }),
    occurrencesReschedule: (p) => call('occurrences:reschedule', p),
    occurrencesRescheduleSeries: (p) => call('occurrences:rescheduleSeries', p),
    occurrencesDelete: (id) => call('occurrences:delete', { id }),
    occurrencesDeleteSeries: (seriesId) => call('occurrences:deleteSeries', { seriesId }),

    /* goals */
    goalsCreate: (p) => call('goals:create', p),
    goalsList: () => call('goals:list'),
    goalsGet: (id) => call('goals:get', { id }),
    goalsUpdate: (p) => call('goals:update', p),
    goalsDelete: (id) => call('goals:delete', { id }),
    goalsAddMilestone: (p) => call('goals:addMilestone', p),
    goalsToggleMilestone: (p) => call('goals:toggleMilestone', p),
    goalsDeleteMilestone: (id) => call('goals:deleteMilestone', { id }),
    goalsRecalc: (id) => call('goals:recalc', { id }),

    /* notes & categories */
    notesCreate: (p) => call('notes:create', p),
    notesList: (search) => call('notes:list', { search }),
    notesUpdate: (p) => call('notes:update', p),
    notesDelete: (id) => call('notes:delete', { id }),

    /* settings & stats */
    settingsGetAll: () => call('settings:getAll'),
    settingsSet: (key, value) => call('settings:set', { key, value }),
    statsRange: (from, to) => call('stats:range', { from, to }),
    statsDaily: (from, to) => call('stats:daily', { from, to }),
    statsGoalCounts: () => call('stats:goalCounts'),
    statsGoalDistribution: (p) => call('stats:goalDistribution', p),
    statsDailyGoalCompletion: (p) => call('stats:dailyGoalCompletion', p),
    statsDashboard: (p) => call('stats:dashboard', p),

    /* backup */
    backupExportJson: () => call('backup:exportJson'),
    backupImportJson: (mode) => call('backup:importJson', { mode }),
    backupCopyDb: () => call('backup:downloadDb'),
    backupResetData: () => call('backup:resetData'),

    /* app */
    appInfo: () => call('app:info'),

    /* search & reminders */
    searchAll: (query) => call('search:all', { query }),
    notificationsList: () => call('notifications:list'),
    notificationsUnreadCount: () => call('notifications:unreadCount')
  } as ApiBridge;
}

/** Wipes the planner and re-seeds the starting data. */
export async function resetEverything(): Promise<void> {
  await clearStoredDatabase();
  db = null;
  repos = null;
  handlers = null;
  window.location.reload();
}

export { clearStoredDatabase };
