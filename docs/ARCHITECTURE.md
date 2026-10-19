# Architecture

```
src/
  app/            Shell: routes (lazy-loaded pages), layout (Sidebar, Topbar, CommandMenu, LockScreen), nav, reminders
  components/     Design system (ui/), feedback (toasts, confirm, safeWrite), RecurrenceEditor
  features/       Reusable feature modules (records/ generic CRUD + collection definitions, tasks/, docs/, life/, finance/ …)
  lib/            Pure, unit-tested logic: dates & recurrence, safe math parser, timers, colors, text, numbers, CSV, crypto, markdown, sync conflict resolution
  pages/          Route components
  services/       Data & integration layer: repos (CRUD), settings, search, backup, security (app lock), vault, auth, sync, ai
  types/models.ts All persisted data models
supabase/         SQL migrations (RLS), pgTAP tests, `ai` edge function, CLI config
src-tauri/        Desktop packaging (Tauri 2)
capacitor.config.json  Mobile packaging
e2e/              Playwright tests
```

## Data flow
- **Local-first.** All reads come from IndexedDB (Dexie) via `useLiveQuery`, so every view updates instantly and works offline.
- **Writes** go through repositories (`services/repo.ts`) that stamp `updatedAt`, increment `version`, and set `syncedAt = null` (dirty). UI writes are wrapped in `safeWrite`, which surfaces failures with a **Retry** action — no silent data loss. Document autosave additionally keeps an unsaved draft in `localStorage` until the save succeeds.
- **Soft delete** (`deletedAt`) powers Trash/restore and also propagates deletions through sync.
- **Generic records.** Home/Work/Life/Finance list modules share one `records` table and one `RecordManager` component, configured declaratively in `features/records/collections.ts` (fields, validation, which core fields apply). Adding a new list module is a config change.

## Sync & conflict resolution
`services/sync.ts` (two-way, per table) + `lib/syncResolve.ts` (pure, tested):
1. **Pull** rows changed on the server since a per-table cursor (`server_updated_at`, set by a DB trigger → immune to client clock skew).
2. For each row: only remote changed → pull; only local changed (dirty) → push; both changed since last sync → **conflict**: last-write-wins on `updatedAt` (tie → higher `version`). For documents/notes the losing version is preserved as a **“(conflicted copy)”** document so no edit is ever silently discarded.
3. **Push** all dirty rows (`upsert`), mark them synced. Media blobs upload to the private storage bucket under `<user_id>/<file_id>`.
Vault rows sync as ciphertext only.

## Timers
Timers store `startedAt` + `accumulatedMs`; elapsed = `accumulatedMs + (now − startedAt)`. Intervals only trigger re-renders, so throttled background tabs, sleep and app restarts never drift.

## Security
See [SECURITY.md](SECURITY.md).

## AI
`services/ai.ts` → Supabase Edge Function `ai` (JWT-verified, rate-limited) → Anthropic Messages API (`claude-opus-5-5` by default, overridable with `AI_MODEL`). Results are shown for the user to copy/insert; nothing is applied automatically.
