import type { WebDatabase } from '../webDatabase';

export class GoalRepository {
  constructor(private db: WebDatabase) {}

  create(d: any) {
    const info = this.db.prepare(
      `INSERT INTO goals (title, description, start_date, target_date, category, priority, status, progress)
       VALUES (?,?,?,?,?,?,?,?)`).run(
      d.title, d.description ?? '', d.start_date, d.target_date, d.category ?? 'Other',
      d.priority ?? 'medium', d.status ?? 'not_started', d.progress ?? 0);
    return this.getById(Number(info.lastInsertRowid));
  }

  getById(id: number) {
    const goal = this.db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as any;
    if (!goal) return undefined;
    goal.milestones = this.db.prepare('SELECT * FROM milestones WHERE goal_id = ? ORDER BY id').all(id);
    return goal;
  }

  list() {
    const goals = this.db.prepare('SELECT * FROM goals ORDER BY target_date').all() as any[];
    const ms = this.db.prepare('SELECT * FROM milestones ORDER BY goal_id, id').all() as any[];
    for (const g of goals) g.milestones = ms.filter(m => m.goal_id === g.id);
    return goals;
  }

  update(id: number, d: any) {
    const allowed = ['title','description','start_date','target_date','progress','status','category','priority'];
    const sets: string[] = []; const vals: any[] = [];
    for (const k of allowed) if (k in d) { sets.push(`${k} = ?`); vals.push(d[k]); }
    sets.push(`updated_at = datetime('now')`);
    if (sets.length) this.db.prepare(`UPDATE goals SET ${sets.join(',')} WHERE id = ?`).run(...vals, id);
    return this.getById(id);
  }

  delete(id: number) { this.db.prepare('DELETE FROM goals WHERE id = ?').run(id); }

  addMilestone(goalId: number, title: string, targetDate?: string) {
    const info = this.db.prepare('INSERT INTO milestones (goal_id, title, target_date) VALUES (?,?,?)')
      .run(goalId, title, targetDate ?? null);
    return this.db.prepare('SELECT * FROM milestones WHERE id = ?').get(Number(info.lastInsertRowid));
  }

  toggleMilestone(id: number, done: boolean) {
    this.db.prepare('UPDATE milestones SET is_completed = ? WHERE id = ?').run(done ? 1 : 0, id);
    const m = this.db.prepare('SELECT goal_id FROM milestones WHERE id = ?').get(id) as any;
    return m?.goal_id;
  }

  deleteMilestone(id: number) { this.db.prepare('DELETE FROM milestones WHERE id = ?').run(id); }

  /** Recompute progress from milestones + linked completed tasks. */
  recalcProgress(goalId: number): number {
    const g = this.getById(goalId);
    if (!g) return 0;
    const ms = g.milestones as any[];
    const linked = this.db.prepare(
      `SELECT COUNT(*) total, SUM(status='completed') done FROM tasks WHERE goal_id = ?`).get(goalId) as any;
    const parts: number[] = [];
    if (ms.length) parts.push(ms.filter(m => m.is_completed).length / ms.length);
    if (linked && linked.total > 0) parts.push(linked.done / linked.total);
    // Progress = average of the tracked dimensions (milestones, linked tasks).
    const progress = parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : (g.progress as number);
    this.db.prepare(`UPDATE goals SET progress = ?, status = CASE WHEN ? >= 100 THEN 'completed' ELSE status END, updated_at = datetime('now') WHERE id = ?`)
      .run(progress, progress, goalId);
    return progress;
  }

  counts() {
    return this.db.prepare(
      `SELECT COUNT(*) total, SUM(status='completed') completed FROM goals`).get() as any;
  }
}
