"""
Export the existing desktop SQLite database into a seed JSON for the website.

- Opens a COPY of the live database (incl. -wal), so the original is never
  modified, locked or checkpointed.
- Drops account/auth tables and per-account columns: the website is a single
  personal workspace with no authentication.
- Writes src/data/seed.json in the same shape as the app's own JSON backup,
  which is also the import format, so this file doubles as a portable backup.

Usage: python scripts/export-seed.py "<path to my-planner.db>"
"""
import sqlite3, shutil, sys, os, json, tempfile

EXPORT_TABLES = ['tasks', 'task_history', 'goals', 'milestones', 'habits',
                 'habit_completions', 'notes', 'categories', 'settings',
                 'notifications', 'task_occurrences']

# Columns that only exist for the removed multi-account feature.
DROP_COLUMNS = {'account_id', 'lastAccountId', 'password_hash', 'salt'}


def main(src):
    tmp = os.path.join(tempfile.gettempdir(), 'mp-export-%s.db' % os.getpid())
    shutil.copy2(src, tmp)
    for ext in ('-wal', '-shm'):
        if os.path.exists(src + ext):
            shutil.copy2(src + ext, tmp + ext)

    con = sqlite3.connect(tmp)
    con.row_factory = sqlite3.Row
    data = {'app': 'my-planner', 'version': 2, 'kind': 'seed', 'tables': {}}
    counts = {}
    for t in EXPORT_TABLES:
        exists = con.execute(
            "select 1 from sqlite_master where type='table' and name=?", (t,)).fetchone()
        if not exists:
            continue
        rows = []
        for r in con.execute('select * from "%s"' % t):
            d = {k: r[k] for k in r.keys() if k not in DROP_COLUMNS}
            rows.append(d)
        # Notifications are recomputed from tasks on first run in the browser.
        if t == 'notifications':
            rows = []
        data['tables'][t] = rows
        counts[t] = len(rows)
    settings = [dict(s) for s in data['tables'].get('settings', [])]
    settings = [s for s in settings if s['key'] not in DROP_COLUMNS]
    data['tables']['settings'] = settings
    con.close()
    for ext in ('', '-wal', '-shm'):
        try:
            os.remove(tmp + ext)
        except OSError:
            pass
    return data, counts, len(settings)


if __name__ == '__main__':
    src = sys.argv[1]
    data, counts, nsettings = main(src)
    out = os.path.join('src', 'data', 'seed.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    print('wrote', out)

    print('\nrow counts:')
    for k, v in counts.items():
        print('   %-20s %d' % (k, v))
    print('   %-20s %d' % ('settings', nsettings))
    print('\nsettings:')
    for s in data['tables']['settings']:
        print('   %-22s = %s' % (s['key'], s['value']))
