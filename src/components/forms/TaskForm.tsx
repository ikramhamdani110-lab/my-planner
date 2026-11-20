import React, { useEffect, useState } from 'react';
import { AlertTriangle, Repeat } from 'lucide-react';
import { api } from '@/services/api';
import { useUI } from '@/contexts/UIContext';
import type { Task, Goal } from '@/types';
import { parseRule, ruleToJSON, describeRule, DAY_LABELS, type RecurrenceRule } from '@/lib/recurrence';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const STATUSES = [
  { id: 'not_started', label: 'Not Started' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'rescheduled', label: 'Rescheduled' },
  { id: 'missed', label: 'Missed' }
];
const REMINDERS = [
  { v: 0, label: 'At scheduled time' },
  { v: 5, label: '5 minutes before' },
  { v: 10, label: '10 minutes before' },
  { v: 15, label: '15 minutes before' },
  { v: 30, label: '30 minutes before' },
  { v: 60, label: '1 hour before' },
  { v: -1, label: 'None' }
];

const QUICK_PRESETS = [
  { id: 'none', label: 'Does not repeat' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekly', label: 'Every week' },
  { id: 'custom', label: 'Custom…' }
] as const;

export function TaskForm({ task, defaultDate, rescheduleMode, onSaved, onCancel, onView }: {
  task?: Task;
  defaultDate?: string;
  rescheduleMode?: boolean;
  onSaved: () => void;
  onCancel: () => void;
  onView?: (id: number) => void;
}) {
  const { refresh } = useUI();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [overlapWarning, setOverlapWarning] = useState<{ id: number; title: string }[] | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const existingRule = parseRule(task?.recurrence_rule);
  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    startDate: task?.start_date ?? defaultDate ?? new Date().toISOString().slice(0, 10),
    endDate: task?.end_date ?? task?.start_date ?? defaultDate ?? new Date().toISOString().slice(0, 10),
    startTime: task?.start_time ?? '09:00',
    endTime: task?.end_time ?? '10:00',
    priority: task?.priority ?? 'medium',
    color: task?.color ?? '',
    reminder: task?.reminder ?? 10,
    goalId: task?.goal_id ?? null,
    notes: task?.notes ?? '',
    status: task?.status ?? 'not_started'
  });

  // Recurrence state (edit: prefilled from the task's rule).
  const [repeatMode, setRepeatMode] = useState<'none' | 'daily' | 'weekly' | 'custom'>(
    !existingRule ? 'none' : existingRule.freq === 'daily' ? 'daily' : existingRule.freq === 'weekly' ? 'weekly' : 'custom'
  );
  const [weekdays, setWeekdays] = useState<number[]>(existingRule?.weekdays ?? []);
  const [endMode, setEndMode] = useState<'never' | 'on'>(existingRule?.end === 'on' ? 'on' : 'never');
  const [endDate, setEndDate] = useState(existingRule?.endDate ?? '');

  useEffect(() => {
    (async () => {
      const g = await api.goalsList();
      if (g.ok) setGoals(g.data!);
    })();
  }, []);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const buildRule = (): RecurrenceRule | null => {
    if (repeatMode === 'none') return null;
    const rule: RecurrenceRule = { freq: repeatMode === 'weekly' ? 'weekly' : repeatMode, end: endMode };
    if (endMode === 'on') {
      if (!endDate) { setError('Choose an end date for the repetition (or select “Never”).'); throw new Error('end-date'); }
      rule.endDate = endDate;
    }
    if (repeatMode === 'weekly' && weekdays.length === 0) {
      // Weekly with no explicit day = the start date's weekday.
      rule.weekdays = [new Date(form.startDate + 'T00:00:00').getDay()];
    }
    if (repeatMode === 'custom') {
      if (weekdays.length === 0) { setError('Select at least one day of the week for Custom repetition.'); throw new Error('weekdays'); }
      rule.weekdays = [...weekdays].sort((a, b) => a - b);
    }
    return rule;
  };

  const validate = (): string => {
    if (!form.title.trim()) return 'Title cannot be empty.';
    if (form.endDate < form.startDate) return 'End date cannot be before start date.';
    if (form.startDate === form.endDate && form.endTime <= form.startTime) return 'End time must be later than start time.';
    if (repeatMode !== 'none' && endMode === 'on' && !endDate) return 'Choose when the repetition ends (or select “Never”).';
    if (repeatMode === 'custom' && weekdays.length === 0) return 'Select at least one day of the week.';
    return '';
  };

  const checkOverlap = async (): Promise<boolean> => {
    const r = await api.tasksOverlaps({ startDate: form.startDate, endDate: form.endDate, startTime: form.startTime, endTime: form.endTime, excludeId: task?.id });
    if (r.ok && r.data!.length) {
      setOverlapWarning(r.data!);
      return false;
    }
    setOverlapWarning(null);
    return true;
  };

  const save = async (force = false) => {
    const v = validate();
    if (v) { setError(v); return; }
    setSaving(true);
    setError('');
    try {
      let rule: RecurrenceRule | null = null;
      try { rule = buildRule(); } catch { setSaving(false); return; }
      const ruleJSON = rule ? ruleToJSON(rule) : null;

      if (rescheduleMode && task) {
        await api.tasksReschedule({
          id: task.id, startDate: form.startDate, endDate: form.endDate,
          startTime: form.startTime, endTime: form.endTime, reason: form.notes || undefined
        });
      } else if (task) {
        await api.tasksUpdate({
          id: task.id, ...form,
          goal_id: form.goalId,
          reminder: form.reminder === -1 ? null : form.reminder,
          color: form.color || null,
          recurrence_rule: ruleJSON
        } as any);
      } else {
        if (!force) {
          const ok = await checkOverlap();
          if (!ok) { setSaving(false); return; }
        }
        const payload: any = {
          title: form.title, description: form.description,
          startDate: form.startDate, endDate: form.endDate, startTime: form.startTime, endTime: form.endTime,
          priority: form.priority, color: form.color || null,
          reminder: form.reminder === -1 ? null : form.reminder, goalId: form.goalId, notes: form.notes,
          recurrence_rule: ruleJSON
        };
        await api.tasksCreate(payload);
      }
      refresh();
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const rulePreview = (() => {
    if (repeatMode === 'none') return null;
    const preview: RecurrenceRule = { freq: repeatMode === 'weekly' ? 'weekly' : repeatMode, end: endMode };
    if (repeatMode !== 'daily') preview.weekdays = weekdays.length ? weekdays : [new Date(form.startDate + 'T00:00:00').getDay()];
    if (endMode === 'on' && endDate) preview.endDate = endDate;
    return describeRule(preview, form.startDate);
  })();

  const toggleWeekday = (d: number) =>
    setWeekdays(w => (w.includes(d) ? w.filter(x => x !== d) : [...w, d]));

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">{rescheduleMode ? 'Reschedule Task' : task ? 'Edit Task' : 'New Task'}</h2>
      {rescheduleMode && task && (
        <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'var(--bg-secondary)' }}>
          Current schedule: <b>{task.start_date} {task.start_time} → {task.end_date} {task.end_time}</b>.
          Rescheduling preserves the original schedule and marks the task as Rescheduled.
        </div>
      )}
      <div className="space-y-3">
        {/* ── BASIC ── */}
        <div>
          <label className="label">Title *</label>
          <input className="input" value={form.title} onChange={e => set('title', e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
        </div>

        {/* ── SCHEDULE ── */}
        <div className="pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide mt-2 mb-2" style={{ color: 'var(--text-secondary)' }}>Schedule</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={form.startDate} onChange={e => { set('startDate', e.target.value); set('endDate', e.target.value); }} />
            </div>
            <div>
              <label className="label">End Date *</label>
              <input type="date" className="input" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
            </div>
            <div>
              <label className="label">Start Time *</label>
              <input type="time" className="input" value={form.startTime} onChange={e => set('startTime', e.target.value)} />
            </div>
            <div>
              <label className="label">End Time *</label>
              <input type="time" className="input" value={form.endTime} onChange={e => set('endTime', e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── REPEAT ── */}
        {!rescheduleMode && (
          <div className="pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="text-xs font-semibold uppercase tracking-wide mt-2 mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Repeat size={13} /> Repeat
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_PRESETS.map(p => (
                <button key={p.id} type="button"
                  className={repeatMode === p.id ? 'btn !py-1.5 !px-3 text-xs' : 'btn-secondary !py-1.5 !px-3 text-xs'}
                  onClick={() => { setRepeatMode(p.id); setError(''); }}>
                  {p.label}
                </button>
              ))}
            </div>

            {(repeatMode === 'weekly' || repeatMode === 'custom') && (
              <div className="mt-3">
                <label className="label">Days of the week</label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_LABELS.map((label, d) => (
                    <button key={d} type="button"
                      className={weekdays.includes(d) ? 'btn !py-1.5 !px-2.5 text-xs' : 'btn-secondary !py-1.5 !px-2.5 text-xs'}
                      onClick={() => toggleWeekday(d)}>
                      {label.slice(0, 3)}
                    </button>
                  ))}
                </div>
                {repeatMode === 'weekly' && weekdays.length === 0 && (
                  <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    No day selected — defaults to the start date's weekday.
                  </div>
                )}
              </div>
            )}

            {repeatMode !== 'none' && (
              <div className="mt-3 grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="label">Repeats until</label>
                  <select className="input" value={endMode} onChange={e => setEndMode(e.target.value as 'never' | 'on')}>
                    <option value="never">Never</option>
                    <option value="on">On a specific date</option>
                  </select>
                </div>
                {endMode === 'on' && (
                  <div>
                    <label className="label">End date</label>
                    <input type="date" className="input" value={endDate} min={form.startDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            {rulePreview && (
              <div className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Will repeat: <b>{rulePreview}</b>
              </div>
            )}
          </div>
        )}

        {/* ── DETAILS ── */}
        <div className="pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide mt-2 mb-2" style={{ color: 'var(--text-secondary)' }}>Details</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            {!rescheduleMode && (
              <>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                    {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Reminder</label>
                  <select className="input" value={form.reminder} onChange={e => set('reminder', Number(e.target.value))}>
                    {REMINDERS.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Linked Goal</label>
                  <select className="input" value={form.goalId ?? ''} onChange={e => set('goalId', Number(e.target.value) || null)}>
                    <option value="">None</option>
                    {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Color</label>
                  <input type="color" className="input h-[38px] p-1" value={form.color || '#701F39'} onChange={e => set('color', e.target.value)} />
                </div>
              </>
            )}
          </div>
          <div className="mt-3">
            <label className="label">{rescheduleMode ? 'Reason (optional)' : 'Notes'}</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
      </div>
      {overlapWarning && (
        <div className="mt-3 p-3 rounded-xl text-sm flex gap-2" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent)' }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
          <div>
            <div className="font-medium">Overlapping activities detected:</div>
            <ul className="list-disc ml-4 mt-1" style={{ color: 'var(--text-secondary)' }}>
              {overlapWarning.map(o => <li key={o.id}>{o.title}</li>)}
            </ul>
            <button className="btn mt-2 !py-1.5" onClick={() => save(true)}>Save anyway</button>
          </div>
        </div>
      )}
      {error && <div className="mt-3 text-sm px-3 py-2 rounded-xl" style={{ background: 'rgba(200,60,90,0.15)', color: 'var(--accent)' }}>{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={saving} onClick={() => save(false)}>
          {rescheduleMode ? 'Reschedule Task' : task ? 'Save Task' : 'Save Task'}
        </button>
      </div>
    </div>
  );
}
