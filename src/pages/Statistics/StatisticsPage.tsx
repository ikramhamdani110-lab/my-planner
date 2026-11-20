import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CalendarDays } from 'lucide-react';
import { api, addDays, today } from '@/services/api';
import type { Goal } from '@/types';

const RANGE_PRESETS = [
  { id: 'day', label: 'Day', days: 1 },
  { id: 'week', label: 'Week', days: 7 },
  { id: 'month', label: 'Month', days: 30 },
  { id: 'year', label: 'Year', days: 365 }
] as const;

const GOAL_COLORS = ['#701F39', '#D88AA6', '#87334F', '#5B5F97', '#4C7A5C', '#C77D99', '#947584', '#B0A8B9'];
const NO_GOAL_COLOR = '#6b7280';

export function StatisticsPage() {
  const [range, setRange] = useState<(typeof RANGE_PRESETS)[number]['id'] | 'custom'>('week');
  const [anchor, setAnchor] = useState(today());          // end date of the range
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [goalFilter, setGoalFilter] = useState<number | null>(null); // null = all goals
  const [goals, setGoals] = useState<Goal[]>([]);
  const [distribution, setDistribution] = useState<any[]>([]);
  const [daily, setDaily] = useState<{ date: string; label: string; total: number; completed: number; rate: number | null }[]>([]);
  const [overall, setOverall] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const resolvedRange = useMemo((): { from: string; to: string } => {
    if (range === 'custom') {
      const from = customFrom || addDays(anchor, -7);
      const to = customTo || anchor;
      return { from: from <= to ? from : to, to: from <= to ? to : from };
    }
    if (range === 'day') {
      return { from: anchor, to: anchor };
    }
    const days = RANGE_PRESETS.find(r => r.id === range)!.days;
    return { from: addDays(anchor, -days + 1), to: anchor };
  }, [range, anchor, customFrom, customTo]);

  /* goal list for the completion-graph selector */
  useEffect(() => {
    api.goalsList().then(r => { if (r.ok) setGoals(r.data!); });
  }, []);

  /* load all statistics whenever range / anchor / goal changes */
  useEffect(() => {
    let active = true;
    setLoading(true);
    const { from, to } = resolvedRange;
    (async () => {
      const [dist, dailyR, rangeR] = await Promise.all([
        api.statsGoalDistribution({ from, to }),
        api.statsDailyGoalCompletion({ from, to, goalId: goalFilter }),
        api.statsRange(from, to)
      ]);
      if (!active) return;
      setDistribution(dist.ok ? dist.data! : []);
      setDaily(dailyR.ok ? (dailyR.data as any[]).map(d => ({
        date: d.date,
        label: d.date.slice(5),
        total: Number(d.total),
        completed: Number(d.completed),
        rate: d.total ? Math.round((Number(d.completed) / d.total) * 100) : null
      })) : []);
      setOverall(rangeR.ok ? rangeR.data : null);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [resolvedRange, goalFilter]);

  const totalScheduled = distribution.reduce((s, d) => s + Number(d.scheduled), 0);
  const topGoal = distribution.filter(d => d.goalId != null)[0];
  const chartData = distribution.map((d, i) => ({
    name: d.name,
    value: Number(d.scheduled),
    completed: Number(d.completed),
    fill: d.goalId == null ? NO_GOAL_COLOR : GOAL_COLORS[i % GOAL_COLORS.length]
  }));
  const connectedDaily = daily.map(d => ({ ...d, rate: d.rate ?? 0 }));

  /* ---- date navigation ---- */
  const step = (dir: 1 | -1) => {
    if (range === 'custom') {
      const span = customFrom && customTo
        ? Math.round((new Date(customTo).getTime() - new Date(customFrom).getTime()) / 86400000) : 0;
      setCustomFrom(f => addDays(f || anchor, dir * (span + 1)));
      setCustomTo(t => addDays(t || anchor, dir * (span + 1)));
    } else if (range === 'day') {
      setAnchor(a => addDays(a, dir));
    } else {
      setAnchor(a => addDays(a, dir * RANGE_PRESETS.find(r => r.id === range)!.days));
    }
  };
  const rangeLabel = range === 'custom'
    ? `${customFrom || '…'} → ${customTo || '…'}`
    : range === 'day'
    ? resolvedRange.from
    : `${resolvedRange.from.slice(5)} → ${resolvedRange.to.slice(5)}`;

  const summaryCards: [string, string][] = overall ? [
    ['Completion Rate', `${overall.total ? Math.round(overall.completed / overall.total * 100) : 0}%`],
    ['Completed', String(overall.completed)],
    ['Missed', String(overall.missed)],
    ['Rescheduled', String(overall.rescheduled)]
  ] : [];

  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* ── range selector ── */}
      <div className="flex gap-1 flex-wrap items-center mb-6">
        {RANGE_PRESETS.map(r => (
          <button key={r.id} className={`chip ${range === r.id ? 'active' : ''}`} onClick={() => setRange(r.id)}>{r.label}</button>
        ))}
        <button className={`chip ${range === 'custom' ? 'active' : ''}`} onClick={() => setRange('custom')}>Custom</button>
        {range === 'day' && (
          <span className="flex items-center gap-1 ml-2">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Select date:</span>
            <input type="date" className="input !w-auto !py-1.5 text-sm" value={anchor} onChange={e => e.target.value && setAnchor(e.target.value)} />
          </span>
        )}
        {range === 'custom' && (
          <span className="flex items-center gap-1 ml-2">
            <input type="date" className="input !w-auto !py-1.5" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span style={{ color: 'var(--text-secondary)' }}>→</span>
            <input type="date" className="input !w-auto !py-1.5" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <button className="btn-secondary !px-3 !py-1.5" onClick={() => step(-1)} title="Previous period">‹</button>
          <span className="flex items-center gap-1.5 text-sm px-2" style={{ color: 'var(--text-secondary)' }}>
            <CalendarDays size={14} />{rangeLabel}
          </span>
          <button className="btn-secondary !px-3 !py-1.5" onClick={() => step(1)} title="Next period">›</button>
          <button className="chip" onClick={() => { setAnchor(today()); setCustomFrom(today()); setCustomTo(today()); }}>Today</button>
        </div>
      </div>

      {/* ── summary ── */}
      {summaryCards.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {summaryCards.map(([label, value]) => (
            <div key={label} className="card p-4">
              <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</div>
              <div className="text-2xl font-semibold mt-1">{value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Loading statistics…</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── GOAL DISTRIBUTION ── */}
        <div className="card p-4">
          <h3 className="font-semibold mb-1">Goal Distribution</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Where your scheduled task activity went in this period ({totalScheduled} total).
            {topGoal && <> Most work went to <b style={{ color: 'var(--text)' }}>{topGoal.name}</b>.</>}
          </p>
          {chartData.length === 0 ? (
            <div className="text-sm py-16 text-center" style={{ color: 'var(--text-secondary)' }}>No scheduled activity in this period.</div>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={80}
                    label={(e: any) => `${e.name}: ${e.value}`}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: any, n: any, p: any) => [`${v} scheduled · ${p?.payload?.completed ?? 0} completed`, n]}
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            Grey slice = tasks with no linked goal — counted separately, never assigned to a goal.
          </div>
        </div>

        {/* ── INTERACTIVE DAILY COMPLETION ── */}
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold">Daily Completion Rate (%)</h3>
            <select
              className="input !w-auto !py-1.5 text-sm"
              value={goalFilter ?? ''}
              onChange={e => setGoalFilter(e.target.value ? Number(e.target.value) : null)}>
              <option value="">All goals</option>
              {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Completed vs scheduled {goalFilter ? 'for the selected goal' : 'across all goals'} — days with nothing scheduled are skipped, not counted as 0%.
          </p>
          {connectedDaily.length === 0 ? (
            <div className="text-sm py-16 text-center" style={{ color: 'var(--text-secondary)' }}>
              Nothing was scheduled{goalFilter ? ' for this goal' : ''} in this period.
            </div>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={connectedDaily}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="var(--text-secondary)" fontSize={11} />
                  <YAxis stroke="var(--text-secondary)" fontSize={11} domain={[0, 100]} unit="%" />
                  <Tooltip
                    formatter={(v: any) => [`${v}%`, 'Completion']}
                    labelFormatter={(l: any) => {
                      const row = connectedDaily.find(d => d.label === l);
                      return row ? `${row.date} — ${row.completed}/${row.total} completed` : String(l);
                    }}
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }} />
                  <Line type="monotone" dataKey="rate" stroke="var(--accent)" strokeWidth={2}
                    connectNulls dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {connectedDaily.length > 0 && (() => {
            const done = connectedDaily.reduce((s, d) => s + Number(d.completed), 0);
            const tot = connectedDaily.reduce((s, d) => s + Number(d.total), 0);
            return (
              <div className="text-sm mt-2 font-medium">
                Period average: {tot ? Math.round(done / tot * 100) : 0}% ({done}/{tot} occurrences completed)
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
