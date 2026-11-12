import type { Db } from "mongodb";
import { PassThrough, pipeline } from "stream";
import zlib from "zlib";
import readline from "readline";
import { randomUUID } from "crypto";
import { privateBucket } from "../config/gcs";
import { BACKUP_NAME_PATTERN, BACKUP_PREFIX } from "@shared/admin";
import type { AdminBackup, AdminBackupJob } from "@shared/admin";
import { restoreFromGzipStream, streamExport } from "./databaseBackup";
import { AppError } from "./http";

// Database backups kept in the private bucket (docs/admin.md). The dump format and the wipe-and-replace restore are
// utils/databaseBackup.ts, the same code `npm run db:export` / `db:import` use.

const fileSafeStamp = () => new Date().toISOString().replace(/[:.]/g, "-");

export const isBackupName = (name: string) => BACKUP_NAME_PATTERN.test(name);

export async function backupExists(name: string): Promise<boolean> {
  const [exists] = await privateBucket.file(name).exists();
  return exists;
}

/** Newest first. Anything under the prefix that isn't one of ours is ignored. */
export async function listBackups(): Promise<AdminBackup[]> {
  const [files] = await privateBucket.getFiles({ prefix: BACKUP_PREFIX });
  return files
    .filter((f) => isBackupName(f.name))
    .map((f) => ({
      name: f.name,
      kind: f.name.startsWith(`${BACKUP_PREFIX}pre-restore-`) ? ("pre-restore" as const) : ("backup" as const),
      size: Number(f.metadata?.size ?? 0),
      createdAt: f.metadata?.timeCreated ? new Date(f.metadata.timeCreated as string).toISOString() : null,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function deleteBackup(name: string): Promise<void> {
  await privateBucket.file(name).delete({ ignoreNotFound: true });
}

/** Streams the whole database to a new object and returns its name. A half-written object is removed. */
export async function createBackup(db: Db, by: string, kind: "backup" | "pre-restore" = "backup"): Promise<string> {
  const name = `${BACKUP_PREFIX}${kind === "backup" ? "xendelta-hub-backup" : "pre-restore"}-${fileSafeStamp()}.ndjson.gz`;
  const file = privateBucket.file(name);
  try {
    // streamExport resolves when the destination finishes, which for a GCS write stream is when the upload is complete.
    await streamExport(db, file.createWriteStream({ resumable: true, contentType: "application/gzip" }), {
      exportedBy: by,
    });
  } catch (err) {
    await file.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw err;
  }
  return name;
}

/**
 * Reads the whole file once, without touching the database, to be sure it is a complete backup: valid gzip all the
 * way to the end (which also catches a truncated upload) and starting with the backup header. The restore wipes
 * collections before it reads, so a bad file has to be caught here.
 */
export async function verifyBackup(name: string): Promise<void> {
  const gunzip = zlib.createGunzip();
  let sourceError: Error | null = null;
  pipeline(privateBucket.file(name).createReadStream(), gunzip, (err) => {
    if (err) sourceError = err;
  });
  let first = true;
  for await (const line of readline.createInterface({ input: gunzip, crlfDelay: Infinity })) {
    if (first) {
      if (!line.startsWith("#META\t")) throw new Error("This file isn't a Xendelta Hub backup");
      first = false;
    }
  }
  if (sourceError) throw new Error(`The backup can't be read: ${(sourceError as Error).message}`);
  if (first) throw new Error("The backup file is empty");
}

/**
 * Replaces the database's contents with a backup. The file is checked first, then a safety snapshot of the current data
 * is written; the restore does not start if either fails. The wipe happens before the restore reads the file, so the
 * snapshot is the way back from anything that still goes wrong.
 */
export async function restoreBackup(db: Db, name: string, by: string) {
  await verifyBackup(name);
  const snapshot = await createBackup(db, by, "pre-restore");
  // A read error from the bucket must reach the restore, so it goes through a PassThrough that is destroyed with it.
  const source = privateBucket.file(name).createReadStream();
  const pass = new PassThrough();
  source.on("error", (err: Error) => pass.destroy(err));
  source.pipe(pass);
  const summaries = await restoreFromGzipStream(db, pass);
  return {
    snapshot,
    summary: {
      collections: summaries.length,
      deleted: summaries.reduce((n, s) => n + s.deleted, 0),
      inserted: summaries.reduce((n, s) => n + s.inserted, 0),
      errors: summaries.filter((s) => s.error).map((s) => `${s.name}: ${s.error}`),
    },
  };
}

// One backup or restore at a time, tracked in memory. It must not live in the database: a restore replaces every
// collection, so a job row stored there would vanish mid-run. (A server restart forgets it; the object in the bucket,
// or the missing one, is the record then.)
let current: AdminBackupJob | null = null;

export const currentJob = (): AdminBackupJob | null => current;

/**
 * Start a job in the background and return at once. `settled` runs when it ends, whether it worked or not, with the
 * final job: use it to write the audit row (after a restore, since a restore replaces the audit log too).
 */
export function startJob(
  kind: AdminBackupJob["kind"],
  run: () => Promise<Partial<AdminBackupJob>>,
  settled: (job: AdminBackupJob) => Promise<void>,
): AdminBackupJob {
  if (current?.status === "running") {
    throw new AppError(409, `A ${current.kind} is already running`);
  }
  const job: AdminBackupJob = { id: randomUUID(), kind, status: "running", startedAt: new Date().toISOString() };
  current = job;
  void (async () => {
    try {
      Object.assign(job, await run(), { status: "done" });
    } catch (err) {
      console.error(`Database ${kind} failed:`, err);
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
    }
    job.finishedAt = new Date().toISOString();
    await settled(job).catch((err) => console.error("Failed to record the backup audit entry:", err));
  })();
  return job;
}

/** Test helper: forget the last job. */
export function resetJobsForTests() {
  current = null;
}
