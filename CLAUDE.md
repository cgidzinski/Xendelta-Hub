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
- Server integration tests use `src/server/testing/testApp.ts` (real routes and models, in-memory MongoDB).

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
