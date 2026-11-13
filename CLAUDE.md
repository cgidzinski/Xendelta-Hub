# Xendelta Hub

## UI work
Before changing or adding any client UI, read `src/client/components/ui/DESIGN.md`. It is the
design language: theme tokens, the shared components in `src/client/components/ui/`
(`PageContainer`, `PageHeader`, `DetailHeader`, `SectionLabel`, `SectionCard`, `EmptyState`, `ListSkeleton`,
`ResponsiveDialog`, `Banner`) and the colour/radius/elevation rules.

- Use theme tokens, not hex or `rgba()` literals. `src/client/designLint.test.ts` fails on new ones.
- Reuse the shared components before hand-writing headers, labels, empty states or dialogs.

## Checks
`npm run format:check`, `npm run lint`, `npm run type-check`, `npm test`, `npm run build`. CI runs all of them
plus `npm audit --omit=dev --audit-level=high`.

- Code is formatted with Prettier (`.prettierrc.json`: 120 columns, 2 spaces, double quotes, trailing commas).
  Run `npm run format` before committing; CI fails on unformatted code. Markdown and the workflow YAML are
  not auto-formatted.

- `tsc` fails on unused locals, imports and parameters. Prefix an intentionally unused parameter with `_`.
  **Never drop the 4th parameter of an Express error handler** (`(err, req, res, next)`): Express detects error
  handlers by arity, and `server.ts` has a test pinning it.
- Shared client/server code lives in `src/shared` and is imported as `@shared/...` (no `../../../shared`).
- **Money** lives in `src/shared/money.ts`. Round with `roundMoney` and display with `formatMoney`
  (`{ symbol: "narrow" }` for XenBudget's bare `$`). `roundMoneyExact` (`toFixed`) exists only for the XenSplit
  balance engine: it differs from `roundMoney` on some half-cents, and changing it would shift existing balances.
  `moneyConventions.test.ts` fails on a hand-written `Math.round(x * 100) / 100` or `new Intl.NumberFormat`.
- Server integration tests use `src/server/testing/testApp.ts` (real routes and models, in-memory MongoDB).

## Changelog (every feature)
Every feature you add, and every change a person would notice (a fix included), adds an entry to `src/shared/changelog.ts`
**in the same PR**: newest first, today's date, the app key (or `"hub"`), and a short title in the words a user would use
("Added…", "You can now…", "Fixed…"). No PR numbers, file names or technical terms (a test rejects them). Add a tip to the
app's `APP_GUIDE` in `src/shared/appGuide.ts` too when the feature is worth discovering. A change nobody can see gets no entry.
The changelog is the feature list on the About page: pick an app and every change to it shows there as a feature.

## Adding a sub-app
**Design first: before writing any code for a new sub-app, mock its main screens (list, detail, create/edit; phone and desktop)
as published Artifacts using the hub's theme and shared components, share the links, and build from the agreed design. Skip
this only when the user says to skip.** Then follow `docs/adding-a-sub-app.md` (server model and sharing, routes, the client registry and `routes.tsx`, data
hooks and query keys, tests, migrations). The short version: register the app in `server.ts` and `constants/apps.ts`;
use `memberSchema` and `utils/membership.ts` for sharing; `lazyPage` for every page; `api.*` and a `keys.ts` factory
for data; add a flow test next to `coreFlows.test.ts`; and add an `APP_GUIDE` entry and a changelog entry. The doc has the full
list of every place an app is registered (Home feed, API-key allowlist, realtime events, admin copy...).

## Server conventions
- **Models are TypeScript** (`src/server/models/*.ts`): named exports (`import { User } from "../models/user"`),
  schema-inferred types (`UserAttrs`, `XenSplitAttrs`, ...), and `UserDocument` for hydrated documents. Don't
  `require()` models; do not hand-write interfaces that mirror a schema, derive them with `InferSchemaType`.
- To replace an array field on a document use `doc.set("field", value)` (assigning a plain array to a
  `DocumentArray` does not type-check and is easy to get wrong).
- Throw `AppError(status, message)` from `utils/http.ts` instead of building a 4xx body by hand; the global
  `errorHandler` answers it as `{ status: false, message }`. `loadCaller(req)` returns the authenticated user's
  document or a 401, and `callerId(req)` their id.
- **Every route validates its input.** Path params with `validateParams`, JSON bodies with `validate`, query
  strings with `validateQuery`, all from `utils/validation` (schemas live in one file per area under
  `utils/validation/`; an ObjectId path param is `z.object({ bookId: objectIdSchema })`, `objectIdSchema` from `utils/validation/core.ts`). `validationCoverage.test.ts` fails if a
  new route takes a path param or a body without it; a genuine exception goes in that test's exempt list with a
  reason.
- **Route files stay small.** A big app gets a folder: `routes/xenbudget/` has `index.ts` (registers the sections
  in order), `shared.ts` (helpers used by more than one section) and one file per area (`books`, `labels`, `rules`,
  `backup`, `importCsv`, `budgets`, `piggyBanks`, `summary`, `items`). Each exports `register<Area>Routes(app)`.
  Registration order matters in Express (a literal path must come before a `:param` path), so keep it in `index.ts`.
- **Uploads** (client): the shared axios client times ordinary requests out at 20 s, but any FormData body gets
  `UPLOAD_TIMEOUT_MS` (10 min) automatically. For progress, use `useUploadProgress()` and pass its
  `onUploadProgress` to the request, then render `<UploadProgress percent={percent} />` (`components/ui`).
- **API calls (client):** use `api.get<T>(url)` / `api.post<T>(url, body)` (`config/api.ts`); they return the
  envelope's `data` already unwrapped. Use `apiClient` directly only when you need the raw response. The sign-in token
  lives in `config/tokenStore.ts`; never read `localStorage` for it.
- Changes to a *populated* document are not saved by saving its parent. Update the referenced model directly.

## Databases and migrations
- **Starting the server runs pending migrations** on whatever database `MONGODB_URI` points at. Do not run a
  branch that contains an unmerged migration against staging or production; rehearse on a restored copy
  (`npm run db:export`, restore into a scratch DB). See `migrations/README.md`.
- `npm run db:stats` is a read-only health report (document sizes vs the 16 MB limit, busiest groups, float noise in
  money). Safe on production; use it to decide whether a data-model change is worth its risk.

## Environment
Copy `.env.example` to `.env`. The server refuses to start without `MONGODB_URI` and `JWT_SECRET`.
Deployment and server setup: `docs/home-server-setup.md`. Deploys run checks, then build, then `db:migrate`.

## Dependencies (important on Windows)
- **Do not** run `npm update`, `npm audit fix`, or `rm -rf node_modules package-lock.json && npm install`: npm
  crashes with "Cannot read properties of null (reading 'edgesOut')" here.
- To change dependencies: edit `package.json`, delete `node_modules`, run
  `npm install --package-lock-only --ignore-scripts`, then `npm ci`.
- Always generate the lockfile with **no `node_modules` present**. Generating it from an installed Windows tree
  drops the Linux/macOS native packages (rollup, esbuild, sharp) and breaks `npm ci` on CI.
- Pin TypeScript to 5.9 (`~5.9.3`); 7.x removes options this repo relies on.
