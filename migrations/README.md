# Migrations

Versioned MongoDB data migrations, run with
[`ts-migrate-mongoose`](https://github.com/ilovepixelart/ts-migrate-mongoose). This is
where one-off data fixes now live — not `scripts/`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run db:migrate:create <name>` | scaffold `migrations/<timestamp>-<name>.ts` from `template.ts` |
| `npm run db:migrate:status` | list every migration and whether it's `up` or `down` |
| `npm run db:migrate` | run all pending migrations (`up`) |
| `npm run db:migrate:down <name>` | roll back down to (and including) `<name>` |
| `npm run db:migrate:prune` | drop tracking rows whose files are gone |

Connection string comes from `MONGODB_URI` (see [`../migrate.ts`](../migrate.ts)), so
each environment migrates its own database. Applied migrations are tracked in the
`migrations` collection.

## Writing one

- Both `up(connection)` and `down(connection)` get a Mongoose `Connection`.
- Prefer raw collection access — `connection.collection("xenbudgetitems")` — over
  importing models, so the migration is frozen against the schema as it was.
- Keep `up` idempotent where practical (guard with a filter) so a partial run re-runs
  cleanly.
- Always write `down`. If it truly can't be reversed, `throw new Error("irreversible: …")`.

## When it runs

- **Deploy** — `npm run db:migrate` runs in `deploy-prod.yml` / `deploy-staging.yml`
  before the app restarts. This is the authoritative run.
- **Boot** — `runPendingMigrations()` in `src/server/infrastructure/migrations.ts` runs
  pending migrations once on the Mongo `connected` event, before the scheduler. This is
  a safety net for local dev and missed deploy steps; a failure is logged, not fatal.
