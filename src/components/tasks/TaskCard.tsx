import React from 'react';
import { Clock, Flag, CheckCircle2, Circle, AlertCircle, RotateCcw, XCircle } from 'lucide-react';
import type { Task } from '@/types';
import { fmtTime, PRIORITY_LABELS, STATUS_LABELS } from '@/services/api';

export const STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  not_started: { bg: 'rgba(150,150,170,0.18)', fg: 'inherit' },
  in_progress: { bg: 'rgba(91,95,151,0.35)', fg: 'inherit' },
  completed: { bg: 'rgba(80,160,110,0.28)', fg: 'inherit' },
  rescheduled: { bg: 'rgba(216,138,166,0.32)', fg: 'inherit' },
  missed: { bg: 'rgba(200,60,90,0.28)', fg: 'inherit' }
};

export const STATUS_ICONS: Record<string, React.ElementType> = {
  not_started: Circle,
  in_progress: AlertCircle,
  completed: CheckCircle2,
  rescheduled: RotateCcw,
  missed: XCircle
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.not_started;
  const Icon = STATUS_ICONS[status] ?? Circle;
  return (
    <span className="badge" style={{ background: s.bg, color: status === 'completed' ? '#6ecf96' : status === 'missed' ? '#e57387' : 'var(--text)' }}>
      <Icon size={12} className="mr-1" />{STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    low: '#8fae9b', medium: '#c9a86a', high: '#d88a5e', urgent: '#c94f5f'
  };
  return (
    <span className="badge" style={{ background: colors[priority] + '33', color: colors[priority] }}>
      <Flag size={11} className="mr-1" />{PRIORITY_LABELS[priority] ?? priority}
    </span>
  );
}

export function TaskCard({ task, onClick, compact }: { task: Task; onClick?: () => void; compact?: boolean }) {
  return (
    <div className="card p-4 cursor-pointer hover:opacity-90" onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`font-medium truncate ${task.status === 'completed' ? 'line-through opacity-70' : ''}`}>{task.title}</div>
          {!compact && task.description && (
            <div className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{task.description}</div>
          )}
          <div className="flex items-center gap-2 mt-2 text-xs flex-wrap" style={{ color: 'var(--text-secondary)' }}>
            <span className="inline-flex items-center gap-1"><Clock size={12} />{fmtTime(task.start_time, false)}–{fmtTime(task.end_time, false)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
        </div>
      </div>
    </div>
  );
}
