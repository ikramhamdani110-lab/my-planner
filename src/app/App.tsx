import React, { useCallback, useEffect, useState } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { UIProvider, useUI } from '@/contexts/UIContext';
import { Sidebar, Page } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { ModalHost } from '@/components/layout/ModalHost';
import { HomePage } from '@/pages/Home/HomePage';
import { CalendarPage } from '@/pages/Calendar/CalendarPage';
import { TasksPage } from '@/pages/Tasks/TasksPage';
import { GoalsPage } from '@/pages/Goals/GoalsPage';
import { StatisticsPage } from '@/pages/Statistics/StatisticsPage';
import { NotesPage } from '@/pages/Notes/NotesPage';
import { SettingsPage } from '@/pages/Settings/SettingsPage';
import { api } from '@/services/api';
import type { ThemeMode } from '@/types';
import { initPlanner } from '@/services/plannerApi';

const TITLES: Record<Page, string> = {
  home: 'Home', calendar: 'Calendar', tasks: 'Tasks', goals: 'Goals',
  statistics: 'Statistics', notes: 'Notes', settings: 'Settings'
};

function Shell() {
  const [page, setPage] = useState<Page>('home');
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hash, setHash] = useState(window.location.hash);
  const { openModal } = useUI();

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        const map: Record<string, Page> = { '1': 'home', '2': 'calendar', '3': 'tasks', '4': 'goals', '5': 'statistics' };
        if (map[e.key]) { e.preventDefault(); setPage(map[e.key]); }
        if (e.key.toLowerCase() === 'n') {
          e.preventDefault();
          openModal({ kind: 'task', defaultDate: new Date().toISOString().slice(0, 10) });
        }
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          const input = document.querySelector<HTMLInputElement>('header input.input');
          input?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openModal]);

  const navigateTo = useCallback((p: Page) => {
    setPage(p);
    setDrawerOpen(false);
    if (window.location.hash) window.location.hash = '';
  }, []);

  const focusTaskId = hash.startsWith('#task-') ? hash.slice(1) : null;

  /** Jump straight to an item found via the global search. */
  const goToItem = useCallback((type: string, id: number) => {
    switch (type) {
      case 'Task':
        setPage('tasks');
        window.location.hash = `task-${id}`;
        setHash(window.location.hash);
        break;
      case 'Goal': setPage('goals'); break;
      case 'Note': setPage('notes'); break;
    }
  }, []);

  return (
    <div className="flex h-full" style={{ background: 'transparent' }}>
      <Sidebar page={page} onNavigate={navigateTo} collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        drawerOpen={drawerOpen} onCloseDrawer={() => setDrawerOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={TITLES[page]}
          onQuickAdd={(kind) => openModal({ kind: kind as 'task' | 'goal' | 'note', defaultDate: new Date().toISOString().slice(0, 10) })}
          onSearchNavigate={r => goToItem(r.type, r.id)}
          onToggleSidebar={() => setDrawerOpen(o => !o)} />
        <main className="flex-1 min-h-0 overflow-hidden">
          {page === 'home' && <HomePage onNavigate={navigateTo} userName="" />}
          {page === 'calendar' && <CalendarPage focusTaskId={focusTaskId} />}
          {page === 'tasks' && <TasksPage focusTaskId={focusTaskId} />}
          {page === 'goals' && <GoalsPage />}
          {page === 'statistics' && <StatisticsPage />}
          {page === 'notes' && <NotesPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
      <ModalHost />
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('dark-red');
  const [error, setError] = useState<string | null>(null);

  // The website opens straight into the planner — no login, no accounts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initPlanner();
        const r = await api.settingsGetAll();
        const saved = (r.ok && r.data?.theme) as ThemeMode | undefined;
        if (!cancelled && saved) setTheme(saved);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? String(err));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="card p-6 max-w-md">
          <h2 className="font-semibold mb-2">My Planner could not start</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
          <p className="text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>
            Try reloading the page. If it keeps happening, your browser may be blocking storage.
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading your planner…</div>
      </div>
    );
  }

  return (
    <ThemeProvider initialMode={theme}>
      <UIProvider>
        <Shell />
      </UIProvider>
    </ThemeProvider>
  );
}
