/**
 * Generates src/data/seed.json: generic demonstration data for the public demo.
 *
 * Design rules:
 *  - No personal information anywhere; every title is "Task N" / "Goal N"...
 *  - Dates are relative to the day the file is generated, so the demo always
 *    looks current (no build step runs this; it is a one-off authoring tool).
 *  - Internally consistent: linked goals exist, categories exist, counts add up.
 *  - Enough variety to exercise Calendar, Statistics, recurring tasks, goal
 *    distribution, notes, priorities and statuses.
 */
import fs from 'node:fs';
import path from 'node:path';

const now = new Date();
// Use LOCAL date parts throughout: mixing UTC dates with local weekday math
// shifted the demo anchor by a day (and made recurring tasks miss "today").
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (days) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return iso(d);
};
const stamp = (days, hour = 9) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

/* ---------------- categories (match the app's defaults) ---------------- */
const categories = [
  { id: 1, name: 'Study', color: '#701F39', icon: 'book' },
  { id: 2, name: 'Work', color: '#87334F', icon: 'briefcase' },
  { id: 3, name: 'Personal', color: '#D88AA6', icon: 'heart' },
  { id: 4, name: 'Health & Fitness', color: '#4C7A5C', icon: 'activity' },
  { id: 5, name: 'Family', color: '#C77D99', icon: 'users' },
  { id: 6, name: 'Projects', color: '#5B5F97', icon: 'folder' },
  { id: 7, name: 'Other', color: '#947584', icon: 'circle' }
];

/* ---------------- goals ---------------- */
const goals = [
  { id: 1, title: 'Goal 1', description: 'A sample objective to show how goals track progress.', start_date: shift(-20), target_date: shift(10), progress: 0, status: 'in_progress', category: 'Study', priority: 'high', created_at: stamp(-20), updated_at: stamp(-1) },
  { id: 2, title: 'Goal 2', description: 'A second sample objective, linked to its own tasks.', start_date: shift(-12), target_date: shift(20), progress: 0, status: 'in_progress', category: 'Work', priority: 'medium', created_at: stamp(-12), updated_at: stamp(-1) },
  { id: 3, title: 'Goal 3', description: 'A third sample objective with two milestones.', start_date: shift(-30), target_date: shift(30), progress: 0, status: 'in_progress', category: 'Personal', priority: 'low', created_at: stamp(-30), updated_at: stamp(-1) }
];

const milestones = [
  { id: 1, goal_id: 1, title: 'Milestone 1', target_date: shift(-5), is_completed: 1 },
  { id: 2, goal_id: 1, title: 'Milestone 2', target_date: shift(8), is_completed: 0 },
  { id: 3, goal_id: 2, title: 'Milestone 3', target_date: shift(12), is_completed: 0 },
  { id: 4, goal_id: 3, title: 'Milestone 4', target_date: shift(-10), is_completed: 1 },
  { id: 5, goal_id: 3, title: 'Milestone 5', target_date: shift(15), is_completed: 0 }
];

/* ---------------- tasks ----------------
 * A mix that gives every feature something to show:
 *   - past tasks (completed / missed) feed Statistics and the calendar's history
 *   - today's tasks drive the dashboard
 *   - future tasks fill upcoming views
 *   - two recurring series produce occurrences across the month
 *   - one rescheduled task shows the reschedule history feature
 */
let tid = 1;
const task = (o) => ({
  id: tid++,
  title: o.title,
  description: o.description ?? '',
  start_date: o.date,
  end_date: o.end ?? o.date,
  start_time: o.start ?? '09:00',
  end_time: o.endTime ?? '10:00',
  category_id: o.category ?? 1,
  priority: o.priority ?? 'medium',
  status: o.status ?? 'not_started',
  color: null,
  reminder: o.reminder ?? 10,
  recurrence_rule: o.rule ?? null,
  parent_task_id: null,
  goal_id: o.goal ?? null,
  notes: o.notes ?? '',
  original_start_date: o.originalStart ?? null,
  original_end_date: o.originalEnd ?? null,
  original_start_time: o.originalStartTime ?? null,
  original_end_time: o.originalEndTime ?? null,
  is_all_day: o.allDay ? 1 : 0,
  created_at: stamp(o.created ?? -14),
  updated_at: stamp(o.updated ?? -1),
  completed_at: o.status === 'completed' ? stamp(o.completedOn ?? (o.daysAgo ?? 0), 16) : null
});

