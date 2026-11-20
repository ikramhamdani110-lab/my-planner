import React, { useEffect, useState } from 'react';
import { Plus, Pin, Trash2, Search, Pencil, Check } from 'lucide-react';
import { api } from '@/services/api';
import { useUI } from '@/contexts/UIContext';
import type { Note } from '@/types';

export function NotesPage() {
  const { refreshKey } = useUI();
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Note | null>(null);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [error, setError] = useState('');

  const load = async () => {
    const r = await api.notesList(search.trim() || undefined);
    if (r.ok) setNotes(r.data!);
  };
  useEffect(() => { load(); }, [search, refreshKey]);

  const saveEdit = async () => {
    if (!editing) return;
    if (!draft.title.trim()) {
      setError('Title cannot be empty');
      return;
    }
    setError('');
    let r;
    if (editing.id) {
      // existing note → update
      r = await api.notesUpdate({ id: editing.id, ...draft });
    } else {
      // new note → create
      r = await api.notesCreate({ ...draft, isPinned: !!editing.is_pinned });
    }
    if (!r.ok) {
      setError(r.error || 'Failed to save note');
      return;
    }
    setEditing(null);
    setError('');
    await load();
  };

  const togglePin = async (n: Note) => { await api.notesUpdate({ id: n.id, is_pinned: !n.is_pinned }); load(); };

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex gap-2 mb-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input className="input pl-9" placeholder="Search notes…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn" onClick={() => { setError(''); setEditing({ id: 0, title: '', content: '', is_pinned: 0, linked_goal_id: null, linked_task_id: null, created_at: '', updated_at: '' }); setDraft({ title: '', content: '' }); }}>
          <Plus size={15} />New Note
        </button>
      </div>

      {editing && (
        <div className="card p-4 mb-4">
          <div className="flex gap-2 mb-2">
            <input className="input" placeholder="Title" value={draft.title} onChange={e => { setError(''); setDraft(d => ({ ...d, title: e.target.value })); }} />
          </div>
          <textarea className="input" rows={5} placeholder="Write your note…" value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} />
          {error && <div className="text-xs mt-2" style={{ color: 'var(--accent)' }}>{error}</div>}
          <div className="flex justify-end gap-2 mt-2">
            <button className="btn-secondary" onClick={() => { setEditing(null); setError(''); }}>Cancel</button>
            <button className="btn" onClick={saveEdit}><Check size={14} />Save</button>
          </div>
        </div>
      )}

      {notes.length === 0 && <div className="card p-8 text-center" style={{ color: 'var(--text-secondary)' }}>No notes found.</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {notes.map(n => (
          <div key={n.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{n.title}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{n.updated_at?.slice(0, 10)}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button className="p-1" style={{ color: n.is_pinned ? 'var(--accent)' : 'var(--text-secondary)' }} onClick={() => togglePin(n)}><Pin size={14} /></button>
                <button className="p-1" style={{ color: 'var(--text-secondary)' }} onClick={() => { setEditing(n); setDraft({ title: n.title, content: n.content }); }}><Pencil size={14} /></button>
                <button className="p-1" style={{ color: 'var(--text-secondary)' }} onClick={async () => {
                  if (confirm('Delete this note?')) { await api.notesDelete(n.id); load(); }
                }}><Trash2 size={14} /></button>
              </div>
            </div>
            <p className="text-sm mt-2 whitespace-pre-wrap line-clamp-4" style={{ color: 'var(--text-secondary)' }}>{n.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
