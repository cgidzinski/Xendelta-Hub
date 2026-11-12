# Adding a sub-app

How to add a new app to Xendelta Hub (like XenSplit, XenBudget or XenKitchen) so it matches the existing
ones. Read `CLAUDE.md` first for the repo-wide rules (checks, Prettier, migrations, Windows npm quirks) and
`src/client/components/ui/DESIGN.md` for the look.

Use **XenKitchen** (`routes/xenkitchen.ts`, `Internal/XenKitchen/`) as the worked example for a small app and
**XenBudget** (`routes/xenbudget/`) for a large one.

## Checklist

1. [Server model and sharing](#1-server-model-and-sharing)
2. [Server routes](#2-server-routes)
3. [Client app folder, routes and registry](#3-client-app-folder-routes-and-registry)
4. [Client data: hooks, keys, sockets](#4-client-data-hooks-keys-sockets)
5. [UI](#5-ui)
6. [Tests](#6-tests)
7. [Migrations and deploy](#7-migrations-and-deploy)
8. [Mistakes to avoid](#8-mistakes-to-avoid)

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
- Real-time updates: emit through the `SocketManager` (see how `xensplit:group_update` is sent) and name events
  `<app>:<thing>_update`.
- Notifications go through `notify()`; uploads go through the shared upload helpers (see `utils/mediaUtils.ts`),
  and a long upload needs the client's progress bar (below).

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
| `src/client/routes/Internal/Home/Home.tsx` | add a card body to `appDetails` for the home screen. |

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
- **Live updates:** `useSocketInvalidate(event, [keys], applies?)` refetches queries when a socket event arrives;
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