const dailyRule = JSON.stringify({ freq: 'daily', end: 'never' });
const weekdayRule = JSON.stringify({ freq: 'custom', weekdays: [1, 3, 5], end: 'never' });

const tasks = [
  /* --- recurring series (2). These become the series rows; the app expands
         their occurrences on first run, so the calendar stays populated. --- */
  task({ title: 'Task 6', description: 'Recurring every day.', date: shift(-10), start: '08:00', endTime: '08:30', category: 4, priority: 'medium', rule: dailyRule, goal: 3, created: -10 }),
  // Recurring on Mon/Wed/Fri, anchored on a matching weekday so the series is
  // valid on the day it was created.
  task({ title: 'Task 7', description: 'Recurring on Mondays, Wednesdays and Fridays.', date: shift(-10 - ((now.getDay() + 2) % 7)), start: '18:00', endTime: '19:00', category: 1, priority: 'high', rule: weekdayRule, goal: 1, created: -10 }),

  /* --- past, completed (feed statistics + goal progress) --- */
  task({ title: 'Task 1', description: 'Completed example.', date: shift(-6), start: '10:00', endTime: '11:00', category: 1, priority: 'high', status: 'completed', goal: 1, created: -12, completedOn: -6 }),
  task({ title: 'Task 2', description: 'Completed example.', date: shift(-5), start: '14:00', endTime: '15:00', category: 2, priority: 'medium', status: 'completed', goal: 2, created: -12, completedOn: -5 }),
  task({ title: 'Task 3', description: 'Completed example.', date: shift(-3), start: '09:00', endTime: '09:30', category: 3, priority: 'low', status: 'completed', goal: 3, created: -10, completedOn: -3 }),
  task({ title: 'Task 4', description: 'Completed example.', date: shift(-2), start: '16:00', endTime: '17:00', category: 4, priority: 'medium', status: 'completed', created: -9, completedOn: -2 }),

  /* --- past, missed (shows a red slice in statistics) --- */
  task({ title: 'Task 8', description: 'Missed example.', date: shift(-4), start: '11:00', endTime: '12:00', category: 2, priority: 'high', status: 'missed', goal: 2, created: -9 }),

  /* --- rescheduled: original schedule preserved for history --- */
  task({
    title: 'Task 9', description: 'Moved to a later day.', date: shift(1), start: '13:00', endTime: '14:00',
    category: 6, priority: 'urgent', status: 'rescheduled', goal: 2,
    originalStart: shift(-1), originalEnd: shift(-1), originalStartTime: '13:00', originalEndTime: '14:00',
    created: -8, notes: 'Rescheduled once.'
  }),

  /* --- today (dashboard) --- */
  task({ title: 'Task 5', description: 'Due today.', date: shift(0), start: '09:30', endTime: '10:30', category: 2, priority: 'high', status: 'in_progress', goal: 2, created: -5 }),
  task({ title: 'Task 10', description: 'Due today, not started yet.', date: shift(0), start: '15:00', endTime: '15:45', category: 3, priority: 'medium', goal: 3, created: -4 }),
  task({ title: 'Task 14', description: 'Due today, completed earlier.', date: shift(0), start: '07:30', endTime: '08:00', category: 4, priority: 'low', status: 'completed', goal: 1, created: -4, completedOn: 0 }),

  /* --- upcoming --- */
  task({ title: 'Task 11', description: 'Tomorrow.', date: shift(2), start: '10:00', endTime: '11:00', category: 1, priority: 'medium', goal: 1, created: -3 }),
  task({ title: 'Task 12', description: 'Next week.', date: shift(7), start: '09:00', endTime: '10:00', category: 5, priority: 'low', goal: 3, created: -3 }),
  task({ title: 'Task 13', description: 'A multi-day task.', date: shift(4), end: shift(6), start: '08:00', endTime: '17:00', category: 6, priority: 'high', goal: 2, allDay: 1, created: -2 })
];

