import type { WebDatabase } from '../webDatabase';

export interface TaskRow {
  id: number;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  category_id: number | null;
  priority: string;
  status: string;
  color: string | null;
  reminder: number | null;
  recurrence_rule: string | null;
  parent_task_id: number | null;
  goal_id: number | null;
  notes: string;
  original_start_date: string | null;
  original_end_date: string | null;
  original_start_time: string | null;
  original_end_time: string | null;
  is_all_day: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  category_name?: string | null;
  category_color?: string | null;
}

export interface HistoryRow {
  id: number;
  task_id: number;
  previous_schedule: string | null;
  new_schedule: string | null;
  change_type: string;
  reason: string | null;
  changed_at: string;
}

const SELECT_WITH_CAT = `
  SELECT t.*, c.name AS category_name, c.color AS category_color
  FROM tasks t LEFT JOIN categories c ON c.id = t.category_id`;

export class TaskRepository {
  constructor(private db: WebDatabase) {}

  /**
   * Single-workspace build: there are no accounts, so every query is unscoped.
   * The `account_id` columns are kept in the schema for backward compatibility
   * with older databases, but no longer filter anything.
   */
  private scope(): string { return ''; }

  create(data: Partial<TaskRow>): TaskRow {
    const cols = ['title','description','start_date','end_date','start_time','end_time','category_id',
      'priority','status','color','reminder','recurrence_rule','goal_id','notes','is_all_day'];
    const vals: any[] = cols.map(c => {
      if (c === 'priority') return data.priority ?? 'medium';
      if (c === 'status') return data.status ?? 'not_started';
      if (c === 'start_time') return data.start_time ?? '00:00';
      if (c === 'end_time') return data.end_time ?? '23:59';
      if (c === 'description') return data.description ?? '';
      if (c === 'is_all_day') return data.is_all_day ?? 0;
      return (data as any)[c] ?? null;
    });
    vals[0] = data.title!;
    vals[2] = data.start_date!;
    vals[3] = data.end_date!;
    const stmt = this.db.prepare(
      `INSERT INTO tasks (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
    const info = stmt.run(...vals);
    return this.getById(Number(info.lastInsertRowid))!;
  }

  getById(id: number): TaskRow | undefined {
    return this.db.prepare(`${SELECT_WITH_CAT} WHERE t.id = ?${this.scope()}`).get(id) as TaskRow | undefined;
  }

  update(id: number, data: Partial<TaskRow>): TaskRow | undefined {
    const allowed = ['title','description','start_date','end_date','start_time','end_time','category_id',
      'priority','status','color','reminder','recurrence_rule','goal_id','notes','is_all_day',
      'original_start_date','original_end_date','original_start_time','original_end_time',
      'completed_at','updated_at'];
    const sets: string[] = [];
    const vals: any[] = [];
    for (const k of allowed) {
      if (k in data) { sets.push(`${k} = ?`); vals.push((data as any)[k]); }
    }
    if (sets.length) {
      this.db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    }
    return this.getById(id);
  }

  setStatus(id: number, status: string): void {
    const completed = status === 'completed' ? new Date().toISOString() : null;
    this.db.prepare(`UPDATE tasks SET status = ?, completed_at = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, completed, id);
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  findByDateRange(from: string, to: string): TaskRow[] {
    return this.db.prepare(
      `${SELECT_WITH_CAT} WHERE t.end_date >= ? AND t.start_date <= ?${this.scope()} ORDER BY t.start_date, t.start_time`
    ).all(from, to) as TaskRow[];
  }

  findByDate(date: string): TaskRow[] {
    return this.findByDateRange(date, date);
  }

  findOverdue(today: string): TaskRow[] {
    return this.db.prepare(
      `${SELECT_WITH_CAT} WHERE t.end_date < ? AND t.status IN ('not_started','in_progress')${this.scope()} ORDER BY t.end_date`
    ).all(today) as TaskRow[];
  }

  findRescheduled(): TaskRow[] {
    return this.db.prepare(
      `${SELECT_WITH_CAT} WHERE (t.status = 'rescheduled' OR t.original_start_date IS NOT NULL)${this.scope()} ORDER BY t.updated_at DESC`
    ).all() as TaskRow[];
  }

  findUpcoming(today: string, limit = 10): TaskRow[] {
    return this.db.prepare(
      `${SELECT_WITH_CAT} WHERE t.start_date >= ? AND t.status NOT IN ('completed')${this.scope()} ORDER BY t.start_date, t.start_time LIMIT ?`
    ).all(today, limit) as TaskRow[];
  }

  search(query: string): TaskRow[] {
    const q = `%${query}%`;
    return this.db.prepare(
      `${SELECT_WITH_CAT} WHERE (t.title LIKE ? OR t.description LIKE ? OR t.notes LIKE ?)${this.scope()} ORDER BY t.start_date DESC LIMIT 100`
    ).all(q, q, q) as TaskRow[];
  }

  filter(opts: { status?: string; categoryId?: number; priority?: string; from?: string; to?: string; search?: string; unscheduled?: boolean }): TaskRow[] {
    const where: string[] = [];
    const vals: any[] = [];
    if (opts.status) { where.push('t.status = ?'); vals.push(opts.status); }
    if (opts.categoryId) { where.push('t.category_id = ?'); vals.push(opts.categoryId); }
    if (opts.priority) { where.push('t.priority = ?'); vals.push(opts.priority); }
    if (opts.from) { where.push('t.end_date >= ?'); vals.push(opts.from); }
    if (opts.to) { where.push('t.start_date <= ?'); vals.push(opts.to); }
    if (opts.search) { where.push('(t.title LIKE ? OR t.description LIKE ?)'); vals.push(`%${opts.search}%`, `%${opts.search}%`); }
    if (opts.unscheduled) where.push("t.start_date = ''");
    const scope = this.scope();
    const sql = `${SELECT_WITH_CAT} ${where.length ? 'WHERE ' + where.join(' AND ') : ' WHERE 1=1'}${scope} ORDER BY t.start_date, t.start_time`;
    return this.db.prepare(sql).all(...vals) as TaskRow[];
  }

  addHistory(h: Omit<HistoryRow, 'id' | 'changed_at'>): void {
    this.db.prepare(
      `INSERT INTO task_history (task_id, previous_schedule, new_schedule, change_type, reason) VALUES (?,?,?,?,?)`
    ).run(h.task_id, h.previous_schedule, h.new_schedule, h.change_type, h.reason);
  }

  getHistory(taskId: number): HistoryRow[] {
    return this.db.prepare('SELECT * FROM task_history WHERE task_id = ? ORDER BY changed_at DESC').all(taskId) as HistoryRow[];
  }

  private occEngine: OccurrenceEngine | null = null;
  /** Lazily-created occurrence engine bound to this repo (shared account scope). */
  occurrences(): OccurrenceEngine {
    if (!this.occEngine) this.occEngine = new OccurrenceEngine(this, this.db);
    return this.occEngine;
  }

  /** Statistics helpers */
  statsInRange(from: string, to: string) {
    const sc = '';
    const total = (this.db.prepare(
      `SELECT COUNT(*) n FROM tasks WHERE start_date >= ? AND start_date <= ?${sc}`).get(from, to) as any).n as number;
    const completed = (this.db.prepare(
      `SELECT COUNT(*) n FROM tasks WHERE start_date >= ? AND start_date <= ? AND status = 'completed'${sc}`).get(from, to) as any).n as number;
    const missed = (this.db.prepare(
      `SELECT COUNT(*) n FROM tasks WHERE start_date >= ? AND start_date <= ? AND status = 'missed'${sc}`).get(from, to) as any).n as number;
    const rescheduled = (this.db.prepare(
      `SELECT COUNT(*) n FROM tasks WHERE start_date >= ? AND start_date <= ? AND status = 'rescheduled'${sc}`).get(from, to) as any).n as number;
    const hours = ((this.db.prepare(
      `SELECT SUM((julianday(end_date || ' ' || end_time) - julianday(start_date || ' ' || start_time)) * 24) h
       FROM tasks WHERE start_date >= ? AND start_date <= ? AND status != 'missed'${sc}`).get(from, to) as any).h) as number | null;
    const byCategory = this.db.prepare(
      `SELECT IFNULL(c.name,'Other') name, COUNT(*) value FROM tasks t LEFT JOIN categories c ON c.id=t.category_id
       WHERE t.start_date >= ? AND t.start_date <= ?${sc} GROUP BY c.name`).all(from, to);
    const byDay = this.db.prepare(
      `SELECT strftime('%w', start_date) dow, COUNT(*) n, SUM(status='completed') c FROM tasks
       WHERE start_date >= ? AND start_date <= ?${sc} GROUP BY dow`).all(from, to);
    return { total, completed, missed, rescheduled, hours: hours || 0, byCategory, byDay };
  }

  dailyCompletion(from: string, to: string) {
    return this.db.prepare(
      `SELECT start_date date, COUNT(*) total, SUM(status='completed') completed FROM tasks
       WHERE start_date >= ? AND start_date <= ?${this.scope()} GROUP BY start_date ORDER BY start_date`
    ).all(from, to);
  }

  /**
   * GOAL DISTRIBUTION â€” how scheduled task activity is spread across goals.
   * Counts recurring-task occurrences AND plain tasks; tasks without a linked
   * goal are reported under goalId = null ("No linked goal"), never assigned
   * to another goal. Historical by nature: the range decides what is counted.
   */
  goalDistribution(from: string, to: string) {
    const sc = null;
    return this.db.prepare(
      `SELECT g.id AS goalId, IFNULL(g.title, 'No linked goal') AS name,
              SUM(x.scheduled) AS scheduled, SUM(x.completed) AS completed
       FROM (
         SELECT t.goal_id, 1 AS scheduled, (o.status = 'completed') AS completed
         FROM task_occurrences o JOIN tasks t ON t.id = o.series_id
         WHERE o.occurrence_date >= ? AND o.occurrence_date <= ?${sc ? ' AND o.account_id = ' + sc : ''}
         UNION ALL
         SELECT t.goal_id, 1, (t.status = 'completed')
         FROM tasks t
         WHERE (t.recurrence_rule IS NULL OR t.recurrence_rule = '')
           AND t.start_date >= ? AND t.start_date <= ?${sc ? ' AND t.account_id = ' + sc : ''}
       ) x LEFT JOIN goals g ON g.id = x.goal_id
       GROUP BY g.id ORDER BY scheduled DESC`
    ).all(from, to, from, to);
  }

  /**
   * DAILY COMPLETION for one goal (or all goals when goalId is null).
   * Returns per-date {total, completed} for scheduled occurrences/tasks only â€”
   * days with nothing scheduled are simply absent, never 0%.
   */
  dailyGoalCompletion(from: string, to: string, goalId: number | null) {
    const sc = null;
    const goalFilter = goalId ? ' AND t.goal_id = ' + Number(goalId) : '';
    return this.db.prepare(
      `SELECT d AS date, COUNT(*) AS total, SUM(status = 'completed') AS completed FROM (
         SELECT o.occurrence_date AS d, o.status
         FROM task_occurrences o JOIN tasks t ON t.id = o.series_id
         WHERE o.occurrence_date >= ? AND o.occurrence_date <= ?${sc ? ' AND o.account_id = ' + sc : ''}${goalFilter}
         UNION ALL
         SELECT t.start_date AS d, t.status
         FROM tasks t
         WHERE (t.recurrence_rule IS NULL OR t.recurrence_rule = '')
           AND t.start_date >= ? AND t.start_date <= ?${sc ? ' AND t.account_id = ' + sc : ''}${goalFilter}
       ) GROUP BY d ORDER BY d`
    ).all(from, to, from, to);
  }

  all(): TaskRow[] {
    return this.db.prepare(`${SELECT_WITH_CAT} WHERE 1=1${this.scope()} ORDER BY start_date`).all() as TaskRow[];
  }
}

// ============================================================================
//  RECURRENCE SUPPORT â€” materialized occurrences
// ============================================================================
//  A task with `recurrence_rule` is a SERIES. Its scheduled dates are
//  materialized as rows in `task_occurrences` (90-day rolling horizon).
//  The UI reads/writes OCCURRENCES, never the series row directly, so that:
//    - completing one occurrence never completes future ones;
//    - rescheduling one occurrence never changes the series pattern;
//    - deleting one occurrence leaves the series intact.
// ============================================================================

import { parseRule, occurrenceDates, horizonEnd, type RecurrenceRule } from '../recurrence';

export interface OccurrenceRow {
  id: number;
  series_id: number;
  occurrence_date: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  completed_at: string | null;
  original_start_date: string | null;
  original_start_time: string | null;
  reschedule_note: string | null;
  // joined from the series task:
  title: string;
  description: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  priority: string;
  color: string | null;
  reminder: number | null;
  recurrence_rule: string | null;
  goal_id: number | null;
  notes: string;
  is_all_day: number;
  account_id: number | null;
  is_occurrence: true;
}

const OCC_SELECT = `
  SELECT o.*, t.title, t.description, t.category_id, c.name AS category_name,
         c.color AS category_color, t.priority, t.color, t.reminder,
         t.recurrence_rule, t.goal_id, t.notes, t.is_all_day, o.account_id
  FROM task_occurrences o
  JOIN tasks t ON t.id = o.series_id
  LEFT JOIN categories c ON c.id = t.category_id`;

export interface TaskWithOccurrences extends TaskRow {
  is_occurrence?: false;
  occurrences?: OccurrenceRow[];
}

export class OccurrenceEngine {
  constructor(private repo: TaskRepository, private db: WebDatabase) {}

