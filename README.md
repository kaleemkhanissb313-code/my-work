# Basic to Advanced

An all-in-one, local-first productivity workspace for **life, home, work, projects, documents, media, time, data, finance and security** — with a premium 3D-inspired interface (dark by default), installable as a PWA and prepared for desktop (Tauri) and mobile (Capacitor) packaging.

Everything works **offline with no account**: data is stored in your browser's IndexedDB. Cloud accounts, sync, 2FA and AI are optional and enabled with Supabase.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) + production build to `dist/` (includes the PWA service worker) |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit/service tests (jsdom + fake-indexeddb + WebCrypto) |
| `npm run test:e2e` | Playwright (desktop + mobile viewport). First run `npx playwright install chromium`. |

Requires Node 20+.

## What's inside

| Area | Highlights |
|---|---|
| **Dashboard** | Live clock, today's/work/home tasks, overdue, deadlines, events, project progress, habits, maintenance, bills, recent docs/media, favorite links, timer, quick calculator, 7-day productivity chart, quick actions, security status. Show/hide/reorder widgets. |
| **My Life** | Goals, habits (daily check-ins, streaks, heatmap), journal, reading list, trips & packing, fitness logs, reviews, birthdays/important dates. |
| **Home** | Chores (recurring), grocery lists, maintenance schedules, bills, inventory & warranties, emergency contacts, rooms, home documents. |
| **Work** | Priorities, work projects, meetings (agenda/minutes), clients, timesheets, goals, invoices (records only), expenses, workspaces. |
| **Projects & Tasks** | Kanban (drag & drop + keyboard), list, calendar and Gantt timeline views, subtasks, priorities, recurrence, estimates/actuals, milestones, progress reports. |
| **Calendar & Timelines** | Month/week/day calendar, recurring events, reminders (while the app is open), time zones, working-day calculator, Gantt view. |
| **Documents & Notes** | TipTap rich text, autosave with status + retry + local draft recovery, folders, tags, colors, templates, Markdown import/export, TXT, Word (.doc), print/PDF, optional AI assist. |
| **Media & Links** | Validated uploads with progress and thumbnails, previews, folders/tags; bookmarks with safe opening, import/export. |
| **Tools** | Timers/stopwatch/laps/Pomodoro/time tracking (timestamp-based), standard & scientific calculator (safe parser, no `eval`), percentage/discount/ratio/stats/date/unit tools, number tools, colors (conversion, palettes, gradients, WCAG contrast), text & alphabet tools, text diff. |
| **Graphs & Reports** | Editable datasets, CSV import/export, bar/line/area/pie/donut charts, PNG/SVG export, live charts from app data, reports with print. |
| **Finance** | Expenses & income by area (personal/home/work/life), budgets vs actual, bills, monthly charts, CSV export. |
| **Security Center / Private Vault** | PIN/password app lock with back-off and auto-lock, encrypted vault (AES-256-GCM), backups, activity log, sessions, TOTP 2FA (with Supabase). |
| **Smart quick add** | Press `Q` (or the ✨ button / bottom-bar button on phones) and type naturally: `Pay rent tomorrow 5pm #bills !high @home`, `Call mom every sunday`, `Client call fri 3pm for 30m +Website-Redesign`. Dates, times, durations, repeats, tags, priority, area, project and estimates are detected with a live preview. |
| **Project templates** | 14 ready-made plans in 9 categories — SEO (audit, local SEO), Marketing (launch, social calendar, email), Design (brand identity, UI/UX), Development, Content, Video, Sales, Events, Personal. Each creates phased tasks, subtasks, milestones, due dates and a project brief document. |
| **Global** | Universal search + command menu (`Ctrl K`), quick-create, tags, favorites, pins, archive, trash & restore, saved views, module hiding, dark/light/system theme, 4 accent colors (Ocean teal default, Royal violet, Sunset, Gold), collapsible sidebar, mobile bottom bar, page transitions, reduced motion. |

## Cloud setup (optional)

