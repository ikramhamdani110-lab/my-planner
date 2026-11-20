import React, { useEffect, useState } from 'react';
import { Download, Upload, DatabaseBackup, Trash2, Info, Palette, Bell } from 'lucide-react';
import { api } from '@/services/api';
import { useTheme } from '@/contexts/ThemeContext';
import { resetEverything } from '@/services/plannerApi';
import { storageEstimate, storageWarning } from '@/db/persistence';
import type { ThemeMode } from '@/contexts/ThemeContext';

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="card p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={17} style={{ color: 'var(--accent)' }} />
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: 'dark-red', label: 'Dark Red' },
  { id: 'baby-pink', label: 'Baby Pink' },
  { id: 'dark-blue', label: 'Dark Blue' },
  { id: 'baby-blue', label: 'Baby Blue' }
];

export function SettingsPage() {
  const { mode, setMode } = useTheme();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [appInfo, setAppInfo] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [permission, setPermission] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unavailable'
  );

  useEffect(() => {
    api.settingsGetAll().then(r => r.ok && setSettings(r.data!));
    api.appInfo().then(r => r.ok && setAppInfo(r.data));
    storageEstimate().then(setUsage);
  }, []);

  const set = async (key: string, value: string) => {
    setSettings(s => ({ ...s, [key]: value }));
    await api.settingsSet(key, value);
  };

  const notify = (m: string) => { setMessage(m); setTimeout(() => setMessage(''), 5000); };

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') { notify('This browser does not support notifications.'); return; }
    const p = await Notification.requestPermission();
    setPermission(p);
    notify(p === 'granted' ? 'Browser reminders are now on.' : 'Browser reminders were not enabled.');
  };

  const fmt = (n: number) => n > 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto max-w-3xl">
      {message && <div className="card p-3 mb-4 text-sm" style={{ background: 'var(--bg-secondary)' }}>{message}</div>}
      {storageWarning() && (
        <div className="card p-3 mb-4 text-sm" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>{storageWarning()}</div>
      )}

      <Section title="Appearance" icon={Palette}>
        <div className="flex gap-2 flex-wrap">
          {THEMES.map(m => (
            <button key={m.id} className={`chip ${mode === m.id ? 'active' : ''}`} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
          Your theme is saved in this browser and restored the next time you open My Planner.
        </p>
      </Section>

      <Section title="General" icon={Info}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Display Name</label>
            <input className="input" value={settings.displayName ?? ''} onChange={e => set('displayName', e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label className="label">Week Starts On</label>
            <select className="input" value={settings.weekStart ?? 'monday'} onChange={e => set('weekStart', e.target.value)}>
              <option value="monday">Monday</option><option value="sunday">Sunday</option>
            </select>
          </div>
          <div>
            <label className="label">Time Format</label>
            <select className="input" value={settings.timeFormat ?? '24h'} onChange={e => set('timeFormat', e.target.value)}>
              <option value="24h">24-hour</option><option value="12h">12-hour</option>
            </select>
          </div>
          <div>
            <label className="label">Date Format</label>
            <select className="input" value={settings.dateFormat ?? 'YYYY-MM-DD'} onChange={e => set('dateFormat', e.target.value)}>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            </select>
          </div>
        </div>
      </Section>

      <Section title="Reminders" icon={Bell}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Reminders</label>
            <select className="input" value={settings.notificationsEnabled ?? 'true'} onChange={e => set('notificationsEnabled', e.target.value)}>
              <option value="true">Enabled</option><option value="false">Disabled</option>
            </select>
          </div>
          <div>
            <label className="label">Default Reminder</label>
            <select className="input" value={settings.defaultReminder ?? '10'} onChange={e => set('defaultReminder', e.target.value)}>
              <option value="0">At scheduled time</option><option value="5">5 min before</option>
              <option value="10">10 min before</option><option value="15">15 min before</option>
              <option value="30">30 min before</option><option value="60">1 hour before</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <button className="btn-secondary" onClick={enableNotifications}>
            <Bell size={15} />{permission === 'granted' ? 'Browser reminders on' : 'Enable browser reminders'}
          </button>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Status: {permission}</span>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
          Reminders appear as desktop notifications (if allowed) and always show inside My Planner. Because this is a
          website, reminders only fire while a My Planner tab is open in your browser.
        </p>
      </Section>

      <Section title="Your data" icon={DatabaseBackup}>
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          Everything is saved privately in this browser. Export a backup regularly — clearing your browser data,
          using private/incognito mode, or switching browsers will not carry your planner across.
        </p>
        {usage && (
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Browser storage used: {fmt(usage.used)} of {fmt(usage.quota)} available.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={async () => {
            const r = await api.backupExportJson();
            notify(r.ok ? `Backup downloaded: ${(r.data as any).filename}` : (r.error ?? 'Export failed'));
          }}>
            <Download size={15} />Export backup (JSON)
          </button>
          <button className="btn-secondary" onClick={async () => {
            const restore = confirm('Import a backup file.\n\nClick OK to MERGE with your current data (recommended).\nClick Cancel to REPLACE everything with the backup.');
            const r = await api.backupImportJson(restore ? 'merge' : 'restore');
            if (r.ok) {
              const d: any = r.data;
              notify(d.imported ? `Imported ${d.counts.tasks} tasks and ${d.counts.goals} goals. Reload the page to see everything.` : 'Import cancelled.');
            } else notify(r.error ?? 'Import failed');
          }}>
            <Upload size={15} />Import backup
          </button>
          <button className="btn-secondary" onClick={() => {
            const r = api.backupCopyDb();
            r.then(res => notify(res.ok ? `Database file downloaded: ${(res.data as any).filename}` : 'Download failed'));
          }}>
            <DatabaseBackup size={15} />Download database (.db)
          </button>
          <button className="btn btn-danger" onClick={async () => {
            if (!confirm('Delete ALL your planner data?\n\nThis removes every task, goal, note and setting. Export a backup first if you might want it back.')) return;
            await api.backupResetData();
            await resetEverything();
          }}>
            <Trash2 size={15} />Reset all data
          </button>
        </div>
      </Section>

      <Section title="About" icon={Info}>
        <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <div><b style={{ color: 'var(--text)' }}>My Planner</b> version {appInfo?.version ?? '2.0.0'}</div>
          <div>A personal planner that runs entirely in your browser.</div>
          <div>Storage: <code className="text-xs">{appInfo?.dbPath ?? 'This browser'}</code></div>
          <div className="pt-2">Privacy: there is no server, no account and no tracking. Your data never leaves this
            browser unless you export a backup yourself.</div>
        </div>
      </Section>
    </div>
  );
}
