import React, { useEffect, useMemo, useState } from 'react';
import { Search, Repeat } from 'lucide-react';
import { api, today, fmtDate } from '@/services/api';
import { useUI } from '@/contexts/UIContext';
import { TaskCard } from '@/components/tasks/TaskCard';
import { TaskDetails } from '@/components/tasks/TaskDetails';
import { RescheduleDialog } from '@/components/tasks/RescheduleDialog';
import type { Task, TaskOccurrence } from '@/types';
import { parseRule, describeRule } from '@/lib/recurrence';

type Tab = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed' | 'rescheduled';
const TABS: Tab[] = ['all', 'today', 'upcoming', 'overdue', 'completed', 'rescheduled'];

/**
 * Unified activity card: a plain task OR one occurrence of a recurring series.
 * Occurrences carry `is_occurrence: true` and their own status/date, so each
 * date of a recurring task can be completed/missed/rescheduled independently.
 */
type Activity = (Task & { is_occurrence?: false }) | TaskOccurrence;

export function TasksPage({ focusTaskId }: { focusTaskId?: string | null }) {
  const { openModal, refreshKey } = useUI();
  const [tasks, setTasks] = useState<Activity[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sort, setSort] = useState('date');
  const [detailsId, setDetailsId] = useState<number | null>(focusTaskId ? Number(focusTaskId.replace('task-', '')) : null);
  const [resched, setResched] = useState<{ occ?: TaskOccurrence; task?: Task } | null>(null);


  useEffect(() => {
    const load = async () => {
      const t = today();
      let plain: Task[] = [];
      const q = search.trim();
      if (q.length >= 2) {
        const r = await api.tasksSearch(q);
        plain = r.ok ? r.data! : [];
      } else {
        const r = await api.tasksFilter({
          status: statusFilter || undefined,
          priority: priorityFilter || undefined
        });
        plain = r.ok ? r.data! : [];
      }
      // Recurring series are represented by their OCCURRENCES in this view.
      const series: Task[] = [];
      const singles: Task[] = [];
      for (const x of plain) (x.recurrence_rule ? series : singles).push(x);

      let occs: TaskOccurrence[] = [];
      if (series.length) {
        const from = tab === 'upcoming' ? t : '2000-01-01';
        const to = tab === 'overdue' ? t : '2100-01-01';
        const r = await api.occurrencesRange(from, to);
        if (r.ok) {
          occs = r.data!.filter(o =>
            series.some(s => s.id === o.series_id) &&
            (!statusFilter || o.status === statusFilter) &&
            (!priorityFilter || o.priority === priorityFilter) &&
            (!q || o.title.toLowerCase().includes(q.toLowerCase()))
          );
        }
      }

      let list: Activity[] = [...singles, ...occs];
      const st = (x: Activity) => x.status;
      const sd = (x: Activity) => (x as any).occurrence_date ?? x.start_date;
      if (tab === 'today') list = list.filter(x => sd(x) === t);
      if (tab === 'upcoming') list = list.filter(x => sd(x) > t);
      if (tab === 'overdue') list = list.filter(x => sd(x) < t && ['not_started', 'in_progress'].includes(st(x)));
      if (tab === 'completed') list = list.filter(x => st(x) === 'completed');
      if (tab === 'rescheduled') list = list.filter(x => st(x) === 'rescheduled' || x.original_start_date);
      if (sort === 'priority') {
        const order: any = { urgent: 0, high: 1, medium: 2, low: 3 };
        list.sort((a, b) => order[a.priority] - order[b.priority]);
      } else if (sort === 'title') {
        list.sort((a, b) => a.title.localeCompare(b.title));
      } else {
        list.sort((a, b) => (sd(a) + (a.start_time ?? '')).localeCompare(sd(b) + (b.start_time ?? '')));
      }
      setTasks(list);
    };
    load();
  }, [tab, search, statusFilter, priorityFilter, sort, refreshKey]);

  const badge = (x: Activity) => {
    const rule = parseRule(x.recurrence_rule);
    if (!rule) return null;
    return describeRule(rule, x.start_date);
  };

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex gap-1 flex-wrap mb-4">
        {TABS.map(tb => <button key={tb} className={`chip ${tab === tb ? 'active' : ''}`}
          onClick={() => setTab(tb)}>{tb === 'all' ? 'All Tasks' : tb[0].toUpperCase() + tb.slice(1)}</button>)}
      </div>
      <div className="flex gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input className="input pl-9" placeholder="Search tasksâ€¦" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input !w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="not_started">Not Started</option><option value="in_progress">In Progress</option>
          <option value="completed">Completed</option><option value="rescheduled">Rescheduled</option>
          <option value="missed">Missed</option>
        </select>
        <select className="input !w-auto" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          <option value="">All priorities</option>
          <option value="low">Low</option><option value="medium">Medium</option>
          <option value="high">High</option><option value="urgent">Urgent</option>
        </select>
        <select className="input !w-auto" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="date">Sort: Date</option><option value="priority">Sort: Priority</option><option value="title">Sort: Title</option>
        </select>
      </div>
      {tasks.length === 0 && <div className="card p-8 text-center" style={{ color: 'var(--text-secondary)' }}>No tasks match the current filters.</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {tasks.map(x => {
          const isOcc = (x as any).is_occurrence === true;
          return (
            <div key={`${isOcc ? 'o' : 't'}-${x.id}`} className="relative">
              {isOcc && (
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>
                  <Repeat size={10} /> {(x as TaskOccurrence).occurrence_date}
                </div>
              )}
              <TaskCard
                task={{ ...(x as Task), status: x.status as any, start_date: isOcc ? (x as TaskOccurrence).start_date : x.start_date }}
                onClick={() => {
                  if (isOcc) {
                    const occ = x as TaskOccurrence;
                    setResched({ occ, task: { id: occ.series_id, title: occ.title, start_date: occ.start_date, end_date: occ.end_date, start_time: occ.start_time ?? '09:00', end_time: occ.end_time ?? '10:00' } as any });
                  } else {
                    setDetailsId(x.id);
                  }
                }}
              />
              {isOcc && (x as TaskOccurrence).status !== 'completed' && (
                <div className="absolute bottom-2 right-2 z-10 flex gap-1">
                  <button className="btn !py-1 !px-2 text-[11px]" title="Mark completed"
                    onClick={async e => { e.stopPropagation(); await api.occurrencesSetStatus((x as TaskOccurrence).id, 'completed'); setTasks(ts => ts.map(o => o === x ? { ...o, status: 'completed' as any } : o)); }}>
                    âœ“
                  </button>
                  <button className="btn-secondary !py-1 !px-2 text-[11px]" title="Reschedule this occurrence"
                    onClick={e => { e.stopPropagation(); setResched({ occ: x as TaskOccurrence }); }}>
                    âŸ³
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {detailsId && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDetailsId(null); }}>
          <div className="card w-[560px] max-h-[85vh] overflow-y-auto p-6">
            <TaskDetails id={detailsId} onClose={() => setDetailsId(null)} onEdit={() => {}} />
          </div>
        </div>
      )}
      {resched && (
        <RescheduleDialog
          occurrence={resched.occ}
          task={resched.occ ? undefined : resched.task}
          onClose={() => { setResched(null); setTasks(ts => [...ts]); }}
        />
      )}
    </div>
  );
}
