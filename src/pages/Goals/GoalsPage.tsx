import React, { useEffect, useState } from 'react';
import { Plus, Target, Trash2, CheckSquare, Square, Link } from 'lucide-react';
import { api, fmtDate } from '@/services/api';
import { useUI } from '@/contexts/UIContext';
import { PriorityBadge } from '@/components/tasks/TaskCard';
import type { Goal, Task } from '@/types';

export function GoalsPage() {
  const { openModal, refreshKey } = useUI();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [goalTasks, setGoalTasks] = useState<Record<number, Task[]>>({});
  const [newMs, setNewMs] = useState('');

  const load = async () => { const r = await api.goalsList(); if (r.ok) setGoals(r.data!); };
  useEffect(() => { load(); }, [refreshKey]);

  const toggleExpand = async (id: number) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    const r = await api.tasksFilter({}); 
    if (r.ok) setGoalTasks(prev => ({ ...prev, [id]: r.data!.filter(t => t.goal_id === id) }));
  };

  const setProgress = async (g: Goal, progress: number) => {
    await api.goalsUpdate({ id: g.id, progress });
    load();
  };

  const toggleMs = async (m: any) => { await api.goalsToggleMilestone({ id: m.id, done: !m.is_completed }); load(); };

  const statusColor = (g: Goal) => g.status === 'completed' ? '#6ecf96' : g.status === 'in_progress' ? '#8f9bd8' : 'var(--text-secondary)';

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {goals.filter(g => g.status === 'completed').length} of {goals.length} goals completed
        </div>
        <button className="btn" onClick={() => openModal({ kind: 'goal' })}><Plus size={15} />New Goal</button>
      </div>

      {goals.length === 0 && <div className="card p-8 text-center" style={{ color: 'var(--text-secondary)' }}>No goals yet. Create your first goal to start planning long-term.</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {goals.map(g => (
          <div key={g.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Target size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
                <div>
                  <div className="font-medium">{g.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {fmtDate(g.start_date)} → {fmtDate(g.target_date)}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <PriorityBadge priority={g.priority} />
                <span className="badge" style={{ background: 'var(--bg-secondary)', color: statusColor(g) }}>{g.status.replace('_', ' ')}</span>
              </div>
            </div>

            {g.description && <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>{g.description}</p>}

            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                <div className="h-full rounded-full" style={{ width: `${g.progress}%`, background: 'var(--accent)' }} />
              </div>
              <span className="text-sm font-medium w-10 text-right">{g.progress}%</span>
            </div>
            <div className="flex gap-2 mt-2">
              {[0, 25, 50, 75, 100].map(p => (
                <button key={p} className={`chip !py-0.5 !px-2 text-[11px] ${g.progress === p ? 'active' : ''}`} onClick={() => setProgress(g, p)}>{p}%</button>
              ))}
              <button className="chip !py-0.5 !px-2 text-[11px]" onClick={() => api.goalsRecalc(g.id).then(load)}>Auto</button>
            </div>

            <button className="text-xs mt-3 flex items-center gap-1" style={{ color: 'var(--accent)' }} onClick={() => toggleExpand(g.id)}>
              {(expanded === g.id ? 'Hide' : 'Show')} milestones & linked tasks ({g.milestones.length})
            </button>

            {expanded === g.id && (
              <div className="mt-2 space-y-1.5">
                {g.milestones.map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    <button onClick={() => toggleMs(m)} style={{ color: 'var(--accent)' }}>
                      {m.is_completed ? <CheckSquare size={15} /> : <Square size={15} />}
                    </button>
                    <span className={m.is_completed ? 'line-through opacity-60' : ''}>{m.title}</span>
                  </div>
                ))}
                <div className="flex gap-2 mt-1">
                  <input className="input !py-1.5 text-xs" placeholder="New milestone…" value={newMs} onChange={e => setNewMs(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && newMs.trim()) {
                        await api.goalsAddMilestone({ goalId: g.id, title: newMs.trim() }); setNewMs(''); load();
                      }
                    }} />
                </div>
                {(goalTasks[g.id]?.length ?? 0) > 0 && (
                  <div className="pt-2">
                    <div className="label flex items-center gap-1"><Link size={11} />Linked Tasks</div>
                    {goalTasks[g.id]!.map(t => (
                      <div key={t.id} className="text-xs flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                        <span className={t.status === 'completed' ? 'line-through' : ''}>{t.title}</span>
                        <span>{t.start_date}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn-secondary !py-1 !px-2 text-xs mt-2"
                  onClick={async () => { if (confirm('Delete this goal?')) { await api.goalsDelete(g.id); load(); } }}>
                  <Trash2 size={12} /> Delete Goal
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
