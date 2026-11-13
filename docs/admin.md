# The admin area

`/admin` (admins only). Built from `routes/Admin/*` on the client and `routes/admin/*` on the server, one file per page.

| Section | Page | What it does |
|---|---|---|
| Overview | `/admin` | people, storage, gems bought, what needs attention, recent admin activity |
| People | `/admin/users`, `/admin/users/:id` | find people (server-side search, filter, sort, paging); one page per person |
| Content | `/admin/blog` | blog posts (unchanged) |
| Money | `/admin/money` | gem purchases (read-only) and the shop catalogue |
| Platform | `/admin/storage`, `/admin/messaging`, `/admin/system` | storage by app and largest drives; broadcasts; health, migrations, scheduled tasks, large documents, tools |
| Accountability | `/admin/audit` | the audit log |

## Rules
- **Every change is logged.** Each route that writes calls `recordAudit(req, { action, target, detail })`
  (`utils/adminAudit.ts`). Rows go in `AdminAudit` (`models/adminAudit.ts`) and are append-only: there is no route that edits
  or deletes one. `auditCoverage.test.ts` fails if an admin file gets a write route without an audit call. New action names
  and their filter chip go in `src/shared/admin.ts`.
- **Destructive actions need a typed word, checked on the server.** Deleting a person needs their username
  (`DELETE /api/admin/users/:id { confirm }`); deleting all chats needs `DELETE` (`DELETE /api/admin/chats { confirm }`).
  The dialog (`TypedConfirmDialog`) is a convenience; the server refuses without it.
- **Gem adjustments are corrections, not gifts.** `POST /api/admin/users/:id/gems { amount, reason }`: the reason is
  required, the balance can't go below zero, and it is audited. Free gems are a deliberate no (`docs/monetization.md`).
- **No impersonation.** There is no "sign in as" anywhere.
- Routes sit behind `authenticateToken` + `requireAdmin`. API keys can't reach `/api/admin` (`shared/apiKeys.ts`).
- The people list is searched, filtered and paged in memory on the server; fine while the directory is thousands of
  people, and the filters that need storage or purchases are exact. Move it to an aggregation if that stops being true.

## Database backups and restore (System page)
`routes/admin/backups.ts`, with the bucket and job logic in `utils/gcsBackups.ts`. The dump format and the wipe-and-replace
restore are `utils/databaseBackup.ts`, the same code `npm run db:export` / `db:import` use (the CLI stays the way to rehearse
a migration on a scratch database).

- **Where:** the private bucket under `db-backups/`. `xendelta-hub-backup-<time>.ndjson.gz` are backups; `pre-restore-<time>…`
  are the safety copies a restore takes first. The routes only accept names matching `BACKUP_NAME_PATTERN`
  (`src/shared/admin.ts`), so a caller can't point them at another object.
- **Background jobs:** backup and restore return 202 and run on the server, one at a time (a second start is a 409). The page
  polls `GET /api/admin/backups/job`. Job state is in memory, not in Mongo: a restore replaces every collection. A server
  restart forgets it.
- **A restore** is `POST /api/admin/backups/restore { name, confirm: "RESTORE" }`. It checks the whole file first (valid gzip to
  the end, backup header) and refuses a bad one before touching anything; then saves a safety copy; then wipes and replaces.
  If it still fails midway, the safety copy is the way back (restore from it, or `npm run db:import`).
- **The app pauses during a restore.** `middleware/restoreMaintenance.ts` answers every `/api` request with a 503 while it
  runs. Without it, requests would meet an empty `users` collection, get a 401, and the client would sign people out. Only
  `/api/health` and the job status stay open.
- **Audit:** backup, restore and delete are logged. The restore row is written when the restore ends, because the restore
  replaces the audit log too (so it is the only entry from before that moment that is guaranteed to be there).
- People who signed up after the backup was taken don't exist after a restore. Their uploaded files stay in the bucket.
- **Scheduled backups (opt-in):** set `BACKUP_SCHEDULE_HOURS` (e.g. `24`) in the server's `.env` and a scheduler job checks hourly
  and writes `scheduled-<time>.ndjson.gz` when the newest scheduled one is older than that. `BACKUP_KEEP` (default 14) is how
  many scheduled backups to keep; older ones are deleted after each new one. Only `scheduled-` files are ever deleted
  automatically: manual backups and pre-restore safety copies stay until an admin deletes them. A tick is skipped while an admin's
  backup or restore is running. Scheduled backups aren't written to the audit log (no admin is involved); the server log has a line.
  They show an "automatic" tag on the System page.

## Adding a page
1. A route file in `src/server/routes/admin/` exporting `registerAdmin<Area>Routes(app)`, registered in `index.ts`. Writes call `recordAudit`.
2. Wire types in `src/shared/admin.ts`; a hook in `hooks/admin/useAdminData.ts` with a key in `hooks/admin/keys.ts`.
3. A page in `routes/Admin/`, a route in `main.tsx`, and an entry in `routes/Admin/adminNav.tsx`. Use `DataTable` (it becomes
   cards on a phone), `StatCard`, `FilterChips`, `StatusChip` and the shared `components/ui` pieces; theme tokens only.
4. A test beside `admin.test.ts`: non-admins get 403, and every write creates one audit row.
