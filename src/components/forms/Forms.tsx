import React, { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { useUI } from '@/contexts/UIContext';
import type { Goal } from '@/types';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export function GoalForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const { refresh } = useUI();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '',
    startDate: new Date().toISOString().slice(0, 10),
    targetDate: '', priority: 'medium',
    milestones: [] as { title: string; targetDate?: string }[]
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) { setError('Title cannot be empty.'); return; }
    if (form.targetDate && form.targetDate < form.startDate) { setError('Target date cannot be before start date.'); return; }
    setSaving(true);
    try {
      await api.goalsCreate({
        title: form.title, description: form.description,
        startDate: form.startDate, targetDate: form.targetDate || form.startDate,
        priority: form.priority, milestones: form.milestones.filter(m => m.title.trim())
      });
      refresh(); onSaved();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">New Goal</h2>
      <div className="space-y-3">
        <div>
          <label className="label">Title *</label>
          <input className="input" value={form.title} onChange={e => set('title', e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Start Date *</label>
            <input type="date" className="input" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          </div>
          <div>
            <label className="label">Target Date</label>
            <input type="date" className="input" value={form.targetDate} onChange={e => set('targetDate', e.target.value)} />
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label !mb-0">Milestones</label>
            <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => set('milestones', [...form.milestones, { title: '' }])}>+ Add</button>
          </div>
          {form.milestones.map((m, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input className="input" placeholder="Milestone title" value={m.title}
                onChange={e => set('milestones', form.milestones.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
              <button className="btn-secondary !px-3" onClick={() => set('milestones', form.milestones.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      </div>
      {error && <div className="mt-3 text-sm px-3 py-2 rounded-xl" style={{ background: 'rgba(200,60,90,0.15)', color: 'var(--accent)' }}>{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={saving} onClick={save}>Save Goal</button>
      </div>
    </div>
  );
}

export function NoteForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const { refresh } = useUI();
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', content: '', isPinned: false });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) { setError('Title cannot be empty.'); return; }
    setError('');
    const res = await api.notesCreate(form);
    if (!res.ok) {
      setError(res.error || 'Failed to save note.');
      return;
    }
    refresh(); onSaved();
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">New Note</h2>
      <div className="space-y-3">
        <div>
          <label className="label">Title *</label>
          <input className="input" value={form.title} onChange={e => set('title', e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Content</label>
          <textarea className="input" rows={8} value={form.content} onChange={e => set('content', e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isPinned} onChange={e => set('isPinned', e.target.checked)} /> Pin this note
        </label>
      </div>
      {error && <div className="mt-3 text-sm px-3 py-2 rounded-xl" style={{ background: 'rgba(200,60,90,0.15)', color: 'var(--accent)' }}>{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn" onClick={save}>Save Note</button>
      </div>
    </div>
  );
}