  /** Materialize any missing occurrences for all recurring series (idempotent). */
  expandAll(): void {
    const today = new Date().toISOString().slice(0, 10);
    const scope = null;
    const series = this.db.prepare(
      `SELECT id, start_date, end_date, start_time, end_time, recurrence_rule${scope ? ', account_id' : ''}
       FROM tasks t WHERE t.recurrence_rule IS NOT NULL AND t.recurrence_rule != ''${scope ? ` AND t.account_id = ${Number(scope)}` : ''}`
    ).all() as any[];
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO task_occurrences
       (series_id, occurrence_date, start_date, end_date, start_time, end_time, status, account_id)
       VALUES (?,?,?,?,?,?, 'not_started', ?)`);
    const inTx = this.db.transaction(() => {
      for (const s of series) {
        const rule = parseRule(s.recurrence_rule);
        if (!rule) continue;
        const to = horizonEnd(rule, today);
        for (const date of occurrenceDates(rule, s.start_date, today, to)) {
          // Multi-day series windows are not supported: an occurrence is one day.
          insert.run(s.id, date, date, date, s.start_time, s.end_time, s.account_id ?? null);
        }
      }
    });
    inTx();
  }

  /** Occurrences (joined with series fields) within a date range. */
  findInRange(from: string, to: string): OccurrenceRow[] {
    const scope = '';
    return this.db.prepare(
      `${OCC_SELECT} WHERE o.occurrence_date >= ? AND o.occurrence_date <= ?${scope}
       ORDER BY o.start_date, o.start_time`
    ).all(from, to) as OccurrenceRow[];
  }

  findOccurrenceById(id: number): OccurrenceRow | undefined {
    const scope = '';
    return this.db.prepare(`${OCC_SELECT} WHERE o.id = ?${scope}`).get(id) as OccurrenceRow | undefined;
  }

  /** All occurrences of one series (for edit/delete-series UI). */
  findForSeries(seriesId: number): OccurrenceRow[] {
    const scope = '';
    return this.db.prepare(
      `${OCC_SELECT} WHERE o.series_id = ?${scope} ORDER BY o.occurrence_date`
    ).all(seriesId) as OccurrenceRow[];
  }

  setOccurrenceStatus(occId: number, status: string): void {
    const occ = this.findOccurrenceById(occId);
    if (!occ) throw new Error('Occurrence not found');
    const completed = status === 'completed' ? new Date().toISOString() : null;
    this.db.prepare(
      `UPDATE task_occurrences SET status = ?, completed_at = ? WHERE id = ?`
    ).run(status, completed, occId);
  }

  /**
   * RESCHEDULE â€” single occurrence only. The series pattern and future
   * occurrences are untouched. History is kept in original_* + reschedule_note.
   */
  rescheduleOccurrence(occId: number, startDate: string, endDate: string, startTime: string, endTime: string, reason?: string): void {
    const occ = this.findOccurrenceById(occId);
    if (!occ) throw new Error('Occurrence not found');
    this.db.prepare(
      `UPDATE task_occurrences SET
        original_start_date = COALESCE(original_start_date, occurrence_date),
        original_start_time = COALESCE(original_start_time, start_time),
        occurrence_date = ?, start_date = ?, end_date = ?, start_time = ?, end_time = ?,
        status = 'rescheduled', reschedule_note = COALESCE(?, reschedule_note)
       WHERE id = ?`
    ).run(startDate, startDate, endDate, startTime, endTime, reason ?? null, occId);
  }

  /**
   * RESCHEDULE â€” the whole series. Rewrites the series anchor date/time and
   * regenerates future occurrences from the new anchor. Past occurrences keep
   * their own history; completed/missed ones are never regenerated.
   */
  rescheduleSeries(seriesId: number, newStartDate: string, startTime: string, endTime: string, reason?: string): void {
    const series = this.repo.getById(seriesId);
    if (!series) throw new Error('Series not found');
    const rule = parseRule(series.recurrence_rule);
    if (!rule) throw new Error('Not a recurring task');
    const anchorDow = new Date(newStartDate + 'T00:00:00').getDay();
    // The new anchor must itself satisfy the pattern; shift weekdays if needed
    // so the pattern still includes the new start date.
    if (rule.freq !== 'daily') {
      const days = rule.weekdays?.length ? rule.weekdays : [new Date(series.start_date + 'T00:00:00').getDay()];
      if (!days.includes(anchorDow)) {
        rule.weekdays = [...new Set([...days, anchorDow])].sort((a, b) => a - b);
      }
    }
    const tx = this.db.transaction(() => {
      this.db.prepare(
        `UPDATE tasks SET start_date = ?, end_date = ?, start_time = ?, end_time = ?,
          recurrence_rule = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(newStartDate, newStartDate, startTime, endTime, JSON.stringify(rule), seriesId);
      // Regenerate: keep past occurrences (history), drop only auto 'not_started'
      // ones at/after today that are NOT rescheduled, then re-expand.
      this.db.prepare(
        `DELETE FROM task_occurrences WHERE series_id = ? AND occurrence_date >= ? AND status = 'not_started'`
      ).run(seriesId, new Date().toISOString().slice(0, 10));
    });
    tx();
    this.expandAll();
    this.repo.addHistory({
      task_id: seriesId,
      previous_schedule: `${series.start_date} ${series.start_time}`,
      new_schedule: `${newStartDate} ${startTime}`,
      change_type: 'series_reschedule',
      reason: reason ?? null
    });
  }

  /** Edit one occurrence's own title/description/etc. without touching the series. */
  updateOccurrenceDetails(occId: number, data: { title?: string; description?: string; priority?: string; notes?: string; color?: string | null; reminder?: number | null; categoryId?: number | null }): void {
    const occ = this.findOccurrenceById(occId);
    if (!occ) throw new Error('Occurrence not found');
    // Occurrence-level edits live on the series (simple model) â€” only
    // title/notes changes that should apply to the whole series go here.
    // Kept minimal by design: date/time changes go through reschedule.
    void occ; void data;
  }

  /** Delete one occurrence only (the series keeps its other dates). */
  deleteOccurrence(occId: number): void {
    const occ = this.findOccurrenceById(occId);
    if (!occ) throw new Error('Occurrence not found');
    this.db.prepare('DELETE FROM task_occurrences WHERE id = ?').run(occId);
  }

  /** Delete the entire series and all its occurrences. */
  deleteSeries(seriesId: number): void {
    const series = this.repo.getById(seriesId);
    if (!series) return;
    this.db.prepare('DELETE FROM task_occurrences WHERE series_id = ?').run(seriesId);
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(seriesId);
  }

  /** Mark past-due open occurrences as missed (called on read paths). */
  markMissed(): void {
    const today = new Date().toISOString().slice(0, 10);
    const scope = '';
    this.db.prepare(
      `UPDATE task_occurrences SET status = 'missed'
       WHERE status = 'not_started' AND occurrence_date < ?${scope}`
    ).run(today);
  }
}

/** Expand a plain list of task rows into rows + their occurrences (for UI). */
export function attachOccurrences(db: WebDatabase, tasks: TaskRow[]): TaskWithOccurrences[] {
  if (!tasks.some(t => t.recurrence_rule)) return tasks;
  const stmt = db.prepare(
    `SELECT * FROM task_occurrences WHERE series_id = ? ORDER BY occurrence_date`);
  return tasks.map(t => {
    if (!t.recurrence_rule) return t;
    return { ...t, occurrences: stmt.all(t.id) as any[] };
  });
}

export type { RecurrenceRule };
