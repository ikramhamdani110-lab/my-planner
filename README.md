# My Planner

A personal planner that runs entirely in your browser. Tasks, recurring tasks, rescheduling, calendar, goals,
statistics, notes and reminders — with **no account, no server and no tracking**. Your data stays in your own browser.

## Features

- **Dashboard** — today, this week and this month at a glance, plus upcoming, overdue and rescheduled tasks.
- **Tasks** — priorities, categories, overlap warnings and a full change history for every task.
- **Recurring tasks** — each series materialises one occurrence per date. Completing, missing or rescheduling one
  occurrence never affects the others.
- **Rescheduling** — keeps the original schedule, writes a history entry and records an optional reason.
- **Calendar** — month view with a day agenda.
- **Goals** — milestones, progress calculated from milestones and linked tasks, and goal-based statistics.
- **Statistics** — completion rates, daily trends and goal distribution.
- **Notes** — create, edit, pin and search, linked to goals or tasks if you like.
- **Reminders** — browser notifications plus an in-app reminder list.
- **Themes** — Dark Red, Baby Pink, Dark Blue and Baby Blue, saved automatically.
- **Backup** — export/import a JSON backup, or download the whole SQLite database file.
- **Responsive** — a full sidebar on desktop, a slide-over menu on tablet and mobile.

## Getting started

You need [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install     # install dependencies
npm run dev     # start the dev server at http://localhost:5173
```

Open the printed URL. The planner opens straight away — there is nothing to sign up for.

### Production build

```bash
npm run build   # creates a static site in dist/
npm run preview # serve the production build locally at http://localhost:4173
```

`dist/` is plain static HTML/JS/WASM, so you can upload it to GitHub Pages, Netlify, Vercel, Cloudflare Pages or any
web server. Because the build uses relative paths (`base: './'`), it also works from a subfolder.

### Other commands

```bash
npm run typecheck   # TypeScript type checking
```

## How your data is stored

The planner uses **SQLite compiled to WebAssembly** ([sql.js](https://sql.js.org/)) running inside the page, so the
original database schema, queries and business rules are unchanged. After every change the database is written to
your browser's storage.

| | |
|---|---|
| Primary store | **IndexedDB** (room for hundreds of MB) |
| Fallback / mirror | **localStorage** (about 5 MB) |
| Saved on | every change (debounced), when the tab is hidden, and when you leave the page |

### Limitations you should know about

- **Your data lives in one browser on one device.** It is not synced anywhere. Clearing site data, using
  private/incognito mode, or switching browsers or computers means starting fresh.
- **Browser storage can be cleared** by the browser itself when disk space is low, or by "clear browsing data".
  **Export a backup regularly.**
- **Reminders only fire while a My Planner tab is open.** A website cannot run in the background after you close it.
  Browser notifications must also be allowed in Settings.
- **There is no password.** Anyone with access to your browser profile can open the planner. Use your device's
  own user account or screen lock if that matters.

### Backups

Settings → **Your data**:

- **Export backup (JSON)** — a full, readable copy of tasks, goals, notes, history and settings.
- **Import backup** — merge into your current data, or replace everything with the file.
- **Download database (.db)** — the raw SQLite file, openable with any SQLite tool.
- **Reset all data** — wipes the planner after asking for confirmation.

If you want a copy of the original desktop data, `scripts/export-seed.py` exports an existing
`my-planner.db` into the JSON format used by the app.

## Project structure

```
src/
  app/            App shell and page routing
  components/     Layout (sidebar, header), forms, task details
  contexts/       Theme and UI (modal) state
  db/             SQLite engine, migrations and repositories
    webDatabase.ts   sql.js + a better-sqlite3-compatible query API
    migrations.ts    Schema and data migrations
    repositories/    Tasks, goals, habits, notes, settings
  pages/          Home, Calendar, Tasks, Goals, Statistics, Notes, Settings
  services/       API bridge, browser handlers, reminders, file helpers
  data/seed.json  Starting dataset for a brand-new browser
public/           Favicon and app icons
```

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · Recharts · sql.js (SQLite/WASM)

## License

MIT
