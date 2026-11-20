import type { WebDatabase } from './webDatabase';

/**
 * RECURRENCE ENGINE
 *
 * A recurring task ("series") is a normal task row with a `recurrence_rule`.
 * The rule is a JSON string:
 *
 *   { "freq": "daily"  }                                    -> every day
 *   { "freq": "weekly", "weekdays": [0] }                   -> every week on those days
 *   { "freq": "custom", "weekdays": [0,1,3] }               -> every selected weekday
 *   { "end": "never" }  |  { "end": "on", "endDate": "YYYY-MM-DD" }
 *
 * weekdays are 0=Sunday ... 6=Saturday (JS Date.getDay()).
 * A `null` recurrence_rule means a one-time task.
 */

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'custom';
  /** 0=Sunday ... 6=Saturday. Required for weekly (defaults to the series weekday) and custom. */
  weekdays?: number[];
  end: 'never' | 'on';
  endDate?: string;
}

export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Parse a stored rule; null/invalid = one-time task. */
export function parseRule(raw: string | null | undefined): RecurrenceRule | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw);
    if (r && (r.freq === 'daily' || r.freq === 'weekly' || r.freq === 'custom')) {
      return {
        freq: r.freq,
        weekdays: Array.isArray(r.weekdays) ? r.weekdays.filter((n: any) => Number.isInteger(n) && n >= 0 && n <= 6) : undefined,
        end: r.end === 'on' && r.endDate ? 'on' : 'never',
        endDate: r.end === 'on' ? r.endDate : undefined
      };
    }
  } catch { /* legacy string rule -> one-time */ }
  return null;
}

export function ruleToJSON(rule: RecurrenceRule): string {
  return JSON.stringify(rule);
}

/** Human label shown on cards/details, e.g. "Every Monday, Wednesday, Friday". */
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

const DAY_MS = 86400000;
const toDay = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00') / DAY_MS);
const fromDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Does the series fire on this date (inclusive of the series start date)? */
export function firesOn(rule: RecurrenceRule, seriesStart: string, date: string): boolean {
  if (date < seriesStart) return false;
  if (rule.end === 'on' && rule.endDate && date > rule.endDate) return false;
  if (rule.freq === 'daily') return true;
  const dow = new Date(date + 'T00:00:00').getDay();
  if (rule.freq === 'weekly') {
    const days = rule.weekdays?.length ? rule.weekdays : [new Date(seriesStart + 'T00:00:00').getDay()];
    return days.includes(dow);
  }
  return (rule.weekdays ?? []).includes(dow);
}

/**
 * All occurrence dates of a series inside [from, to].
 * The caller skips dates that already exist as occurrence rows.
 */
export function occurrenceDates(rule: RecurrenceRule, seriesStart: string, from: string, to: string): string[] {
  const out: string[] = [];
  const hardEnd = rule.end === 'on' && rule.endDate ? (rule.endDate < to ? rule.endDate : to) : to;
  const startDay = Math.max(toDay(seriesStart), toDay(from));
  const endDay = toDay(hardEnd);
  if (endDay < startDay) return out;
  // Safety cap: never materialize more than ~3 years of occurrences.
  if (endDay - startDay > 1100) return out;
  for (let d = startDay; d <= endDay; d++) {
    const iso = fromDay(d);
    if (firesOn(rule, seriesStart, iso)) out.push(iso);
  }
  return out;
}

/** How far ahead occurrences are materialized (90 days). */
export const OCCURRENCE_HORIZON_DAYS = 90;

/** Horizon end date for a series (rule end or today + horizon). */
export function horizonEnd(rule: RecurrenceRule, todayISO: string): string {
  if (rule.end === 'on' && rule.endDate) return rule.endDate;
  return fromDay(toDay(todayISO) + OCCURRENCE_HORIZON_DAYS);
}
