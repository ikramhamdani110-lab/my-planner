import type { WebDatabase } from '../webDatabase';

export class NoteRepository {
  constructor(private db: WebDatabase) {}

  create(d: any) {
    const info = this.db.prepare(
      `INSERT INTO notes (title, content, is_pinned, linked_goal_id, linked_task_id) VALUES (?,?,?,?,?)`)
      .run(d.title, d.content ?? '', d.is_pinned ? 1 : 0, d.linked_goal_id ?? null, d.linked_task_id ?? null);
    return this.getById(Number(info.lastInsertRowid));
  }

  private readonly fields = 'id, title, content, is_pinned, linked_goal_id, linked_task_id, created_at, updated_at';

  getById(id: number) { return this.db.prepare(`SELECT ${this.fields} FROM notes WHERE id = ?`).get(id); }

  list(search?: string) {
    const where = search ? '(title LIKE ? OR content LIKE ?)' : '1=1';
    const args = search ? [`%${search}%`, `%${search}%`] : [];
    return this.db.prepare(`SELECT ${this.fields} FROM notes WHERE ${where}
      ORDER BY is_pinned DESC, updated_at DESC, id DESC`).all(...args);
  }

  update(id: number, d: any) {
    const allowed = ['title','content','is_pinned','linked_goal_id','linked_task_id'];
    const sets: string[] = []; const vals: any[] = [];
    for (const k of allowed) if (k in d) { sets.push(`${k} = ?`); vals.push(typeof d[k] === 'boolean' ? (d[k] ? 1 : 0) : d[k]); }
    sets.push(`updated_at = datetime('now')`);
    const result = this.db.prepare(`UPDATE notes SET ${sets.join(',')} WHERE id = ?`).run(...vals, id);
    if (!result.changes) throw new Error('Note not found');
    return this.getById(id);
  }

  delete(id: number) {
    const result = this.db.prepare(`DELETE FROM notes WHERE id = ?`).run(id);
    if (!result.changes) throw new Error('Note not found');
  }
}

export class SettingsRepository {
  constructor(private db: WebDatabase) {}

  get(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
    return r ? r.value : null;
  }

  set(key: string, value: string) {
    this.db.prepare(`INSERT INTO settings (key, value) VALUES (?,?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
  }

  all(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as any[];
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }
}
