import React, { useEffect, useState } from 'react';
import { Pencil, History, RotateCcw, Trash2, CheckCircle2 } from 'lucide-react';
import { api } from '@/services/api';
import { useUI } from '@/contexts/UIContext';
import type { Task } from '@/types';
import { StatusBadge, PriorityBadge } from './TaskCard';
import { fmtTime } from '@/services/api';

export function TaskDetails({ id, onClose, onEdit }: { id: number; onClose: () => void; onEdit?: () => void }) {
  const { refresh, openModal } = useUI();
  const [task, setTask] = useState<Task | null>(null);
  const [tab, setTab] = useState<'details' | 'history'>('details');

  const load = () => api.tasksGet(id).then(r => { if (r.ok) setTask(r.data!); });
  useEffect(() => { load(); }, [id]);

  if (!task) return <div className="p-6">Loading…</div>;

  const setStatus = async (status: string) => {
    await api.tasksSetStatus({ id, status: status as any });
    await load(); refresh();
  };

  const del = async () => {
    if (confirm('Delete this task? Its history will also be removed.')) {
      await api.tasksDelete(id); refresh(); onClose();
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{task.title}</h2>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
        </div>
        <button className="btn-secondary !px-3" onClick={onClose}>×</button>
      </div>

      <div className="flex gap-2 mt-4">
        <button className={`chip ${tab === 'details' ? 'active' : ''}`} onClick={() => setTab('details')}>Details</button>
        <button className={`chip ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          <History size={12} className="inline mr-1" />History
        </button>
      </div>

      {tab === 'details' ? (
        <div className="mt-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3"><div className="label">Start</div>{task.start_date} · {fmtTime(task.start_time, false)}</div>
            <div className="card p-3"><div className="label">End</div>{task.end_date} · {fmtTime(task.end_time, false)}</div>
          </div>
          {task.original_start_date && task.original_start_date !== task.start_date && (
            <div className="card p-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Originally scheduled: {task.original_start_date} {fmtTime(task.original_start_time ?? '', false)} – {task.original_end_date} {fmtTime(task.original_end_time ?? '', false)}
            </div>
          )}
          {task.description && <div><div className="label">Description</div><p style={{ color: 'var(--text-secondary)' }}>{task.description}</p></div>}
          {task.notes && <div><div className="label">Notes</div><p style={{ color: 'var(--text-secondary)' }}>{task.notes}</p></div>}
          {task.reminder != null && <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Reminder: {task.reminder} min before</div>}

          <div className="flex flex-wrap gap-2 pt-2">
            {task.status !== 'completed' && (
              <button className="btn" onClick={() => setStatus('completed')}><CheckCircle2 size={14} />Mark Completed</button>
            )}
            {task.status === 'not_started' && <button className="btn-secondary" onClick={() => setStatus('in_progress')}>Start</button>}
            {task.status !== 'rescheduled' && (
              <button className="btn-secondary" onClick={() => { onClose(); openModal({ kind: 'task', task, rescheduleMode: true }); }}>
                <RotateCcw size={14} />Reschedule
              </button>
            )}
            <button className="btn-secondary" onClick={() => { onClose(); onEdit?.(); openModal({ kind: 'task', task }); }}>
              <Pencil size={14} />Edit
            </button>
            <button className="btn btn-danger" onClick={del}><Trash2 size={14} />Delete</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {(task.history ?? []).length === 0 && <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>No recorded changes.</div>}
          {(task.history ?? []).map(h => (
            <div key={h.id} className="card p-3 text-xs">
              <div className="font-medium capitalize">{h.change_type.replace(/_/g, ' ')}</div>
              <div style={{ color: 'var(--text-secondary)' }} className="mt-1">
                {h.previous_schedule && <div>From: {h.previous_schedule}</div>}
                {h.new_schedule && <div>To: {h.new_schedule}</div>}
                {h.reason && <div>Reason: {h.reason}</div>}
                <div className="mt-1 opacity-70">{h.changed_at}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
