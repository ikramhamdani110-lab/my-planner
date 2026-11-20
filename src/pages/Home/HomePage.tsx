import React, { useEffect, useState } from 'react';
import { Plus, CalendarPlus, Target, StickyNote, Clock, RotateCcw, AlertTriangle, ListChecks } from 'lucide-react';
import { api, fmtDate, fmtTime, today, addDays } from '@/services/api';
import { useUI } from '@/contexts/UIContext';
import { TaskCard, StatusBadge, PriorityBadge } from '@/components/tasks/TaskCard';
import type { Task } from '@/types';

function StatBox({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="text-2xl font-semibold mt-1" style={{ color: accent }}>{value}</div>
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 42, c = 2 * Math.PI * r;
  return (
    <svg width="110" height="110" viewBox="0 0 110 110">
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--bg-secondary)" strokeWidth="10" />
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--accent)" strokeWidth="10"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} strokeLinecap="round"
        transform="rotate(-90 55 55)" />
      <text x="55" y="60" textAnchor="middle" fontSize="20" fontWeight="600" fill="var(--text)">{pct}%</text>
    </svg>
  );
}

export function HomePage({ onNavigate, userName }: { onNavigate: (p: any) => void; userName?: string }) {
  const { openModal } = useUI();
  const [data, setData] = useState<any>(null);
  const [now, setNow] = useState(new Date());
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // Keep the greeting in sync with the local time (re-evaluated every minute).
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(iv);
  }, []);

  const load = () => {
    const t = today();
    const monday = addDays(t, -((new Date(t + 'T00:00:00').getDay() + 6) % 7));
    const monthStart = t.slice(0, 8) + '01';
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    api.statsDashboard({
      today: t, weekFrom: monday, weekTo: addDays(monday, 6), monthStart, monthEnd
    }).then(r => { if (r.ok) setData(r.data); });
  };
  useEffect(load, []);

  if (!data) return <div className="p-8" style={{ color: 'var(--text-secondary)' }}>Loading dashboard…</div>;
  const t = data.today;

  const quick = [{ kind: 'task' as const, label: 'New Task', icon: ListChecks }, { kind: 'goal' as const, label: 'New Goal', icon: Target }, { kind: 'note' as const, label: 'New Note', icon: StickyNote }];

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{greeting}, {userName || 'friend'}!</h2>
          <p style={{ color: 'var(--text-secondary)' }}>{fmtDate(today(), { weekday: true })}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {quick.map(q => (
            <button key={q.label} className="btn-secondary" onClick={() => openModal({ kind: q.kind, defaultDate: today() })}>
              <q.icon size={15} />{q.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-7 gap-3 items-start">
        <StatBox label="Total Tasks" value={t.total} />
        <StatBox label="Completed" value={t.completed} accent="#6ecf96" />
        <StatBox label="Remaining" value={t.remaining} />
        <StatBox label="Missed" value={t.missed} accent="#e57387" />
        <StatBox label="Rescheduled" value={t.rescheduled} accent="var(--accent)" />
        <div className="card p-4 col-span-2 flex items-center gap-4">
          <ProgressRing pct={t.percentage} />
          <div>
            <div className="font-medium">Daily Completion</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{t.completed} of {t.total} tasks done today</div>
            <div className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
              Week: {data.week.total ? Math.round(data.week.completed / data.week.total * 100) : 0}% ·
              Month: {data.month.total ? Math.round(data.month.completed / data.month.total * 100) : 0}%
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Clock size={16} />Today's Schedule</h3>
          {data.schedule.length === 0 && <div className="card p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing scheduled today. Enjoy your free time!</div>}
          <div className="space-y-2">
            {data.schedule.map((task: Task) => <TaskCard key={task.id} task={task} compact
              onClick={() => { window.location.hash = `task-${task.id}`; }} />)}
          </div>
        </section>

        <div className="space-y-6">
          <section>
            <h3 className="font-semibold mb-3">Upcoming</h3>
            {data.upcoming.length === 0 && <div className="card p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>No upcoming activities.</div>}
            <div className="space-y-2">
              {data.upcoming.map((task: Task) => (
                <div key={task.id} className="card p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{task.title}</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{fmtDate(task.start_date)} · {fmtTime(task.start_time, false)}</div>
                  </div>
                  <StatusBadge status={task.status} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-3 flex items-center gap-2"><RotateCcw size={16} />Rescheduled Tasks</h3>
            {data.rescheduled.length === 0 && <div className="card p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>No rescheduled tasks.</div>}
            <div className="space-y-2">
              {data.rescheduled.map((task: Task) => (
                <div key={task.id} className="card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate">{task.title}</div>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Originally {task.original_start_date} {fmtTime(task.original_start_time ?? '', false)} → now {task.start_date} {fmtTime(task.start_time, false)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {data.overdue.length > 0 && (
            <section>
              <h3 className="font-semibold mb-3 flex items-center gap-2"><AlertTriangle size={16} />Overdue</h3>
              <div className="space-y-2">
                {data.overdue.map((task: Task) => (
                  <div key={task.id} className="card p-3 flex items-center justify-between gap-2">
                    <div className="text-sm">{task.title}</div>
                    <div className="text-xs" style={{ color: '#e57387' }}>{fmtDate(task.end_date)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