/* ---------------- history (so Task details shows a real timeline) ---------------- */
let hid = 1;
const history = [];
for (const t of tasks) {
  history.push({
    id: hid++, task_id: t.id,
    previous_schedule: null,
    new_schedule: JSON.stringify({ startDate: t.start_date, endDate: t.end_date, startTime: t.start_time, endTime: t.end_time }),
    change_type: 'created', reason: null, changed_at: t.created_at
  });
  if (t.status === 'completed') {
    history.push({ id: hid++, task_id: t.id, previous_schedule: 'not_started', new_schedule: 'completed', change_type: 'status_changed', reason: null, changed_at: t.completed_at });
  }
  if (t.status === 'missed') {
    history.push({ id: hid++, task_id: t.id, previous_schedule: 'not_started', new_schedule: 'missed', change_type: 'status_changed', reason: null, changed_at: stamp(-3) });
  }
  if (t.status === 'rescheduled') {
    history.push({
      id: hid++, task_id: t.id,
      previous_schedule: JSON.stringify({ startDate: t.original_start_date, endDate: t.original_end_date, startTime: t.original_start_time, endTime: t.original_end_time }),
      new_schedule: JSON.stringify({ startDate: t.start_date, endDate: t.end_date, startTime: t.start_time, endTime: t.end_time }),
      change_type: 'rescheduled', reason: 'A better slot was available', changed_at: stamp(-1)
    });
  }
}

/* ---------------- notes ---------------- */
const notes = [
  { id: 1, title: 'Note 1', content: 'This is a sample note. Notes can be pinned, edited and linked to a goal.', category: 'General', is_pinned: 1, linked_goal_id: 1, linked_task_id: null, created_at: stamp(-7), updated_at: stamp(-2) },
  { id: 2, title: 'Note 2', content: 'A second sample note, linked to Goal 2.', category: 'General', is_pinned: 0, linked_goal_id: 2, linked_task_id: null, created_at: stamp(-6), updated_at: stamp(-4) },
  { id: 3, title: 'Note 3', content: 'A third sample note with no links.', category: 'General', is_pinned: 0, linked_goal_id: null, linked_task_id: null, created_at: stamp(-3), updated_at: stamp(-3) }
];

/* ---------------- goal progress, recomputed the same way the app does ---------------- */
for (const g of goals) {
  const ms = milestones.filter((m) => m.goal_id === g.id);
  const linked = tasks.filter((t) => t.goal_id === g.id && !t.recurrence_rule);
  const parts = [];
  if (ms.length) parts.push(ms.filter((m) => m.is_completed).length / ms.length);
  if (linked.length) parts.push(linked.filter((t) => t.status === 'completed').length / linked.length);
  g.progress = parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : 0;
  g.status = g.progress >= 100 ? 'completed' : 'in_progress';
}

const seed = {
  app: 'my-planner',
  version: 2,
  kind: 'seed',
  exportedAt: null,
  tables: {
    categories,
    settings: [
      { key: 'theme', value: 'dark-red' },
      { key: 'displayName', value: '' },
      { key: 'weekStart', value: 'monday' },
      { key: 'timeFormat', value: '24h' },
      { key: 'dateFormat', value: 'YYYY-MM-DD' },
      { key: 'notificationsEnabled', value: 'true' },
      { key: 'defaultReminder', value: '10' }
    ],
    tasks,
    task_history: history,
    goals,
    milestones,
    habits: [],
    habit_completions: [],
    notes,
    task_occurrences: []
  }
};

const out = path.join('src', 'data', 'seed.json');
fs.writeFileSync(out, JSON.stringify(seed, null, 1) + '\n');
console.log('wrote ' + out);
console.log('goals=' + goals.length + ' tasks=' + tasks.length + ' (recurring ' +
  tasks.filter((t) => t.recurrence_rule).length + ') notes=' + notes.length +
  ' history=' + history.length + ' milestones=' + milestones.length);
console.log('statuses: ', [...new Set(tasks.map((t) => t.status))].join(', '));
console.log('priorities:', [...new Set(tasks.map((t) => t.priority))].join(', '));
console.log('goal progress:', goals.map((g) => g.title + '=' + g.progress + '%').join(', '));
