import React from 'react';
import { LayoutDashboard, CalendarDays, ListChecks, Target, BarChart3, StickyNote, ChevronsLeft, ChevronsRight, X } from 'lucide-react';

export type Page = 'home' | 'calendar' | 'tasks' | 'goals' | 'statistics' | 'notes';

const ITEMS: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'statistics', label: 'Statistics', icon: BarChart3 },
  { id: 'notes', label: 'Notes', icon: StickyNote }
];

/**
 * Responsive navigation:
 *   desktop / large tablet (lg+) — permanent column, collapsible to icons
 *   tablet / mobile        — off-canvas drawer over a scrim, opened from the header
 */
export function Sidebar({ page, onNavigate, collapsed, onToggle, drawerOpen, onCloseDrawer }: {
  page: Page;
  onNavigate: (p: Page) => void;
  collapsed: boolean;
  onToggle: () => void;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}) {
  const links = ITEMS.map(({ id, label, icon: Icon }) => {
    const active = page === id;
    return (
      <button key={id} onClick={() => onNavigate(id)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium"
        style={{ background: active ? 'var(--primary)' : 'transparent', color: active ? 'var(--text)' : 'var(--text-secondary)' }}
        title={label} aria-current={active ? 'page' : undefined}>
        <Icon size={18} />
        <span className="truncate">{label}</span>
      </button>
    );
  });

  return (
    <>
      {/* Desktop / large tablet: always visible */}
      <aside className="hidden lg:flex flex-col shrink-0"
        style={{ width: collapsed ? 72 : 232, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 px-4 py-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary)' }}>
            <CalendarDays size={20} color="var(--accent-soft)" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-semibold text-[15px]">My Planner</div>
              <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Personal planner</div>
            </div>
          )}
        </div>
        <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
          {collapsed
            ? ITEMS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => onNavigate(id)}
                  className="w-full flex items-center justify-center px-3 py-2.5 rounded-xl"
                  style={{ background: page === id ? 'var(--primary)' : 'transparent', color: page === id ? 'var(--text)' : 'var(--text-secondary)' }}
                  title={label} aria-label={label} aria-current={page === id ? 'page' : undefined}>
                  <Icon size={18} />
                </button>
              ))
            : links}
        </nav>
        <button onClick={onToggle} aria-label="Collapse sidebar"
          className="m-3 p-2 rounded-xl flex justify-center" style={{ background: 'var(--card)', color: 'var(--text-secondary)' }}>
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </aside>

      {/* Tablet / mobile: slide-over drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onCloseDrawer} />
          <aside className="relative flex flex-col h-full w-[260px] max-w-[82vw] shadow-2xl"
            style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3 px-4 py-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary)' }}>
                <CalendarDays size={20} color="var(--accent-soft)" />
              </div>
              <div className="leading-tight">
                <div className="font-semibold text-[15px]">My Planner</div>
                <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Personal planner</div>
              </div>
              <button className="ml-auto p-1 rounded-lg" onClick={onCloseDrawer} aria-label="Close menu"
                style={{ color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 px-2 space-y-1 overflow-y-auto">{links}</nav>
          </aside>
        </div>
      )}
    </>
  );
}
