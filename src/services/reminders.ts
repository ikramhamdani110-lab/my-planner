/**
 * Reminders, in the browser.
 *
 * The desktop app used Electron's Notification + a scheduler tick every 30s.
 * Here the same scheduling table drives the Web Notifications API.
 *
 * Browser limitations you should know about:
 *   - Notifications only fire while a My Planner tab is open. Closing the tab
 *     stops them (a website cannot run in the background after it is closed).
 *   - The browser asks permission once; if it is denied, reminders appear as
 *     in-app toasts instead.
 */
import type { Repos } from './desktopHandlers';
import type { WebDatabase } from '@/db/webDatabase';

const CHECK_INTERVAL = 30 * 1000;

export interface InAppReminder {
  id: number;
  title: string;
  scheduledAt: string;
}

export class ReminderService {
  private timer: number | null = null;
  private listeners = new Set<(r: InAppReminder) => void>();

  constructor(private db: WebDatabase, private repos: Repos) {}

  start() {
    // Mark reminders whose time passed long ago as fired so they don't pile up.
    try {
      this.db.prepare(
        "UPDATE notifications SET fired = 1 WHERE fired = 0 AND is_active = 1 AND scheduled_at < datetime('now', '-1 hour')"
      ).run();
    } catch { /* ignore */ }
    this.tick();
    this.timer = window.setInterval(() => this.tick(), CHECK_INTERVAL);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.tick(); });
  }

  stop() { if (this.timer) window.clearInterval(this.timer); }

  /** Called after any data change so pending reminders reflect the new state. */
  sync() {
    try {
      this.db.prepare(
        "UPDATE notifications SET fired = 1 WHERE fired = 0 AND is_active = 1 AND scheduled_at < datetime('now', '-1 hour')"
      ).run();
    } catch { /* ignore */ }
    this.tick();
  }

  /** Hook used by the handler layer after a task changes. */
  syncAfterChange(_taskId: number) { this.sync(); }

  onReminder(fn: (r: InAppReminder) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Ask for notification permission (must be called from a user gesture). */
  static async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission !== 'default') return Notification.permission;
    try { return await Notification.requestPermission(); } catch { return 'denied'; }
  }

  private tick() {
    try {
      const enabled = this.repos.settings.get('notificationsEnabled');
      if (enabled === 'false') return;
      const now = new Date().toISOString();
      const due = this.db.prepare(
        `SELECT n.*, t.title FROM notifications n JOIN tasks t ON t.id = n.task_id
         WHERE n.is_active = 1 AND n.fired = 0 AND n.scheduled_at <= ?`).all(now) as any[];

      for (const n of due) {
        this.db.prepare('UPDATE notifications SET fired = 1 WHERE id = ?').run(n.id);
        this.fire(n);
      }
    } catch { /* reminders must never break the app */ }
  }

  private fire(n: any) {
    const reminder: InAppReminder = { id: n.id, title: n.title, scheduledAt: n.scheduled_at };
    // In-app toast always works, even with notifications denied.
    this.listeners.forEach(fn => { try { fn(reminder); } catch { /* ignore */ } });

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification('My Planner — Reminder', { body: n.title, tag: `task-${n.task_id}` });
        notif.onclick = () => { window.focus(); window.location.hash = `task-${n.task_id}`; };
      } catch { /* some browsers only allow notifications from a service worker */ }
    }
  }
}
