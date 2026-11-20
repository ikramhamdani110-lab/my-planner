import React, { useEffect, useRef, useState } from 'react';
import { Search, Plus, Bell, Palette, Moon, Sun, Sunrise, ListChecks, Target, StickyNote } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { api } from '@/services/api';
import type { ThemeMode, SearchResults } from '@/types';

type FlatResult = { type: 'Task' | 'Goal' | 'Note'; title: string; id: number; detail?: string };

/** Simple hamburger icon for the mobile menu button. */
function MenuGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

/** All themes are available in the single personal workspace. */
const THEME_OPTIONS: { id: ThemeMode; label: string; icon: React.ElementType }[] = [
  { id: 'dark-red', label: 'Dark Red', icon: Moon },
  { id: 'baby-pink', label: 'Baby Pink', icon: Sunrise },
  { id: 'dark-blue', label: 'Dark Blue', icon: Moon },
  { id: 'baby-blue', label: 'Baby Blue', icon: Sun }
];

export function Header({ title, onQuickAdd, onSearchNavigate, onToggleSidebar }: {
  title: string;
  onQuickAdd: (kind: 'task' | 'goal' | 'note') => void;
  onSearchNavigate: (result: FlatResult) => void;
  onToggleSidebar: () => void;
}) {
  const { mode, setMode } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FlatResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showBell, setShowBell] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  /* ---------------- real global search ---------------- */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setShowResults(false); return; }
    const t = setTimeout(async () => {
      const r = await api.searchAll(q);
      if (r.ok) {
        const d = r.data as SearchResults;
        const flat: FlatResult[] = [
          ...d.tasks.map((t: any) => ({ type: 'Task' as const, title: t.title, id: t.id, detail: t.date })),
          ...d.goals.map((g: any) => ({ type: 'Goal' as const, title: g.title, id: g.id })),
          ...d.notes.map((n: any) => ({ type: 'Note' as const, title: n.title, id: n.id }))
        ];
        setResults(flat);
        setShowResults(true);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  /* ---------------- notification bell ---------------- */
  useEffect(() => {
    let active = true;
    const poll = async () => {
      const c = await api.notificationsUnreadCount();
      if (!active) return;
      if (c.ok) setUnread(c.data as number);
      if (showBell) {
        const list = await api.notificationsList();
        if (active && list.ok) setNotifications(list.data as any[]);
      }
    };
    poll();
    const iv = setInterval(poll, 15000);
    return () => { active = false; clearInterval(iv); };
  }, [showBell]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      // Only close when clicking genuinely outside; clicking a menu button or
      // inside a dropdown must NOT close (that broke Quick Add and the palette).
      if (el.closest('header')) return;
      if (el.closest('.modal-backdrop')) return;
      setShowResults(false); setShowAdd(false); setShowTheme(false); setShowBell(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const themeOptions = THEME_OPTIONS;

  const quickAddItems = [
    { kind: 'task' as const, label: 'Task', icon: ListChecks },
    { kind: 'goal' as const, label: 'Goal', icon: Target },
  ];

  const ICONS: Record<string, React.ElementType> = { Task: ListChecks, Goal: Target, Note: StickyNote };

  return (
    <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
      <button className="btn-secondary !px-2 lg:hidden shrink-0" title="Menu" onClick={onToggleSidebar} aria-label="Open menu">
        <MenuGlyph />
      </button>
      <h1 className="text-base sm:text-lg font-semibold w-auto sm:w-36 shrink-0 truncate">{title}</h1>
      <div ref={boxRef} className="flex-1 relative max-w-xl">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input className="input pl-9" placeholder="Search tasks, goals, notes…  (Ctrl+F)"
            value={query}
            onFocus={() => results.length && setShowResults(true)}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setShowResults(false); (e.target as HTMLInputElement).blur(); } }} />
        </div>
        {showResults && results.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 card p-2 z-40 max-h-80 overflow-y-auto">
            {results.map((r, i) => {
              const Icon = ICONS[r.type] ?? ListChecks;
              return (
                <button key={i} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:opacity-80 text-left"
                  onClick={() => { onSearchNavigate(r); setShowResults(false); setQuery(''); }}>
                  <Icon size={14} style={{ color: 'var(--accent)' }} />
                  <span className="truncate flex-1">{r.title}</span>
                  {r.detail && <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>{r.detail}</span>}
                  <span className="badge shrink-0" style={{ background: 'var(--primary-dark)', color: 'var(--accent-soft)' }}>{r.type}</span>
                </button>
              );
            })}
          </div>
        )}
        {showResults && query.trim().length >= 2 && results.length === 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 card p-4 z-40 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
            No matches for “{query.trim()}”.
          </div>
        )}
      </div>

      <div className="relative">
        <button className="btn" onClick={() => setShowAdd(s => !s)} aria-label="Quick add">
          <Plus size={16} /> <span className="hidden md:inline">Quick Add</span>
        </button>
        {showAdd && (
          <div className="absolute right-0 top-full mt-2 card p-2 z-40 w-44">
            {quickAddItems.map(({ kind, label, icon: Icon }) => (
              <button key={kind} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:opacity-80 text-left"
                onClick={() => { onQuickAdd(kind); setShowAdd(false); }}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button className="btn-secondary !px-3" title="Notifications" onClick={() => setShowBell(s => !s)}>
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
              style={{ background: 'var(--accent)', color: 'var(--on-primary)' }}>{unread}</span>
          )}
        </button>
        {showBell && (
          <div className="absolute right-0 top-full mt-2 card p-2 z-40 w-72 max-h-80 overflow-y-auto">
            <div className="text-xs font-semibold px-2 py-1 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Reminders</div>
            {notifications.length === 0 && <div className="text-sm px-2 py-3" style={{ color: 'var(--text-secondary)' }}>No reminders scheduled.</div>}
            {notifications.map(n => (
              <div key={n.id} className="px-3 py-2 rounded-lg text-sm flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate">{n.title}</div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(n.scheduled_at).toLocaleString()}
                  </div>
                </div>
                <span className="badge shrink-0" style={{ background: n.fired ? 'var(--card-hover)' : 'var(--primary-dark)', color: 'var(--accent-soft)' }}>
                  {n.fired ? 'sent' : 'due'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button className="btn-secondary !px-3" title="Theme" onClick={() => setShowTheme(s => !s)}>
          <Palette size={16} />
        </button>
        {showTheme && (
          <div className="absolute right-0 top-full mt-2 card p-2 z-40 w-40">
            {themeOptions.map(({ id, label, icon: Icon }) => (
              <button key={id} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left hover:opacity-80"
                style={{ background: mode === id ? 'var(--primary)' : 'transparent', color: mode === id ? 'var(--on-primary)' : 'var(--text)' }}
                onClick={() => { setMode(id); setShowTheme(false); }}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

    </header>
  );
}
