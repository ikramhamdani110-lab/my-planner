// Offline validation of the demo seed: references, dates and feature coverage.
const fs = require('fs');
const seed = JSON.parse(fs.readFileSync('C:/Users/pc/Desktop/planner/MyPlanner-Desktop/src/data/seed.json', 'utf8'));
const t = seed.tables;
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const problems = [];
const catIds = new Set(t.categories.map((c) => c.id));
const goalIds = new Set(t.goals.map((g) => g.id));
const taskIds = new Set(t.tasks.map((x) => x.id));

for (const x of t.tasks) {
  if (x.category_id != null && !catIds.has(x.category_id)) problems.push('task ' + x.id + ' bad category');
  if (x.goal_id != null && !goalIds.has(x.goal_id)) problems.push('task ' + x.id + ' bad goal');
  if (x.parent_task_id != null && !taskIds.has(x.parent_task_id)) problems.push('task ' + x.id + ' bad parent');
  if (x.status === 'completed' && !x.completed_at) problems.push('task ' + x.id + ' completed without completed_at');
  if (x.end_date < x.start_date) problems.push('task ' + x.id + ' end before start');
}
for (const m of t.milestones) if (!goalIds.has(m.goal_id)) problems.push('milestone ' + m.id + ' bad goal');
for (const h of t.task_history) if (!taskIds.has(h.task_id)) problems.push('history ' + h.id + ' bad task');
for (const n of t.notes) if (n.linked_goal_id != null && !goalIds.has(n.linked_goal_id)) problems.push('note bad goal');

const todays = t.tasks.filter((x) => x.start_date === today);
const linked = new Set(t.tasks.filter((x) => x.goal_id).map((x) => x.goal_id));
const recurring = t.tasks.filter((x) => x.recurrence_rule);
const completed = t.tasks.filter((x) => x.status === 'completed');

console.log('today:', today);
console.log('goals:', t.goals.map((g) => g.title + ' (' + g.progress + '%)').join(', '));
console.log('tasks:', t.tasks.length, '| today:', todays.length, '| recurring:', recurring.length, '| completed:', completed.length);
console.log('tasks linked to goals:', linked.size, 'of', t.goals.length);
console.log('statuses:', [...new Set(t.tasks.map((x) => x.status))].join(', '));
console.log('priorities:', [...new Set(t.tasks.map((x) => x.priority))].join(', '));
console.log('notes:', t.notes.length, '| history rows:', t.task_history.length);
console.log(problems.length ? 'PROBLEMS:\n  ' + problems.join('\n  ') : 'no consistency problems');
process.exit(problems.length ? 1 : 0);
