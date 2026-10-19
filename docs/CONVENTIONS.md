# Code conventions — Basic to Advanced

Stack: React 18 + TypeScript (strict) + Vite 5 + Tailwind 3 + Dexie 4 (IndexedDB) + framer-motion + lucide-react + date-fns 3 + Recharts 2 + FullCalendar 6 + TipTap 2. Path alias `@/` → `src/`.

## Layers
| Layer | Folder | Rule |
|---|---|---|
| Types | `src/types/models.ts` | All persisted models. Every entity extends `BaseEntity` (soft delete via `deletedAt`, `archived`, `favorite`, `pinned`, `tags`, `version`, `syncedAt`). |
| Pure logic | `src/lib/*` | No React, no DB. Unit-tested. (`dates`, `mathParser`, `timer`, `color`, `text`, `numbers`, `csv`, `crypto`, `markdown`, `syncResolve`, `format`, `cn`). |
| Data access | `src/lib/db.ts`, `src/services/repo.ts` | Read with `useLiveQuery` from `dexie-react-hooks` against `db.<table>`. **Write only through repos** (`docsRepo`, `tasksRepo`, `projectsRepo`, `eventsRepo`, `bookmarksRepo`, `sessionsRepo`, `datasetsRepo`, `palettesRepo`, `recordsRepo`, `foldersRepo`) so `updatedAt/version/syncedAt` stay correct. `db.media`, `db.timers`, `db.habitLogs`, `db.calcHistory` may be written directly (set BaseEntity fields via `baseEntity()` from repo.ts where the type requires them). |
| Services | `src/services/*` | settings (`useSettings`, `updateSettings`), security/vault, search, backup (`downloadText`, `downloadBlob`), sync, ai (`runAi`, `AI_TASKS`, `AiUnavailableError`), recents (`trackRecent`), quick-create. |
| UI kit | `src/components/ui/index.tsx` | `Button` (variant `primary` = raised 3D, `soft`, `ghost`, `danger`; `icon`, `loading`), `IconButton` (requires `label`), `Card`, `CardTitle`, `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Toggle`, `Badge`, `Progress`, `EmptyState`, `Spinner`, `PageHeader`, `Tabs`, `Modal`, `TagInput`. |
| Feedback | `src/components/feedback.tsx` | `safeWrite(op, successMsg?)` wraps every DB write: shows an error toast **with Retry** on failure (no silent data loss). `toast(msg, tone, action?)`, `await confirm({title, body, danger})`. |
| Pages | `src/pages/**` | One named export per route component (see `src/app/routes.tsx`). |

## Rules
- Never use `eval`/`new Function`. Never put secrets in client code.
- Every interactive control has an accessible name; icon-only buttons use `IconButton label=…`. Use `<label htmlFor>` via `Field`.
- Show loading (`Spinner` while `useLiveQuery` returns `undefined`), empty (`EmptyState` with a primary action) and error states.
- Deleting = soft delete (`repo.trash(id)`) with an Undo toast. Permanent delete only from Trash with `confirm`.
- Deep links: list pages accept `?open=<id>` to open an item (see `RecordManager`).
- Dates: store all-day/due dates as `yyyy-MM-dd` strings; parse with `parseDate` from `@/lib/dates` (never `new Date('yyyy-mm-dd')`). Timed events store UTC ISO instants.
- Responsive: works at 360px wide. Use `flex-wrap`, `grid sm:grid-cols-2 lg:grid-cols-3`, horizontal scroll only inside wide boards/tables.
- Demo data, if any, must be explicitly labelled as sample data (e.g. `Dataset.sample = true`) and never presented as user data.
- Do not claim features that are not implemented (e.g. sending email). Use disabled controls with an explanatory `title` instead.
- Keep visual language: `card`, `glass`, `btn-3d`, tokens `text-muted`, `bg-raised`, `border-line`, `text-accent`, area tones `text-home|work|life|secure`.
