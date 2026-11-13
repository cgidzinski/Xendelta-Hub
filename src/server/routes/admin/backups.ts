import express = require("express");
import mongoose from "mongoose";
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { validate, validateQuery } from "../../utils/validation";
import { adminBackupNameSchema, adminRestoreBackupSchema } from "../../utils/validation/admin";
import { AppError } from "../../utils/http";
import { recordAudit } from "../../utils/adminAudit";
import { generateSignedUrl } from "../../utils/gcsUtils";
import {
  backupExists,
  createBackup,
  currentJob,
  deleteBackup,
  listBackups,
  restoreBackup,
  startJob,
} from "../../utils/gcsBackups";
import type { AuthenticatedRequest } from "../../types";

const admin = [authenticateToken, requireAdmin];

const databaseOrThrow = () => {
  const db = mongoose.connection.db;
  if (!db) throw new AppError(503, "The database isn't connected");
  return db;
};
const adminName = (req: express.Request) => (req as AuthenticatedRequest).user?.username || "admin";
const shortName = (name: string) => name.split("/").pop() ?? name;

// Back up the database to the private bucket and restore from it (docs/admin.md). Backup and restore run in the
// background (one at a time) and answer 202; the page polls GET /api/admin/backups/job. They can take longer than a
// request is allowed to stay open.
export function registerAdminBackupRoutes(app: express.Application) {
  app.get("/api/admin/backups", ...admin, async (_req, res) => {
    res.json({ status: true, data: { backups: await listBackups(), job: currentJob() } });
  });

  // Cheap to poll: no bucket call.
  app.get("/api/admin/backups/job", ...admin, (_req, res) => {
    res.json({ status: true, data: { job: currentJob() } });
  });

  app.get("/api/admin/backups/download", ...admin, validateQuery(adminBackupNameSchema), async (req, res) => {
    const { name } = adminBackupNameSchema.parse(req.query);
    if (!(await backupExists(name))) throw new AppError(404, "Backup not found");
    const url = await generateSignedUrl(name, 15, { downloadName: shortName(name) });
    res.json({ status: true, data: { url } });
  });

  app.post("/api/admin/backups", ...admin, async (req, res) => {
    const db = databaseOrThrow();
    const by = adminName(req);
    const job = startJob(
      "backup",
      async () => ({ name: await createBackup(db, by) }),
      async (done) => {
        await recordAudit(req, {
          action: "backup_create",
          target: { type: "database", id: done.name, label: db.databaseName },
          detail:
            done.status === "done"
              ? `Backed up the database to ${shortName(done.name ?? "")}`
              : `Backup of the database failed: ${done.error}`,
        });
      },
    );
    res.status(202).json({ status: true, message: "Backup started", data: { job } });
  });

  // Replaces everything in the database with a backup, so it needs the word typed. The audit row is written when the
  // restore ends, because the restore replaces the audit log along with everything else.
  app.post("/api/admin/backups/restore", ...admin, validate(adminRestoreBackupSchema), async (req, res) => {
    const { name } = adminRestoreBackupSchema.parse(req.body);
    const db = databaseOrThrow();
    if (!(await backupExists(name))) throw new AppError(404, "Backup not found");
    const by = adminName(req);
    const job = startJob(
      "restore",
      async () => ({ name, ...(await restoreBackup(db, name, by)) }),
      async (done) => {
        await recordAudit(req, {
          action: "backup_restore",
          target: { type: "database", id: name, label: db.databaseName },
          detail:
            done.status === "done"
              ? `Restored the database from ${shortName(name)} (safety copy: ${shortName(done.snapshot ?? "")})`
              : `Restore from ${shortName(name)} failed: ${done.error}`,
        });
      },
    );
    res.status(202).json({ status: true, message: "Restore started", data: { job } });
  });

  app.delete("/api/admin/backups", ...admin, validate(adminBackupNameSchema), async (req, res) => {
    const { name } = adminBackupNameSchema.parse(req.body);
    if (!(await backupExists(name))) throw new AppError(404, "Backup not found");
    await deleteBackup(name);
    await recordAudit(req, {
      action: "backup_delete",
      target: { type: "database", id: name, label: shortName(name) },
      detail: `Deleted the backup ${shortName(name)}`,
    });
    res.json({ status: true, message: "Backup deleted", data: {} });
  });
}
