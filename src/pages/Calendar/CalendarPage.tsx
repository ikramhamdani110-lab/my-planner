import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Repeat } from 'lucide-react';
import { api, toISO, today, fmtTime } from '@/services/api';
import { useUI } from '@/contexts/UIContext';
import type { Task, TaskOccurrence } from '@/types';
import { StatusBadge } from '@/components/tasks/TaskCard';

type ViewMode = 'day' | 'week' | 'month' | 'year';

/** One schedulable block on the calendar: a plain task or one occurrence of a recurring series. */
type Block = Task & { is_occurrence?: boolean; occurrence_id?: number };

const HOUR_H = 48;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarPage({ focusTaskId }: { focusTaskId?: string | null }) {
  const { openModal } = useUI();
  const [view, setView] = useState<ViewMode>(focusTaskId ? 'week' : 'day');
  const [cursor, setCursor] = useState(new Date());
  const [tasks, setTasks] = useState<Block[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [dragTask, setDragTask] = useState<Block | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const iso = toISO(cursor);

  const load = async () => {
    let from = iso, to = iso;
    if (view === 'week') {
      const dow = (cursor.getDay() + 6) % 7;
      from = toISO(new Date(cursor.getTime() - dow * 86400000));
      to = toISO(new Date(new Date(from + 'T00:00:00').getTime() + 6 * 86400000));
    } else if (view === 'month') {
      from = toISO(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
      to = toISO(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
    } else if (view === 'year') {
      from = `${cursor.getFullYear()}-01-01`; to = `${cursor.getFullYear()}-12-31`;
    }
    const r = await api.tasksByDateRange(from, to);
    // Merge in the materialized OCCURRENCES of recurring series so every
    // scheduled date of a recurring task shows up on its own day.
    let blocks: Block[] = r.ok
      ? (r.data as Task[]).filter(t => !t.recurrence_rule) as Block[]
      : [];
    const o = await api.occurrencesRange(from, to);
    if (o.ok) {
      blocks = blocks.concat((o.data as TaskOccurrence[]).map(occ => ({
        ...(occ as any),
        id: occ.series_id,
        start_date: occ.start_date,
        end_date: occ.end_date,
        start_time: occ.start_time ?? '00:00',
        end_time: occ.end_time ?? '23:59',
        is_occurrence: true,
        occurrence_id: occ.id
      })));
    }
    setTasks(blocks);
    if (view === 'day') setSelectedDate(iso);
  };
  useEffect(() => { load(); }, [iso, view]);

  useEffect(() => {
    if (view === 'day') {
      const h = new Date().getHours();
      scrollRef.current?.scrollTo({ top: Math.max(0, h * HOUR_H - 120) });
    }
  }, [view, iso]);

  const navigate = (dir: number) => {
    const d = new Date(cursor);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else if (view === 'month') d.setMonth(d.getMonth() + dir);
    else d.setFullYear(d.getFullYear() + dir);
    setCursor(d);
  };

  const title = useMemo(() => {
    if (view === 'day') return cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (view === 'week') {
      const dow = (cursor.getDay() + 6) % 7;
      const start = new Date(cursor.getTime() - dow * 86400000);
      const end = new Date(start.getTime() + 6 * 86400000);
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (view === 'month') return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return String(cursor.getFullYear());
  }, [cursor, view]);

  const weekDays = useMemo(() => {
    const dow = (cursor.getDay() + 6) % 7;
    const start = new Date(cursor.getTime() - dow * 86400000);
    return Array.from({ length: 7 }, (_, i) => toISO(new Date(start.getTime() + i * 86400000)));
  }, [iso]);

  const dropOnSlot = async (date: string, hour: number) => {
    if (!dragTask) return;
    const start = `${String(hour).padStart(2, '0')}:00`;
    const [eh, em] = dragTask.end_time.split(':').map(Number);
    const durMin = (eh * 60 + em) - (Number(dragTask.start_time.split(':')[0]) * 60 + Number(dragTask.start_time.split(':')[1]));
    const endHour = hour + Math.max(1, Math.ceil(durMin / 60));
    const end = `${String(Math.min(23, endHour)).padStart(2, '0')}:${String(durMin % 60 || 0).padStart(2, '0')}`;
    if (dragTask.is_occurrence) {
      // Moving one occurrence never changes the repeat pattern.
      await api.occurrencesReschedule({ id: dragTask.occurrence_id!, startDate: date, endDate: date, startTime: start, endTime: end, reason: 'Moved via calendar' });
    } else {
      await api.tasksReschedule({ id: dragTask.id, startDate: date, endDate: date, startTime: start, endTime: end, reason: 'Moved via calendar' });
    }
    setDragTask(null);
    load();
  };

  /* ---------- DAY VIEW ---------- */
  const DayView = () => {
    const dayTasks = tasks.filter(t => t.start_date <= iso && t.end_date >= iso);
    const nowH = new Date().getHours() + new Date().getMinutes() / 60;
    return (
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="relative" style={{ height: 24 * HOUR_H }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute left-0 right-0 flex border-t" style={{ top: h * HOUR_H, height: HOUR_H, borderColor: 'var(--border)' }}
              onDoubleClick={() => openModal({ kind: 'task', defaultDate: iso })}>
              <div className="w-14 shrink-0 text-xs pr-2 text-right pt-1" style={{ color: 'var(--text-secondary)' }}>{String(h).padStart(2, '0')}:00</div>
              <div className="flex-1" onDragOver={e => e.preventDefault()} onDrop={() => dropOnSlot(iso, h)} />
            </div>
          ))}
          {/* current time line */}
          <div className="absolute left-14 right-2 flex items-center pointer-events-none" style={{ top: nowH * HOUR_H }}>
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
            <div className="flex-1 border-t-2" style={{ borderColor: 'var(--accent)' }} />
            <span className="text-xs px-1" style={{ color: 'var(--accent)' }}>{fmtTime(toISOTime(new Date()), false)}</span>
          </div>
          {/* task blocks */}
          {dayTasks.map(task => {
            const [sh, sm] = task.start_time.split(':').map(Number);
            const [eh, em] = task.end_time.split(':').map(Number);
            const top = (sh + sm / 60) * HOUR_H;
            const height = Math.max(24, ((eh + em / 60) - (sh + sm / 60)) * HOUR_H);
            return (
              <div key={task.id} draggable
                onDragStart={() => setDragTask(task)}
                onClick={() => { (window as any).__openTask?.(task.id); }}
                className="absolute left-16 right-2 rounded-lg p-2 text-xs cursor-pointer overflow-hidden"
                style={{
                  top, height, background: task.color || 'var(--primary)',
                  border: '1px solid var(--border)', opacity: task.status === 'completed' ? 0.6 : 1,
                  color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)'
                }}
                title={`${task.title} (${task.start_time}–${task.end_time})` + (task.is_occurrence ? ' — recurring' : '')}>
                <div className="font-medium truncate flex items-center gap-1">
                  {task.is_occurrence && <Repeat size={10} />}{task.title}
                </div>
                <div className="opacity-80">{fmtTime(task.start_time, false)}–{fmtTime(task.end_time, false)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ---------- WEEK VIEW ---------- */
  const WeekView = () => (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-8 min-w-[900px]">
        <div className="w-14 shrink-0" />
        {weekDays.map(d => (
          <div key={d} className="text-center py-2 text-sm border-l" style={{ borderColor: 'var(--border)', background: d === today() ? 'var(--card)' : undefined }}>
            <div style={{ color: 'var(--text-secondary)' }}>{DAY_NAMES[(new Date(d + 'T00:00:00').getDay() + 6) % 7]}</div>
            <div className="font-semibold">{Number(d.slice(8))}</div>
          </div>
        ))}
        {Array.from({ length: 24 }, (_, h) => (
          <React.Fragment key={h}>
            <div className="w-14 shrink-0 text-xs pr-2 text-right border-t pt-1" style={{ height: HOUR_H, color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>{h}:00</div>
            {weekDays.map(d => {
              const cell = tasks.filter(t => d >= t.start_date && d <= t.end_date &&
                Number(t.start_time.split(':')[0]) <= h && Number(t.end_time.split(':')[0]) > h);
              return (
                <div key={d + h} className="border-l border-t p-0.5" style={{ height: HOUR_H, borderColor: 'var(--border)' }}
                  onDragOver={e => e.preventDefault()} onDrop={() => dropOnSlot(d, h)}
                  onDoubleClick={() => openModal({ kind: 'task', defaultDate: d })}>
                  {h === 0 && cell.map(task => (
                    <div key={task.id} draggable onDragStart={() => setDragTask(task)}
                      className="rounded px-1 py-0.5 text-[11px] truncate cursor-pointer mb-0.5"
                      style={{ background: task.color || 'var(--primary)', color: '#fff' }}
                      title={`${task.title} ${task.start_time}–${task.end_time}`}>
                      {task.status === 'completed' ? '✓ ' : ''}{task.is_occurrence && <Repeat size={9} className="inline mr-0.5" />}{task.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  /* ---------- MONTH VIEW ---------- */
  const MonthView = () => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const cells: (string | null)[] = [
      ...Array(lead).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => toISO(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)))
    ];
    const countFor = (d: string) => tasks.filter(t => d >= t.start_date && d <= t.end_date && t.status !== 'completed').length;
    return (
      <div className="flex-1 grid grid-cols-7 auto-rows-fr min-h-0">
        {DAY_NAMES.map(d => <div key={d} className="text-center text-xs py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>{d}</div>)}
        {cells.map((d, i) => d ? (
          <div key={i} className="border p-1.5 cursor-pointer hover:opacity-80 min-h-[84px]"
            style={{ borderColor: 'var(--border)', background: d === today() ? 'var(--bg-secondary)' : undefined }}
            onClick={() => setSelectedDate(d)}
            onDoubleClick={() => openModal({ kind: 'task', defaultDate: d })}>
            <div className="text-xs font-medium">{Number(d.slice(8))}</div>
            {countFor(d) > 0 && (
              <div className="mt-1 text-[11px] px-1.5 py-0.5 rounded-full inline-block"
                style={{ background: 'var(--primary-dark)', color: 'var(--accent-soft)' }}>
                {countFor(d)} task{countFor(d) > 1 ? 's' : ''}
              </div>
            )}
            {selectedDate === d && (
              <div className="mt-1 space-y-0.5">
                {tasks.filter(t => d >= t.start_date && d <= t.end_date).slice(0, 3).map(t => (
                  <div key={t.id} className="text-[10px] truncate rounded px-1" style={{ background: t.color || 'var(--primary)', color: '#fff' }}>{t.title}</div>
                ))}
              </div>
            )}
          </div>
        ) : <div key={i} className="border" style={{ borderColor: 'var(--border)' }} />)}
      </div>
    );
  };

  /* ---------- YEAR VIEW ---------- */
  const YearView = () => (
    <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-4 p-2 content-start">
      {Array.from({ length: 12 }, (_, m) => {
        const first = new Date(cursor.getFullYear(), m, 1);
        const days = new Date(cursor.getFullYear(), m + 1, 0).getDate();
        const lead = (first.getDay() + 6) % 7;
        const monthTasks = tasks.filter(t => t.start_date.slice(0, 7) === `${cursor.getFullYear()}-${String(m + 1).padStart(2, '0')}`);
        const done = monthTasks.filter(t => t.status === 'completed').length;
        return (
          <div key={m} className="card p-3 cursor-pointer hover:opacity-90"
            onClick={() => { setCursor(new Date(cursor.getFullYear(), m, 1)); setView('month'); }}>
            <div className="text-sm font-semibold mb-2">{first.toLocaleDateString('en-US', { month: 'long' })}</div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array(lead).fill(0).map((_, i) => <div key={'l' + i} />)}
              {Array.from({ length: days }, (_, i) => {
                const d = `${cursor.getFullYear()}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                const has = monthTasks.some(t => d >= t.start_date && d <= t.end_date);
                return <div key={i} className="h-2.5 rounded-sm" style={{ background: has ? 'var(--accent)' : 'var(--bg-secondary)' }} />;
              })}
            </div>
            {monthTasks.length > 0 && (
              <div className="text-[11px] mt-2" style={{ color: 'var(--text-secondary)' }}>
                {monthTasks.length} tasks · {Math.round(done / monthTasks.length * 100)}% done
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <button className="btn-secondary !px-2" onClick={() => navigate(-1)}><ChevronLeft size={16} /></button>
        <button className="btn-secondary !px-2" onClick={() => navigate(1)}><ChevronRight size={16} /></button>
        <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setCursor(new Date())}>Today</button>
        <h3 className="font-semibold">{title}</h3>
        <div className="flex-1" />
        <div className="flex gap-1">
          {(['day', 'week', 'month', 'year'] as ViewMode[]).map(v => (
            <button key={v} className={`chip ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
        <button className="btn" onClick={() => openModal({ kind: 'task', defaultDate: view === 'day' ? iso : selectedDate })}>
          <Plus size={15} />New
        </button>
      </div>
      {view === 'day' && <DayView />}
      {view === 'week' && <WeekView />}
      {view === 'month' && <MonthView />}
      {view === 'year' && <YearView />}
    </div>
  );
}

function toISOTime(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
