import React, { useEffect, useState } from 'react';
import { Repeat, Trash2 } from 'lucide-react';
import { api } from '@/services/api';
import { useUI } from '@/contexts/UIContext';
import type { TaskOccurrence } from '@/types';

/**
 * RESCHEDULE DIALOG — works for both plain tasks and recurring occurrences.
 *
 * Plain task        → date + start/end time (tasks:reschedule, history kept).
 * One occurrence    → "Reschedule only this occurrence" (series untouched) or
 *                     "Reschedule the entire series" (regenerates future dates).
 * History/original  → kept automatically by the backend (original_* columns +
 *                     reschedule note + task_history rows). No duplicates: the
 *                     occurrence row is updated in place, never duplicated.
 */
export function RescheduleDialog({ occurrence, task, onClose }: {
  occurrence?: TaskOccurrence;
  task?: { id: number; title: string; start_date: string; end_date: string; start_time: string | null; end_time: string | null };
  onClose: () => void;
}) {
  const { refresh } = useUI();
  const isSeries = !!occurrence;
  const [mode, setMode] = useState<'single' | 'series'>(isSeries ? 'single' : 'single');
  const [startDate, setStartDate] = useState(occurrence?.start_date ?? task?.start_date ?? '');
  const [startTime, setStartTime] = useState(occurrence?.start_time ?? task?.start_time ?? '09:00');
  const [endTime, setEndTime] = useState(occurrence?.end_time ?? task?.end_time ?? '10:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const title = occurrence?.title ?? task?.title ?? '';

  // "Entire series" shifts the anchor: prefill with the occurrence's date.
  useEffect(() => { if (isSeries && mode === 'series') setStartDate(occurrence!.start_date); }, [mode]);

  const save = async () => {
    setError('');
    if (!startDate) { setError('Choose a new date.'); return; }
    if (endTime <= startTime) { setError('End time must be later than start time.'); return; }
    setBusy(true);
    try {
      const r = mode === 'series' && isSeries
        ? await api.occurrencesRescheduleSeries({ seriesId: occurrence!.series_id, startDate, startTime, endTime, reason: reason || undefined })
        : occurrence
          ? await api.occurrencesReschedule({ id: occurrence.id, startDate, endDate: startDate, startTime, endTime, reason: reason || undefined })
          : await api.tasksReschedule({ id: task!.id, startDate, endDate: startDate, startTime, endTime, reason: reason || undefined });
      if (!r.ok) { setError(r.error!); setBusy(false); return; }
      refresh();
      onClose();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const deleteIt = async () => {
    setBusy(true);
    if (occurrence) {
      if (mode === 'series') await api.occurrencesDeleteSeries(occurrence.series_id);
      else await api.occurrencesDelete(occurrence.id);
    } else {
      await api.tasksDelete(task!.id);
    }
    refresh();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="card p-6 w-[520px] max-w-[92vw]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          {isSeries && <Repeat size={16} style={{ color: 'var(--accent)' }} />}
          <h3 className="text-lg font-semibold">{isSeries ? 'Reschedule Recurring Task' : 'Reschedule Task'}</h3>
        </div>
        <div className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{title}</div>

        {isSeries && (
          <div className="mb-4 flex gap-2">
            <button type="button" className={mode === 'single' ? 'btn !py-1.5 text-xs' : 'btn-secondary !py-1.5 text-xs'}
              onClick={() => setMode('single')}>
              Only this occurrence
            </button>
            <button type="button" className={mode === 'series' ? 'btn !py-1.5 text-xs' : 'btn-secondary !py-1.5 text-xs'}
              onClick={() => setMode('series')}>
              Entire series
            </button>
          </div>
        )}

        {mode === 'single' && (
          <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            {isSeries
              ? 'Only this date moves. The repeat pattern and all future occurrences stay exactly as they are.'
              : 'The task keeps its schedule history; the original date/time is preserved in its history.'}
          </div>
        )}
        {mode === 'series' && isSeries && (
          <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            The series anchor moves to the new date/time. Past occurrences keep their
            own history; upcoming ones are regenerated automatically — no duplicates.
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="label">New date *</label>
            <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">New start time *</label>
              <input type="time" className="input" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="label">New end time *</label>
              <input type="time" className="input" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Reason (optional)</label>
            <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. dentist appointment moved" />
          </div>
        </div>

        {error && <div className="mt-3 text-sm px-3 py-2 rounded-xl" style={{ background: 'rgba(200,60,90,0.15)', color: 'var(--accent)' }}>{error}</div>}

        <div className="flex items-center justify-between mt-5">
          <button className="btn-secondary !text-red-400 flex items-center gap-1.5" onClick={deleteIt} disabled={busy}>
            <Trash2 size={14} /> {mode === 'series' && isSeries ? 'Delete series' : 'Delete'}
          </button>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy}>Reschedule</button>
          </div>
        </div>
      </div>
    </div>
  );
}
