/**
 * The planner's operations, running in the browser.
 *
 * The original IPC handler layer with three changes:
 *   1. Electron/IPC plumbing replaced by plain function calls.
 *   2. Account and password logic removed - one personal workspace.
 *   3. Native file dialogs replaced by browser downloads / file inputs.
 *
 * Validation, overlap checks, reschedule history, recurrence expansion and
 * statistics are unchanged.
 */
import { TaskRepository } from '@/db/repositories/taskRepository';
import { GoalRepository } from '@/db/repositories/goalRepository';
import { HabitRepository } from '@/db/repositories/habitRepository';
import { NoteRepository, SettingsRepository } from '@/db/repositories/miscRepositories';
import type { WebDatabase } from '@/db/webDatabase';
import { downloadFile, pickFile } from './browserFiles';

export interface Repos {
  tasks: TaskRepository;
  goals: GoalRepository;
  habits: HabitRepository;
  notes: NoteRepository;
  settings: SettingsRepository;
}

const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${name} must be a non-empty string`);
  return v.trim();
};

/** Hook so the notification scheduler can resync reminders after task changes. */
export const schedulerHooks = { syncAfterChange: (_taskId: number) => {} };
export function setNotificationScheduler(h: { syncAfterChange: (id: number) => void }) {
  schedulerHooks.syncAfterChange = (id) => { try { h.syncAfterChange(id); } catch { /* never break saving */ } };
}
const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
const optStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function overlaps(tasks: TaskRepository, startDate: string, endDate: string, startTime: string, endTime: string, excludeId?: number) {
  const all = tasks.findByDateRange(startDate, endDate);
  return all.filter(t => {
    if (excludeId && t.id === excludeId) return false;
    if (t.status === 'completed') return false;
    if (endDate < t.start_date || startDate > t.end_date) return false;
    if (startDate === endDate && t.start_date === t.end_date) {
      return startTime < t.end_time && endTime > t.start_time;
    }
    return true;
  });
}


export function createHandlers(db: WebDatabase, repos: Repos) {
  /**
   * Each channel becomes a plain method. Errors propagate as exceptions so the
   * API layer can wrap them in the same { ok, error } result the UI expects.
   */
  const handlers: Record<string, (payload: any) => unknown> = {};
  const handle = (chan: string, fn: (payload: any) => unknown) => {
    handlers[chan] = fn;
  };

  // ── RECURRENCES / OCCURRENCES ─────────────────────────────────
  /** Expand + mark missed before any read path that can show occurrences. */
  const occReady = () => { repos.tasks.occurrences().expandAll(); repos.tasks.occurrences().markMissed(); };

  handle('occurrences:range', (p) => { occReady(); return repos.tasks.occurrences().findInRange(str(p.from, 'from'), str(p.to, 'to')); });
  handle('occurrences:forSeries', (p) => { occReady(); return repos.tasks.occurrences().findForSeries(num(p.seriesId)!); });
  handle('occurrences:setStatus', (p) => {
    const id = num(p.id)!;
    const valid = ['not_started', 'in_progress', 'completed', 'missed', 'rescheduled'];
    if (!valid.includes(p.status)) throw new Error('invalid status');
    repos.tasks.occurrences().setOccurrenceStatus(id, p.status);
    queueMicrotask(() => schedulerHooks.syncAfterChange(id));
    return true;
  });
  handle('occurrences:reschedule', (p) => {
    const id = num(p.id);
    if (!id) throw new Error('id is required');
    const startDate = str(p.startDate, 'startDate');
    const endDate = str(p.endDate ?? startDate, 'endDate');
    if (endDate < startDate) throw new Error('End date cannot be before start date');
    const startTime = str(p.startTime, 'startTime');
    const endTime = str(p.endTime, 'endTime');
    if (startDate === endDate && endTime <= startTime) throw new Error('End time must be later than start time');
    repos.tasks.occurrences().rescheduleOccurrence(id, startDate, endDate, startTime, endTime, p.reason);
    queueMicrotask(() => schedulerHooks.syncAfterChange(id));
    return true;
  });
  handle('occurrences:rescheduleSeries', (p) => {
    const seriesId = num(p.seriesId);
    if (!seriesId) throw new Error('seriesId is required');
    const startDate = str(p.startDate, 'startDate');
    const startTime = str(p.startTime, 'startTime');
    const endTime = str(p.endTime, 'endTime');
    if (endTime <= startTime) throw new Error('End time must be later than start time');
    repos.tasks.occurrences().rescheduleSeries(seriesId, startDate, startTime, endTime, p.reason);
    queueMicrotask(() => schedulerHooks.syncAfterChange(seriesId));
    return true;
  });
  handle('occurrences:delete', (p) => { repos.tasks.occurrences().deleteOccurrence(num(p.id)!); return true; });
  handle('occurrences:deleteSeries', (p) => { repos.tasks.occurrences().deleteSeries(num(p.seriesId)!); return true; });

  /* ---------------- TASKS ---------------- */
  handle('tasks:create', (p) => {
    const title = str(p.title, 'title');
    const startDate = str(p.startDate, 'startDate');
    const endDate = str(p.endDate ?? startDate, 'endDate');
    if (endDate < startDate) throw new Error('End date cannot be before start date');
    const startTime = str(p.startTime ?? '00:00', 'startTime');
    const endTime = str(p.endTime ?? '23:59', 'endTime');
    if (startDate === endDate && endTime <= startTime) throw new Error('End time must be later than start time');
    const task = repos.tasks.create({
      title, description: p.description ?? '', start_date: startDate, end_date: endDate,
      start_time: startTime, end_time: endTime,
      category_id: num(p.categoryId), priority: p.priority ?? 'medium', status: 'not_started',
      color: optStr(p.color), reminder: num(p.reminder), recurrence_rule: optStr(p.recurrenceRule),
      goal_id: num(p.goalId), notes: p.notes ?? '', is_all_day: p.isAllDay ? 1 : 0
    });
    repos.tasks.addHistory({ task_id: task.id, previous_schedule: null,
      new_schedule: JSON.stringify({ startDate, endDate, startTime, endTime }), change_type: 'created', reason: null });
    const overlapsList = overlaps(repos.tasks, startDate, endDate, startTime, endTime, task.id);
    queueMicrotask(() => schedulerHooks.syncAfterChange(task.id));
    return { task, overlaps: overlapsList.map(t => ({ id: t.id, title: t.title })) };
  });

  handle('tasks:update', (p) => {
    const id = num(p.id); if (!id) throw new Error('id is required');
    const before = repos.tasks.getById(id);
    if (!before) throw new Error('Task not found');
    const startDate = str(p.startDate ?? before.start_date, 'startDate');
    const endDate = str(p.endDate ?? before.end_date, 'endDate');
    if (endDate < startDate) throw new Error('End date cannot be before start date');
    const startTime = str(p.startTime ?? before.start_time, 'startTime');
    const endTime = str(p.endTime ?? before.end_time, 'endTime');
    if (startDate === endDate && endTime <= startTime) throw new Error('End time must be later than start time');
    const updated = repos.tasks.update(id, {
      title: p.title ?? before.title,
      description: p.description ?? before.description,
      start_date: startDate, end_date: endDate, start_time: startTime, end_time: endTime,
      category_id: p.categoryId === undefined ? before.category_id : num(p.categoryId),
      priority: p.priority ?? before.priority,
      color: p.color === undefined ? before.color : optStr(p.color),
      reminder: p.reminder === undefined ? before.reminder : num(p.reminder),
      goal_id: p.goalId === undefined ? before.goal_id : num(p.goalId),
      notes: p.notes ?? before.notes,
      updated_at: new Date().toISOString()
    });
    const scheduleChanged = startDate !== before.start_date || endDate !== before.end_date ||
      startTime !== before.start_time || endTime !== before.end_time;
    if (scheduleChanged) {
      repos.tasks.addHistory({
        task_id: id,
        previous_schedule: JSON.stringify({ startDate: before.start_date, endDate: before.end_date, startTime: before.start_time, endTime: before.end_time }),
        new_schedule: JSON.stringify({ startDate, endDate, startTime, endTime }),
        change_type: 'schedule_changed', reason: optStr(p.reason)
      });
    }
    const overlapsList = overlaps(repos.tasks, startDate, endDate, startTime, endTime, id);
    queueMicrotask(() => schedulerHooks.syncAfterChange(id));
    return { task: updated, scheduleChanged, overlaps: overlapsList.map(t => ({ id: t.id, title: t.title })) };
  });

  handle('tasks:reschedule', (p) => {
    const id = num(p.id); if (!id) throw new Error('id is required');
    const before = repos.tasks.getById(id);
    if (!before) throw new Error('Task not found');
    const startDate = str(p.startDate, 'startDate');
    const endDate = str(p.endDate ?? startDate, 'endDate');
    if (endDate < startDate) throw new Error('End date cannot be before start date');
    const startTime = str(p.startTime, 'startTime');
    const endTime = str(p.endTime, 'endTime');
    if (startDate === endDate && endTime <= startTime) throw new Error('End time must be later than start time');
    const prev = JSON.stringify({ startDate: before.start_date, endDate: before.end_date, startTime: before.start_time, endTime: before.end_time });
    const next = JSON.stringify({ startDate, endDate, startTime, endTime });
    // Transaction: update task, preserve original schedule, record history
    const tx = db.transaction(() => {
      repos.tasks.update(id, {
        start_date: startDate, end_date: endDate, start_time: startTime, end_time: endTime,
        status: 'rescheduled', updated_at: new Date().toISOString(),
        original_start_date: before.original_start_date ?? before.start_date,
        original_end_date: before.original_end_date ?? before.end_date,
        original_start_time: before.original_start_time ?? before.start_time,
        original_end_time: before.original_end_time ?? before.end_time
      });
      repos.tasks.addHistory({ task_id: id, previous_schedule: prev, new_schedule: next,
        change_type: 'rescheduled', reason: optStr(p.reason) });
    });
    tx();
    queueMicrotask(() => schedulerHooks.syncAfterChange(id));
    return repos.tasks.getById(id);
  });

  handle('tasks:setStatus', (p) => {
    const id = num(p.id); if (!id) throw new Error('id is required');
    const valid = ['not_started', 'in_progress', 'completed', 'rescheduled', 'missed'];
    if (!valid.includes(p.status)) throw new Error('invalid status');
    const before = repos.tasks.getById(id);
    if (!before) throw new Error('Task not found');
    repos.tasks.setStatus(id, p.status);
    repos.tasks.addHistory({ task_id: id, previous_schedule: before.status, new_schedule: p.status,
      change_type: 'status_changed', reason: optStr(p.reason) });
    if (before.goal_id) repos.goals.recalcProgress(before.goal_id);
    queueMicrotask(() => schedulerHooks.syncAfterChange(id));
    return repos.tasks.getById(id);
  });

  handle('tasks:delete', (p) => { repos.tasks.delete(num(p.id)!); return true; });
  handle('tasks:get', (p) => {
    const t = repos.tasks.getById(num(p.id)!);
    if (!t) throw new Error('Task not found');
    return { ...t, history: repos.tasks.getHistory(t.id) };
  });
  handle('tasks:byDate', (p) => repos.tasks.findByDate(str(p.date, 'date')));
  handle('tasks:byDateRange', (p) => repos.tasks.findByDateRange(str(p.from, 'from'), str(p.to, 'to')));
  handle('tasks:overdue', (p) => repos.tasks.findOverdue(str(p.today, 'today')));
  handle('tasks:rescheduledList', () => repos.tasks.findRescheduled());
  handle('tasks:upcoming', (p) => repos.tasks.findUpcoming(str(p.today, 'today'), num(p.limit) ?? 10));
  handle('tasks:filter', (p) => repos.tasks.filter(p));
  handle('tasks:search', (p) => repos.tasks.search(str(p.query, 'query')));
  handle('tasks:history', (p) => repos.tasks.getHistory(num(p.id)!));
  handle('tasks:overlaps', (p) => overlaps(repos.tasks, str(p.startDate, 'startDate'), str(p.endDate, 'endDate'),
    str(p.startTime, 'startTime'), str(p.endTime, 'endTime'), num(p.excludeId) ?? undefined));

  /* ---------------- GOALS ---------------- */
  handle('goals:create', (p) => {
    const g = repos.goals.create({
      title: str(p.title, 'title'), description: p.description ?? '',
      start_date: str(p.startDate, 'startDate'), target_date: str(p.targetDate, 'targetDate'),
      category: p.category ?? 'Other', priority: p.priority ?? 'medium'
    });
    for (const m of (p.milestones ?? [])) repos.goals.addMilestone(g!.id, m.title, m.targetDate);
    return repos.goals.getById(g!.id);
  });
  handle('goals:list', () => repos.goals.list());
  handle('goals:get', (p) => repos.goals.getById(num(p.id)!));
  handle('goals:update', (p) => repos.goals.update(num(p.id)!, p));
  handle('goals:delete', (p) => { repos.goals.delete(num(p.id)!); return true; });
  handle('goals:addMilestone', (p) => repos.goals.addMilestone(num(p.goalId)!, str(p.title, 'title'), optStr(p.targetDate) ?? undefined));
  handle('goals:toggleMilestone', (p) => {
    const goalId = repos.goals.toggleMilestone(num(p.id)!, !!p.done);
    if (goalId) repos.goals.recalcProgress(goalId);
    return repos.goals.getById(goalId);
  });
  handle('goals:deleteMilestone', (p) => { repos.goals.deleteMilestone(num(p.id)!); return true; });
  handle('goals:recalc', (p) => repos.goals.recalcProgress(num(p.id)!));

  /* ---------------- HABITS (UI removed — data kept, handlers kept for back-compat) ---------------- */
  handle('habits:create', (p) => repos.habits.create({
    title: str(p.title, 'title'), description: p.description ?? '',
    frequency: p.frequency ?? 'daily', custom_schedule: optStr(p.customSchedule) ?? undefined,
    color: optStr(p.color) ?? undefined
  }));
  handle('habits:list', () => repos.habits.listActive());
  handle('habits:update', (p) => repos.habits.update(num(p.id)!, p));
  handle('habits:delete', (p) => { repos.habits.delete(num(p.id)!); return true; });
  handle('habits:setCompletion', (p) => {
    repos.habits.setCompletion(num(p.id)!, str(p.date, 'date'), !!p.done);
    return repos.habits.getById(num(p.id)!);
  });
  handle('habits:completions', (p) => repos.habits.getCompletions(num(p.id)!, str(p.from, 'from'), str(p.to, 'to')));
  handle('habits:streak', (p) => repos.habits.streak(num(p.id)!));
  handle('habits:monthlyStats', (p) => repos.habits.monthlyStats(num(p.id)!, num(p.year)!, num(p.month)!));

  /* ---------------- NOTES / CATEGORIES ---------------- */
  handle('notes:create', (p) => repos.notes.create({
    title: str(p.title, 'title'), content: p.content ?? '', category: p.category ?? 'General',
    is_pinned: !!p.isPinned, linked_goal_id: num(p.goalId), linked_task_id: num(p.taskId)
  }));
  handle('notes:list', (p) => repos.notes.list(optStr(p?.search) ?? undefined));
  handle('notes:update', (p) => repos.notes.update(num(p.id)!, p));
  handle('notes:delete', (p) => { repos.notes.delete(num(p.id)!); return true; });
  handle('categories:list', () => []);
  handle('categories:create', (p) => { throw new Error('Categories were removed from My Planner'); });
  handle('categories:delete', () => true);

  /* ---------------- SETTINGS / STATS ---------------- */
  handle('settings:getAll', () => {
    return repos.settings.all();
  });
  handle('settings:set', (p) => { repos.settings.set(str(p.key, 'key'), String(p.value ?? '')); return true; });

  /** Search across the current account's tasks, goals, habits and notes. */
  handle('search:all', (p) => {
    const q = str(p.query, 'query');
    const like = `%${q}%`;
    const tasks = repos.tasks.search(q).slice(0, 6).map(t => ({ type: 'Task', id: t.id, title: t.title, date: t.start_date, status: t.status }));
    const goals = db.prepare(`SELECT id, title, status FROM goals WHERE title LIKE ? OR description LIKE ? LIMIT 5`).all(like, like);
    const habits = db.prepare(`SELECT id, title FROM habits WHERE title LIKE ? AND is_active = 1 LIMIT 5`).all(like);
    const notes = db.prepare(`SELECT id, title, category FROM notes WHERE title LIKE ? OR content LIKE ? LIMIT 5`).all(like, like);
    return { tasks, goals, habits, notes };
  });

  /** Unread reminder count for the bell icon. */
  handle('notifications:list', () => {
    const rows = db.prepare(
      `SELECT n.id, n.task_id, n.scheduled_at, n.fired, t.title, t.status
       FROM notifications n JOIN tasks t ON t.id = n.task_id
       WHERE n.task_id IN (SELECT id FROM tasks WHERE account_id = ?)
       ORDER BY n.scheduled_at DESC LIMIT 30`).all();
    return rows;
  });

  handle('notifications:unreadCount', () => {
    const r = db.prepare(
      `SELECT COUNT(*) n FROM notifications n JOIN tasks t ON t.id = n.task_id
       WHERE n.fired = 0 AND n.is_active = 1`).get() as any;
    return r.n;
  });

  handle('stats:range', (p) => repos.tasks.statsInRange(str(p.from, 'from'), str(p.to, 'to')));
  handle('stats:daily', (p) => repos.tasks.dailyCompletion(str(p.from, 'from'), str(p.to, 'to')));
  handle('stats:goalDistribution', (p) => repos.tasks.goalDistribution(str(p.from, 'from'), str(p.to, 'to')));
  handle('stats:dailyGoalCompletion', (p) => repos.tasks.dailyGoalCompletion(str(p.from, 'from'), str(p.to, 'to'), num(p.goalId)));
  handle('stats:goalCounts', () => repos.goals.counts());
  handle('stats:dashboard', (p) => {
    const today = str(p.today, 'today');
    const dayTasks = repos.tasks.findByDate(today);
    const weekStart = str(p.weekFrom ?? today, 'weekFrom');
    const weekEnd = str(p.weekTo ?? today, 'weekTo');
    const monthStart = str(p.monthStart ?? today, 'monthStart');
    const monthEnd = str(p.monthEnd ?? today, 'monthEnd');
    const sum = (list: any[]) => ({
      total: list.length,
      completed: list.filter(t => t.status === 'completed').length,
      remaining: list.filter(t => ['not_started', 'in_progress'].includes(t.status)).length,
      missed: list.filter(t => t.status === 'missed').length,
      rescheduled: list.filter(t => t.status === 'rescheduled' || t.original_start_date).length
    });
    const pct = (s: any) => (s.total ? Math.round((s.completed / s.total) * 100) : 0);
    return {
      today: { ...sum(dayTasks), percentage: pct(sum(dayTasks)) },
      week: sum(repos.tasks.findByDateRange(weekStart, weekEnd)),
      month: sum(repos.tasks.findByDateRange(monthStart, monthEnd)),
      schedule: dayTasks,
      upcoming: repos.tasks.findUpcoming(today, 8),
      rescheduled: repos.tasks.findRescheduled().slice(0, 8),
      overdue: repos.tasks.findOverdue(today).slice(0, 8)
    };
  });

  /* ---------------- BACKUP / EXPORT ---------------- */
  const EXPORT_TABLES = ['tasks','task_history','goals','milestones','habits','habit_completions','notes','categories','settings'];

  handle('backup:exportJson', () => {
    const data: any = { app: 'my-planner', version: 2, exportedAt: new Date().toISOString(), tables: {} };
    for (const t of EXPORT_TABLES) {
      const exists = db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name=?").get(t);
      if (exists) data.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
    }
    const json = JSON.stringify(data, null, 2);
    const filename = `my-planner-backup-${new Date().toISOString().slice(0,10)}.json`;
    downloadFile(filename, json);
    return { saved: true, filename, bytes: json.length };
  });

  handle('backup:importJson', async (p) => {
    const file = await pickFile('.json,application/json');
    if (!file) return { imported: false };
    const raw = JSON.parse(await file.text());
    if (raw.app !== 'my-planner' || !raw.tables) throw new Error('Not a valid My Planner backup file');
    const mode = p.mode === 'restore' ? 'restore' : 'merge';
    const imported = { tasks: 0, goals: 0, habits: 0, notes: 0 };
    const tx = db.transaction(() => {
      if (mode === 'restore') {
        for (const t of [...EXPORT_TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
      }
      // categories (merge by name)
      for (const c of raw.tables.categories ?? []) {
        const exists = db.prepare('SELECT id FROM categories WHERE name = ?').get(c.name);
        if (!exists) db.prepare('INSERT INTO categories (name, color, icon) VALUES (?,?,?)').run(c.name, c.color, c.icon);
      }
      for (const g of raw.tables.goals ?? []) {
        if (mode === 'merge' && db.prepare('SELECT 1 FROM goals WHERE title = ? AND start_date = ?').get(g.title, g.start_date)) continue;
        db.prepare(`INSERT INTO goals (id, title, description, start_date, target_date, progress, status, category, priority, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(g.id, g.title, g.description, g.start_date, g.target_date, g.progress, g.status, g.category, g.priority, g.created_at, g.updated_at);
        imported.goals++;
      }
      for (const m of raw.tables.milestones ?? []) {
        db.prepare('INSERT OR IGNORE INTO milestones (id, goal_id, title, target_date, is_completed) VALUES (?,?,?,?,?)').run(m.id, m.goal_id, m.title, m.target_date, m.is_completed);
      }
      for (const t of raw.tables.tasks ?? []) {
        if (mode === 'merge' && db.prepare('SELECT 1 FROM tasks WHERE title = ? AND start_date = ? AND start_time = ?').get(t.title, t.start_date, t.start_time)) continue;
        db.prepare(`INSERT INTO tasks (id, title, description, start_date, end_date, start_time, end_time, category_id, priority, status, color, reminder, recurrence_rule, parent_task_id, goal_id, notes, original_start_date, original_end_date, original_start_time, original_end_time, is_all_day, created_at, updated_at, completed_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(t.id, t.title, t.description, t.start_date, t.end_date, t.start_time, t.end_time, t.category_id, t.priority, t.status, t.color, t.reminder, t.recurrence_rule, t.parent_task_id, t.goal_id, t.notes, t.original_start_date, t.original_end_date, t.original_start_time, t.original_end_time, t.is_all_day, t.created_at, t.updated_at, t.completed_at);
        imported.tasks++;
      }
      for (const h of raw.tables.task_history ?? []) {
        db.prepare('INSERT INTO task_history (id, task_id, previous_schedule, new_schedule, change_type, reason, changed_at) VALUES (?,?,?,?,?,?,?)').run(h.id, h.task_id, h.previous_schedule, h.new_schedule, h.change_type, h.reason, h.changed_at);
      }
      for (const h of raw.tables.habits ?? []) {
        db.prepare('INSERT OR IGNORE INTO habits (id, title, description, frequency, custom_schedule, color, created_at, is_active) VALUES (?,?,?,?,?,?,?,?)').run(h.id, h.title, h.description, h.frequency, h.custom_schedule, h.color, h.created_at, h.is_active);
        imported.habits++;
      }
      for (const c of raw.tables.habit_completions ?? []) {
        db.prepare('INSERT OR IGNORE INTO habit_completions (id, habit_id, completion_date, is_completed) VALUES (?,?,?,?)').run(c.id, c.habit_id, c.completion_date, c.is_completed);
      }
      for (const n of raw.tables.notes ?? []) {
        db.prepare('INSERT OR IGNORE INTO notes (id, title, content, category, is_pinned, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(n.id, n.title, n.content, n.category, n.is_pinned, n.created_at, n.updated_at);
        imported.notes++;
      }
      for (const s of raw.tables.settings ?? []) {
        if (s.key === 'lastAccountId') continue; // account feature removed
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run(s.key, s.value);
      }
      // Fix sqlite_autoincrement
      for (const t of EXPORT_TABLES) db.prepare(`UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM ${t}) WHERE name = ?`).run(t);
    });
    tx();
    return { imported: true, mode, counts: imported };
  });

  /** Download the whole SQLite file - a complete offline copy of your planner. */
  handle('backup:downloadDb', () => {
    const bytes = db.export();
    const filename = `my-planner-${new Date().toISOString().slice(0,10)}.db`;
    downloadFile(filename, new Blob([bytes as unknown as ArrayBuffer], { type: 'application/x-sqlite3' }));
    return { saved: true, filename, bytes: bytes.length };
  });

  handle('backup:resetData', () => {
    // The Settings page asks for confirmation before calling this.
    const tx = db.transaction(() => {
      for (const t of ['notifications','task_history','milestones','habit_completions','tasks','goals','habits','notes']) {
        db.prepare(`DELETE FROM ${t}`).run();
      }
    });
    tx();
    return { reset: true };
  });

  handle('app:info', () => ({
    version: '2.0.0',
    dbPath: 'Saved in this browser (IndexedDB)',
    platform: 'web'
  }));

  return handlers;
}
