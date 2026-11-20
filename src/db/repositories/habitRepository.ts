import type { WebDatabase } from '../webDatabase';

export class HabitRepository {
  constructor(private db: WebDatabase) {}

  create(d: any) {
    const info = this.db.prepare(
      `INSERT INTO habits (title, description, frequency, custom_schedule, color) VALUES (?,?,?,?,?)`)
      .run(d.title, d.description ?? '', d.frequency ?? 'daily', d.custom_schedule ?? null, d.color ?? null);
    return this.getById(Number(info.lastInsertRowid));
  }

  getById(id: number) {
    return this.db.prepare('SELECT * FROM habits WHERE id = ?').get(id) as any;
  }

  listActive() {
    return this.db.prepare('SELECT * FROM habits WHERE is_active = 1 ORDER BY created_at').all() as any[];
  }

  update(id: number, d: any) {
    const allowed = ['title','description','frequency','custom_schedule','color','is_active'];
    const sets: string[] = []; const vals: any[] = [];
    for (const k of allowed) if (k in d) { sets.push(`${k} = ?`); vals.push(d[k]); }
    if (sets.length) this.db.prepare(`UPDATE habits SET ${sets.join(',')} WHERE id = ?`).run(...vals, id);
    return this.getById(id);
  }

  delete(id: number) { this.db.prepare('DELETE FROM habits WHERE id = ?').run(id); }

  setCompletion(habitId: number, date: string, done: boolean) {
    if (done) {
      this.db.prepare(`INSERT INTO habit_completions (habit_id, completion_date, is_completed) VALUES (?,?,1)
        ON CONFLICT(habit_id, completion_date) DO UPDATE SET is_completed = 1`).run(habitId, date);
    } else {
      this.db.prepare('DELETE FROM habit_completions WHERE habit_id = ? AND completion_date = ?').run(habitId, date);
    }
  }

  getCompletions(habitId: number, from: string, to: string) {
    return this.db.prepare(
      `SELECT completion_date, is_completed FROM habit_completions WHERE habit_id = ? AND completion_date BETWEEN ? AND ? ORDER BY completion_date`
    ).all(habitId, from, to) as any[];
  }

  isCompleted(habitId: number, date: string) {
    return !!this.db.prepare(
      'SELECT 1 FROM habit_completions WHERE habit_id = ? AND completion_date = ? AND is_completed = 1').get(habitId, date);
  }

  /** Streak of consecutive completion dates ending today or yesterday. */
  streak(habitId: number): number {
    const dates = (this.db.prepare(
      `SELECT completion_date d FROM habit_completions WHERE habit_id = ? AND is_completed = 1 ORDER BY d DESC`)
      .all(habitId) as any[]).map(r => r.d);
    if (!dates.length) return 0;
    const toDay = (s: string) => Math.floor(Date.parse(s + 'T00:00:00Z') / 86400000);
    const set = new Set(dates.map(toDay));
    let today = toDay(new Date().toISOString().slice(0, 10));
    if (!set.has(today)) { if (!set.has(today - 1)) return 0; today -= 1; }
    let streak = 0;
    while (set.has(today)) { streak++; today -= 1; }
    return streak;
  }

  monthlyStats(habitId: number, year: number, month: number) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to = `${year}-${String(month).padStart(2, '0')}-31`;
    const row = this.db.prepare(
      `SELECT COUNT(*) n FROM habit_completions WHERE habit_id = ? AND completion_date BETWEEN ? AND ? AND is_completed = 1`)
      .get(habitId, from, to) as any;
    return row.n;
  }

  allCompletions(habitId: number) {
    return this.db.prepare('SELECT completion_date FROM habit_completions WHERE habit_id = ? AND is_completed = 1 ORDER BY completion_date')
      .all(habitId) as any[];
  }
}
