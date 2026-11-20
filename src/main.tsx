import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import '@/styles/globals.css';
import { buildApi, flushSave } from '@/services/plannerApi';

// Install the browser implementation of window.api synchronously, before React
// mounts and before any await, so the UI never sees a missing bridge.
// (The database itself opens asynchronously inside App.)
(window as any).api = buildApi();

// Make sure unsaved planner changes are written when the tab goes away.
window.addEventListener('beforeunload', () => { void flushSave(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) void flushSave(); });

// Neutralise recursive console.error serialisation used by some libraries.
const origError = console.error.bind(console);
console.error = (...args: any[]) => {
  try {
    origError(...args.map(a => (typeof a === 'string' ? a : (a && a.message) || Object.prototype.toString.call(a))));
  } catch {
    origError('[console.error]');
  }
};

createRoot(document.getElementById('root')!).render(<App />);

// Surface unexpected errors (useful when debugging in the browser console).
window.addEventListener('unhandledrejection', (e: any) => {
  const r = e?.reason;
  const msg = r instanceof Error
    ? r.stack
    : (typeof r === 'string' ? r : `message=${r?.message} stack=${r?.stack}`);
  console.error('[unhandledrejection] ' + String(msg));
  e.preventDefault?.();
});