1. Create a Supabase project (or run `supabase start` locally).
2. Apply the schema: `supabase db push` (runs `supabase/migrations/*.sql`). This creates per-user tables with **Row Level Security**, the private `media` storage bucket and its policies.
3. Copy `.env.example` → `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the **anon/publishable** key only — never the service-role key).
4. In Supabase Auth settings set the Site URL / redirect URLs to your app origin (`/auth` is used for password reset). Enable TOTP MFA if you want 2FA.
5. (Optional) AI: `supabase functions deploy ai` and `supabase secrets set ANTHROPIC_API_KEY=...` (optionally `AI_MODEL`). The key only lives on the server.
6. Verify RLS: `supabase test db` runs `supabase/tests/rls.test.sql` (pgTAP). Without Docker, `npx vitest run supabase/tests` applies every migration to an in-process Postgres (PGlite) and runs the two-user security tests.

Then sign in from **Settings → Cloud sync / Profile menu** and press **Sync now**. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the sync and conflict strategy.

## Accounts & permissions

With the cloud backend configured, every account is private, new accounts start with **no features**, and only the owner (and administrators the owner appoints) decide who may use what. All rules are enforced by the database (row-level security + checked functions in `supabase/migrations/20261025000001_access_control.sql`), not just hidden in the interface.

1. Apply the migrations (`supabase db push`).
2. In the Supabase **SQL editor** (never from the app), set the owner's email once:
   ```sql
   insert into public.app_config (key, value) values ('owner_email', 'you@example.com');
   ```
3. Sign up / sign in with that email (it must be **confirmed**), open **Settings → Access Control** and press **Claim ownership**. Only that email can claim, and only once.
4. Other people sign up normally. They see "Access to this feature has not been granted…" with a **Request access** button. In **Access Control** you allow/deny each feature per person (Save changes), approve or reject requests, make administrators, and read the audit log.
5. **Privacy & Sharing**: share one document, record, project, task, event or dataset with a specific person's email (view or edit) or as a view-only link, optionally expiring; revoke at any time. The plain link is shown once; only its hash is stored.

What is and isn't covered:
- Feature permissions protect the synced data on the server and the private file store. On a device, each account opens its **own local database**; the first account to sign in on a device keeps that device's existing data, and other accounts (and signed-out visitors afterwards) get separate, empty storage.
- If an account is denied a feature, its data for that feature stays on that person's own device but no longer syncs and cannot be read from the server.
- The "Customize dashboard" permission only controls the interface (dashboard layout is a device preference).
- File attachments are not part of item sharing; shared items show their text content.
- Without the cloud backend (the default build) the app is single-user: nothing is shared and the Access Control / Privacy pages explain this.

## Desktop & mobile

See [docs/PLATFORMS.md](docs/PLATFORMS.md). In short:
- **PWA**: `npm run build` — installable from the browser (manifest + offline service worker).
- **Desktop (Windows/macOS)**: Tauri 2 config in `src-tauri/`. Needs Rust + `@tauri-apps/cli`.
- **Android/iOS**: Capacitor config in `capacitor.config.json`. Needs `@capacitor/cli`, Android Studio / Xcode.

## Honest limitations

- Reminders and timer alarms fire **only while the app is open** (in-app toast + desktop notification if permitted). There is no push/email delivery.
- The app lock is a **privacy screen**; it does not encrypt non-vault local data. Use the **Private Vault** for sensitive content.
- Biometric unlock is only possible in native builds and is not wired up yet (disabled in the UI).
- Multi-user collaboration is limited to sharing single items (view or edit); there is no real-time co-editing — an editor's change reaches the owner on their next sync.
- Invoices, meetings and contacts are records — nothing is emailed or sent.
- Word export produces an HTML-based `.doc` that Word opens; true `.docx` generation is not included. PDF uses the browser's print dialog.
- Cloud sync and the AI function are implemented against Supabase's APIs but must be tested against your own project; they are disabled when not configured.

More: [docs/SECURITY.md](docs/SECURITY.md) · [docs/CONVENTIONS.md](docs/CONVENTIONS.md)
