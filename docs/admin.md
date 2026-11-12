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

## Adding a page
1. A route file in `src/server/routes/admin/` exporting `registerAdmin<Area>Routes(app)`, registered in `index.ts`. Writes call `recordAudit`.
2. Wire types in `src/shared/admin.ts`; a hook in `hooks/admin/useAdminData.ts` with a key in `hooks/admin/keys.ts`.
3. A page in `routes/Admin/`, a route in `main.tsx`, and an entry in `routes/Admin/adminNav.tsx`. Use `DataTable` (it becomes
   cards on a phone), `StatCard`, `FilterChips`, `StatusChip` and the shared `components/ui` pieces; theme tokens only.
4. A test beside `admin.test.ts`: non-admins get 403, and every write creates one audit row.
