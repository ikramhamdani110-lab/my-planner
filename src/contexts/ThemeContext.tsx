import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'dark-red' | 'baby-pink' | 'dark-blue' | 'baby-blue';
export type Resolved = ThemeMode;

interface ThemeCtx {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (m: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx>({ mode: 'dark-red', resolved: 'dark-red', setMode: () => {} });

const DARK = new Set<Resolved>(['dark-red', 'dark-blue']);

function applyTheme(r: Resolved) {
  const root = document.documentElement;
  for (const t of ['theme-baby-pink', 'theme-dark-blue', 'theme-baby-blue']) root.classList.remove(t);
  if (r !== 'dark-red') root.classList.add(`theme-${r}`);
  root.classList.toggle('dark', DARK.has(r));
}

export function ThemeProvider({ children, initialMode }: { children: React.ReactNode; initialMode?: ThemeMode }) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode ?? 'dark-red');
  const [resolved, setResolved] = useState<Resolved>(initialMode ?? 'dark-red');

  // Apply the saved theme as soon as it is read from storage.
  useEffect(() => {
    if (initialMode) { applyTheme(initialMode); setModeState(initialMode); setResolved(initialMode); }
  }, [initialMode]);

  function apply(m: ThemeMode) {
    applyTheme(m);
    setModeState(m); setResolved(m);
  }

  const setMode = (m: ThemeMode) => { apply(m); window.api.settingsSet('theme', m); };

  return <Ctx.Provider value={{ mode, resolved, setMode }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
