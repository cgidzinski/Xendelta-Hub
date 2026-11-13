# Adding a sub-app

How to add a new app to Xendelta Hub (like XenSplit, XenBudget or XenKitchen) so it matches the existing
ones. Read `CLAUDE.md` first for the repo-wide rules (checks, Prettier, migrations, Windows npm quirks) and
`src/client/components/ui/DESIGN.md` for the look.

Use **XenKitchen** (`routes/xenkitchen.ts`, `Internal/XenKitchen/`) as the worked example for a small app and
**XenBudget** (`routes/xenbudget/`) for a large one.

## Order of work

1. **Design first, as Artifacts (unless the user says to skip).** Before writing any code, mock the app's main screens
   (the list, the detail, the create/edit form; phone width and desktop) as published Artifacts, using the hub's theme
   tokens and shared components as the reference (`components/ui/DESIGN.md`), and share the links. Build from the design
   the user agreed to. This has produced much better looking apps than designing in code. Skip it only when the user
   says so, and say in the PR that it was skipped.
2. Build it with the sections below. The [checklist](#everything-a-new-app-touches) is the full list of places a new app
   has to be registered; it is long on purpose, because the easy ones to miss (the feed, the guide, the API-key
   allowlist, the realtime events) are what make an app feel part of the hub.
3. **Tell people about it:** an `APP_GUIDE` entry and a changelog entry ([section 9](#9-tell-people-about-it)). A test
   fails without the guide entry.
4. Run every check and click through the real UI. Open a PR.

## Everything a new app touches

A new app, `myapp`, has to appear in all of these. Each is explained in the section named.

| # | Where | What | Section |
|---|---|---|---|
| 1 | `src/server/models/myapp.ts` | model, `memberSchema` for sharing, indexes | 1 |
| 2 | `src/server/social/spaces.ts` | the app's shared space (if it is shared) | 1 |
| 3 | `src/server/routes/myapp.ts` (or a folder) + `server.ts` | routes, registered with the others | 2 |
| 4 | `src/server/utils/validation/myapp.ts` + `validation/index.ts` | input schemas, re-exported | 2 |
| 5 | `src/shared/apiKeys.ts` `API_KEY_APPS` | which paths an API key may reach (without it, keys can't use the app) | 2 |
| 6 | `src/shared/realtime.ts` + `SocketManager` | a typed `myapp:update` event and an emit helper | 2, 4 |
| 7 | `src/server/config/multer.ts`, `constants/index.ts` | upload limits, if people upload files | 2 |
| 8 | `src/server/utils/appFiles.ts` (`registerDriveSource`) | files a person uploads are XenDrive files | 2 |
| 9 | `src/server/server.ts` scheduler | a scheduled job, if the app has reminders or clean-up | 2 |
| 10 | `src/server/utils/dbStats.ts` `WATCHED` | big arrays inside one document, for the 16 MB report | 2 |
| 11 | `src/client/routes/Internal/MyApp/routes.tsx` + `main.tsx` | lazy pages | 3 |
| 12 | `src/client/constants/apps.ts` | the registry entry (nav, Home, pinning) | 3 |
| 13 | `src/client/routes/appRoutes.test.tsx` | the route group | 3 |
| 14 | `src/client/hooks/myapp/` + `keys.ts`, `queryKeys.test.ts` | data hooks and a key factory | 4 |
| 15 | `src/shared/activity.ts`, `server/activity/spaces.ts`, `recordActivity` | activity on Home | 4b |
| 16 | `src/server/feed/providers/` + `feed/attention.ts` | "needs attention" cards and badges | 4b |
| 17 | `notify()` | notifications | 2 |
| 18 | `src/shared/appGuide.ts`, `src/server/feed/appUsage.ts` | what it is for, a one-line `pitch`, tips, and how to tell someone uses it (**required**, tests enforce it) | 9 |
| 19 | `src/shared/changelog.ts` | a "what's new" entry (**always**) | 9 |
| 20 | `src/client/routes/Admin/Storage.tsx`, `Overview.tsx` | admin copy that names the apps | 10 |
| 21 | `src/client/routes/Internal/Share/` | accept shared photos/links, if it makes sense | 10 |
| 22 | a flow test next to `routes/coreFlows.test.ts` | create, edit and delete through the real routes (**required**) | 6 |
| 23 | `migrations/` | only if stored data changes shape | 7 |

## Checklist

0. [Design first](#order-of-work) (Artifacts)
1. [Server model and sharing](#1-server-model-and-sharing)
2. [Server routes](#2-server-routes)
3. [Client app folder, routes and registry](#3-client-app-folder-routes-and-registry)
4. [Client data: hooks, keys, sockets](#4-client-data-hooks-keys-sockets)
5. [UI](#5-ui)
6. [Tests](#6-tests)
7. [Migrations and deploy](#7-migrations-and-deploy)
8. [Mistakes to avoid](#8-mistakes-to-avoid)
9. [Tell people about it: guide and changelog](#9-tell-people-about-it)
10. [Other places an app shows up](#10-other-places-an-app-shows-up)

## 1. Server model and sharing

- Models are TypeScript in `src/server/models/<app>.ts`: a Mongoose schema, `InferSchemaType` for the type, a named
  export. Do not hand-write an interface that mirrors the schema. Index every field you query by (a "my things"
  list is `find({ "members.user_id": userId })`, so index `members.user_id`).
- **If the app is shared between people, use the standard membership shape** from `src/server/utils/membership.ts`:

  ```ts
  import { memberSchema } from "../utils/membership";
  // members: [{ user_id: string, role: "owner" | "editor" | "viewer", added_at }]
  members: { type: [memberSchema], default: [] },
  ```

  Spread `memberFields` into your own schema if members carry app-specific extras (XenRoutine's per-person
  reminder settings do this). Then answer "who may do what" only with `roleOf`, `canView`, `canEdit`,
  `canManage`, `changeRole` and `removeMember` from the same file. There is exactly one owner; owners and editors
  change things; viewers read. Do not write a fifth membership shape or a hand-rolled role check.
  (XenSplit and XenBudget still store `members: ObjectId[]` + `created_by` and mirror it into a `roster`; that is a
  migration in progress, not a pattern to copy.)
- **Register the app's shared spaces in `src/server/social/spaces.ts`** (one entry: model, indexed member path such
  as `"members.user_id"`, and a link). That is how "people you know" and a profile's "spaces you share" find the app's
  members; nothing else needs a friend list. Call `addRefused(res, callerId(req), userIds)` from
  `social/policy.ts` in the route that adds people, so a future privacy rule applies to your app too.
- Share links and other secrets use `utils/tokens.ts` (`randomToken`, `hashToken`), never `Math.random`.
- Money: amounts are decimal numbers rounded with `roundMoney` and shown with `formatMoney`
  (`src/shared/money.ts`). `moneyConventions.test.ts` fails on hand-written rounding or `Intl.NumberFormat`.

## 2. Server routes

- One file, or a folder for a big app (`routes/xenbudget/` has `index.ts` registering one file per area; keep
  registration order there because a literal path must come before a `:param` path). Export
  `function (app)` and **register it in `src/server/server.ts`** with the other `require("./routes/...")(app)` lines.
- **Validate every route's input:** `validateParams`, `validate` (body) and `validateQuery` from
  `utils/validation`, schemas in `utils/validation/<area>.ts`, an ObjectId path param is `z.object({ id: objectIdSchema })` (`objectIdSchema` is in `utils/validation/core.ts`).
  `validationCoverage.test.ts` fails if a route takes a param or a body without it.
- Throw `AppError(status, message)` from `utils/http.ts` for 4xx; the global handler answers
  `{ status: false, message }`. Use `loadCaller(req)` / `callerId(req)` for the signed-in user. Express 5 catches
  async errors, so do not add per-route try/catch that turns everything into a 500.
- Answer with the app-wide envelope `{ status, message, data }`.
- **Re-export the schemas** from `utils/validation/index.ts` (`export * from "./myapp";`), or the route can't import them
  from `utils/validation`.
- **API keys:** `src/shared/apiKeys.ts` `API_KEY_APPS` lists each app and the path prefixes an API key may call
  (`docs/api-keys.md`). A new app that is not listed is unreachable with a key, which is usually what you want for a
  private app and never what you want for one meant to be scripted; decide on purpose. `/api/admin` is never reachable.
- **Real-time:** add the event to the typed `RealtimeEvents` map in `src/shared/realtime.ts` (`"myapp:update": undefined`)
  and a helper next to the others in `server/infrastructure/SocketManager.ts` that emits it to the members. The client
  side is section 4.
- **Upload limits** for pictures and files live in `server/config/multer.ts` and `server/constants/index.ts`
  (`MAX_<APP>_IMAGE_SIZE`); do not hard-code a size in a route.
- **Scheduled jobs** (reminders, clean-up) are registered in the `Scheduler` block in `server.ts` with an interval and an
  overlap guard (`infrastructure/Scheduler.ts`); the job body lives in `utils/<app>Reminders.ts` or similar and is
  tested directly. Never `setInterval` in a route file.
- **Document size:** if a document holds an array that can grow (items in a list, history entries), add its collection to
  `WATCHED` in `server/utils/dbStats.ts` so `npm run db:stats` reports how close it is to MongoDB's 16 MB limit.
- **Deleting a user does not clean up app data yet.** `DELETE /api/admin/users/:userId` only removes the user, and there is
  no hook for an app to plug into. If the app keeps personal data, say so in the PR so it can be handled.
- Real-time updates: emit through the `SocketManager` (see how `xensplit:group_update` is sent) and name events
  `<app>:<thing>_update`.
- Notifications go through `notify()`. **Files a person uploads in your app are XenDrive files**: register a source with
  `registerDriveSource` (see `utils/xenNoteFiles.ts`) and store them with `storeAppFiles` from `utils/appFiles.ts`, not
  `uploadToGCS`, so they are owned by the uploader, listed under XenDrive > From apps and deleted properly (`docs/storage.md`).
  Only small, resized or admin-only images (avatars, a group image) use `utils/mediaUtils.ts`. A long upload needs the
  client's progress bar (below).

## 3. Client app folder, routes and registry

Create `src/client/routes/Internal/<App>/` with the pages, `components/`, and a **`routes.tsx`**:

```tsx
import { Route } from "react-router-dom";
import { lazyPage } from "../../../utils/lazyPage";

const MyList = lazyPage(() => import("./MyList"));
const MyDetail = lazyPage(() => import("./MyDetail"));

export const myappRoutes = (
  <>
    <Route path="myapp" element={<MyList />} />
    <Route path="myapp/:id" element={<MyDetail />} />
  </>
);
```

Every page is a lazy chunk (`lazyPage`), never a static import in `main.tsx`; that is what keeps the first load
small. Then wire the app in:

| Where | What |
|---|---|
| `src/client/constants/apps.ts` | add an entry to `APPS_REGISTRY` (`key`, `label`, `icon`, `path: "/internal/myapp"`, `description`). The nav bar, home screen and pinning read it. |
| `src/client/main.tsx` | `import { myappRoutes } from "./routes/Internal/MyApp/routes"` and add `{myappRoutes}` among the other app groups. |
| `src/client/routes/appRoutes.test.tsx` | add the app to the `ROUTES` map. The test fails if a registry app has no route group, or the group leaves its prefix. |
| `src/shared/appGuide.ts` | add the app's `about` and tips (section 9). `appGuideCoverage.test.ts` fails without it. |

Group routes that belong to a parent layout the way XenSplit does (`xensplit/groups/:groupId` with child tabs);
each child is its own lazy page, so the parent stays on screen while a child loads.

## 4. Client data: hooks, keys, sockets

Put data hooks in `src/client/hooks/<app>/`.

- **Calls:** `api.get<T>(url)`, `api.post<T>(url, body)`, `put`, `patch`, `delete` from `config/api.ts`. They return
  the envelope's `data` already unwrapped. Use `apiClient` directly only for a raw response. Failures throw the
  `ApiError` that the shared client builds.
- **Query keys:** one factory file, `hooks/<app>/keys.ts`, like `xensplitKeys`. Every `useQuery`,
  `invalidateQueries` and socket handler uses it, never an inline array, so a key cannot be spelled two ways.
  (`queryKeys.test.ts` fails for XenSplit, XenBudget and XenDrive if they are spelled out by hand; add your app to
  that guard.) Keep keys hierarchical: `[app, "group", id]` must be a prefix of `[app, "group", id, "log"]`.
- **Live updates:** the event must exist in `src/shared/realtime.ts` (section 2). `useSocketInvalidate(event, [keys], applies?)` refetches queries when a socket event arrives;
  `useSocketEvent(event, handler)` is the lower-level form (`hooks/useSocketEvent.ts`).
- **Auth and storage:** the sign-in token is only ever read through `config/tokenStore.ts`. Persisted UI
  preferences use `useLocalStorageState` (or `getRawStored` / `setRawStored`); raw `localStorage` throws when
  site data is blocked. A test fails on direct token access.
- **Types:** the user shapes are `AuthUser`, `PublicUser` in `types/user.ts`; do not declare another `User`.
- **Uploads:** a `FormData` body gets the long upload timeout automatically; pass `useUploadProgress()`'s
  `onUploadProgress` and render `<UploadProgress percent={percent} />`.

## 4b. Show up on Home (the feed)
Home is a feed with two sources. Add one or both when the app has something worth surfacing:

- **Activity** (what other people did in a space I share): add the verb to `ACTIVITY` in `src/shared/activity.ts`
  (`link`, `summary`, optional `aggregate` wording), register the app's space in `server/activity/spaces.ts`
  (`membersOf`), and call `recordActivity({ actor, verb, object, space, audience: "space" })` after the change is
  saved. It never throws and skips the actor. Only changes another person would care about; not edits or renames.
- **Needs attention** (live, nothing stored): add an `AttentionProvider` in `server/feed/providers/` and list it in
  `server/feed/attention.ts`. Only things with a clear action and a cost for ignoring them. Its `count`s become the
  app's badge on the pinned-app buttons, so use the app's key from `constants/apps.ts` as `app`.

## 5. UI

Follow `components/ui/DESIGN.md`. In short: theme tokens, not hex or `rgba()`; the shared components
(`PageContainer`, `PageHeader` / `DetailHeader`, `SectionCard`, `SectionLabel`, `EmptyState`, `ListSkeleton`,
`ResponsiveDialog`, `Banner`); and for confirmations `useConfirm()` (`components/ui/ConfirmProvider`), never a
hand-rolled confirm dialog or `window.confirm`. Show images full-screen with `ImageLightbox`.

Large screens: keep add/edit form state in one hook with pure helpers (see `Xensplit/expenseDraft.ts`: one draft
shape, `reset`, and unit-tested helpers) instead of parallel `useState`s for "add" and "edit". Split a page over
~500 lines before it grows (`XenKitchen/components/itemEditor/` is an example).

## 6. Tests

- **Flow test (required):** add a test next to `routes/coreFlows.test.ts` that drives the app's create, edit and
  delete paths through the real routes against the in-memory database (`startTestApp`, `createUser` from
  `src/server/testing/testApp.ts`). Edit paths matter most: a type-only change once made every expense edit 404 in
  production and only a flow test would have caught it.
- Put pure logic in a plain module and unit-test it (balances, validation, conversions).
- If the app has a data model change, add a migration test (below).
- **Guard tests that must stay green** (they exist to catch exactly what is easy to forget; do not edit them to make
  a new app pass, fix the app, and only add to an allow-list with a written reason):
  `validationCoverage.test.ts` (every route validates input), `errorConventions.test.ts` (no hand-written error bodies,
  `callerId` not a cast), `auditCoverage.test.ts` (every admin write calls `recordAudit`), `designLint.test.ts` (no hex
  or `rgba()`), `moneyConventions.test.ts`, `models/indexes.test.ts` (queried fields are indexed), `appRoutes.test.tsx`,
  `queryKeys.test.ts`, `appGuideCoverage.test.ts` (the app has a guide entry), `routes/feed.test.ts` and
  `social/social.test.ts` if you touched the feed or spaces.
- Keep the suite green: `npm run format:check`, `npm run lint`, `npm run type-check`, `npm test`,
  `npm run build`. Check **exit codes** (do not pipe them through `grep`).
- Click through the real UI once on staging before shipping: types and tests do not
  catch a page that renders blank.

## 7. Migrations and deploy

- A new collection needs no migration. Changing the shape of stored data does: `npm run db:migrate:create <name>`,
  raw collection access (`connection.collection("...")`, not models), idempotent `up`, a real `down`, and a test
  like `rosterMigrations.test.ts`. Read `migrations/README.md` first.
- **Starting the server runs pending migrations on whatever `MONGODB_URI` points at.** Do not start a branch with an
  unmerged migration against a shared database; rehearse on a restored copy (`npm run db:export`).
- Prefer expand, then contract: add the new field alongside the old, ship code that writes both, and drop the old
  one a release later. Old code and installed PWAs keep running during a deploy.
- `npm run db:stats` is a read-only size report; use it to decide whether a data-model change is worth its risk.
- Deploys run the checks, then build, then `db:migrate`, then restart (`docs/home-server-setup.md`).

## 8. Mistakes to avoid

- **Adding a null guard that throws** to make TypeScript happy (`if (!x) throw new AppError(404, ...)`) on a lookup
  that is legitimately `null`. That is how editing an ordinary expense broke. Check what the code did before.
- Stacked PRs: merge them one at a time and retarget each to `main` first, or they merge into the previous
  branch and never reach `main`.
- Hand-written rounding, `Intl.NumberFormat`, query-key arrays, `localStorage` token access, or `res.data.data`:
  each has a helper and most have a guard test.
- Do not run `npm update`, `npm audit fix` or delete the lockfile with `node_modules` present (see `CLAUDE.md`).

## 9. Tell people about it

Two files, both written for the people who use the hub, not for developers.

- **`src/shared/appGuide.ts` (`APP_GUIDE`), required for a new app.** `about`: two or three plain sentences on what the app
  is for. `pitch`: one line that gets someone who doesn't use the app to try it ("Try XenNote for quick notes and checklists you
  can share."), with a link to open it. `tips`: at least two sentences on what you can do once you use the app, with a link to
  where to try it. Add the key to `GUIDE_APPS` too. The What's new page lists the apps from this. The "Did you know?" cards on an
  empty Home invite people to the apps they **don't** use (the `pitch`) and only show `tips` for apps they **do**, so add a line for
  the app in `src/server/feed/appUsage.ts` that says what "uses it" means (they have something in it). Tests fail if an app in
  `APPS_REGISTRY` has no guide entry, no pitch, or isn't tracked there.
- **`src/shared/changelog.ts` (`CHANGELOG`), every time.** Every feature you add, and every change a person would
  notice (a fix included), gets an entry **in the same PR**: newest first, `date` (today), `app` (the app key, or
  `"hub"`) and a short `title` (one line: the page shows only that). Write "Added…", "You can now…" or "Fixed…". No PR
  numbers, file names or technical words; a test rejects them. A change nobody can see (a refactor, a test) gets no entry.
  Also add a tip to the app's `APP_GUIDE` when the feature is worth discovering.

## 10. Other places an app shows up

Not every app needs these; decide for each and say so in the PR.

- **Admin copy that names the apps:** `Admin/Storage.tsx` and `Admin/Overview.tsx` have sentences like "Photos in XenSplit,
  XenBudget, XenNote and XenKitchen…". Add the app if it stores photos or files.
- **Share target** (`src/client/routes/Internal/Share/`, `pwa/shareStash.ts`): the phone's Share button can send a link, text or
  photos to the hub, which offers places to save them. An app that makes sense as a destination adds an option there
  (the receipt flow into XenSplit and XenBudget in `Share/receipt.ts` is the example: pick a group, open the new-expense form).
- **Admin backups** (`utils/gcsBackups.ts`) dump the whole database, so a new collection is included with nothing to do.
- **Feedback** (`/internal/feedback`) is for the hub as a whole; an app does not need its own.

