import path from "path";
import { Migrator } from "ts-migrate-mongoose";

// Kept in step with migrate.ts (the CLI config). The path is resolved from the
// process cwd, which is the repo root for both `npm run start`/`dev` and the
// deploy checkout.
const MIGRATIONS_PATH = path.resolve(process.cwd(), "migrations");
const MIGRATIONS_COLLECTION = "migrations";

/**
 * Run any pending ts-migrate-mongoose migrations once, on server boot.
 *
 * The authoritative run is `npm run db:migrate` in the deploy workflow; this is a
 * safety net for local dev and for a deploy that skipped it. It opens its own
 * short-lived connection (separate from the app's mongoose connection) and never
 * throws — a migration failure is logged loudly but must not stop the server from
 * starting, matching how the old ad-hoc boot migrations behaved.
 */
export async function runPendingMigrations(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(">>> Skipping migrations: MONGODB_URI is not set");
    return;
  }

  let migrator: Migrator | undefined;
  try {
    migrator = await Migrator.connect({
      uri,
      collection: MIGRATIONS_COLLECTION,
      migrationsPath: MIGRATIONS_PATH,
      autosync: true, // no interactive prompt when new migration files appear
      cli: false,
    });
    const ran = await migrator.run("up");
    if (ran.length > 0) {
      console.log(`>>> Applied ${ran.length} migration(s): ${ran.map((m) => m.filename).join(", ")}`);
    } else {
      console.log(">>> No pending migrations");
    }
  } catch (e) {
    console.error(">>> Migration run failed (server will still start):", e);
  } finally {
    await migrator?.close().catch(() => {});
  }
}
