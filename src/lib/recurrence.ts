/**
 * Renderer-side mirror of electron/database/recurrence.ts.
 * Parse + describe recurrence rules stored on tasks.
 */

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'custom';
  weekdays?: number[];
  end: 'never' | 'on';
  endDate?: string;
}

export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseRule(raw: string | null | undefined): RecurrenceRule | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw);
    if (r && (r.freq === 'daily' || r.freq === 'weekly' || r.freq === 'custom')) {
      return {
        freq: r.freq,
        weekdays: Array.isArray(r.weekdays) ? r.weekdays : undefined,
        end: r.end === 'on' && r.endDate ? 'on' : 'never',
        endDate: r.end === 'on' ? r.endDate : undefined
      };
    }
  } catch { /* ignore */ }
  return null;
}

export function ruleToJSON(rule: RecurrenceRule): string {
  return JSON.stringify(rule);
}

export function describeRule(rule: RecurrenceRule | null, seriesStartDate?: string): string {
  if (!rule) return '';
  let text: string;
  if (rule.freq === 'daily') text = 'Every day';
  else {
    const days = (rule.weekdays && rule.weekdays.length
      ? [...rule.weekdays]
      : seriesStartDate ? [new Date(seriesStartDate + 'T00:00:00').getDay()] : []
    ).sort((a, b) => a - b);
    if (rule.freq === 'weekly' && days.length === 1) text = `Every week on ${DAY_LABELS[days[0]]}`;
    else if (days.length === 0) text = 'Recurring';
    else text = `Every ${days.map(d => DAY_LABELS[d]).join(', ')}`;
  }
  if (rule.end === 'on' && rule.endDate) text += ` until ${rule.endDate}`;
  return text;
}
