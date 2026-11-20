import type { ApiBridge } from '@/types';

/**
 * The UI bridge. Resolved lazily so import order does not matter: whichever
 * module touches `api` first, it always talks to the current window.api.
 */
export const api: ApiBridge = new Proxy({} as ApiBridge, {
  get(_target, prop) {
    const real = (window as any).api;
    if (!real) {
      return () => Promise.resolve({ ok: false as const, error: 'The planner is still starting. Please wait a moment.' });
    }
    const value = real[prop];
    return typeof value === 'function' ? value.bind(real) : value;
  }
});

export async function unwrap<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error ?? 'Unexpected error');
  return r.data as T;
}

/* ---------- date helpers ---------- */
export const toISO = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const today = () => toISO(new Date());
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const fmtDate = (iso: string, opts?: { weekday?: boolean }) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: opts?.weekday ? 'short' : undefined,
    month: 'short', day: 'numeric', year: 'numeric'
  });
};
export const fmtTime = (t: string, use12: boolean) => {
  if (!t) return '';
  if (!use12) return t.slice(0, 5);
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent'
};
export const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started', in_progress: 'In Progress', completed: 'Completed',
  rescheduled: 'Rescheduled', missed: 'Missed'
};
