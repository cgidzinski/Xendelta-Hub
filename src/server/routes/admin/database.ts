import express = require("express");
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { uploadDatabaseDump } from "../../config/multer";
import { AuthenticatedRequest } from "../../types";
import { DATABASE_IMPORT_CONFIRMATION_PHRASE, DATABASE_BACKUP_DIR } from "../../constants";
import { getCollectionStats, streamExport, restoreFromGzipStream } from "../../utils/databaseBackup";

function getDb() {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database connection is not ready");
  }
  return db;
}

module.exports = function (app: express.Application) {
  app.get("/api/admin/database/collections", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const collections = await getCollectionStats(getDb());

    return res.json({
      status: true,
      data: { collections, generatedAt: new Date().toISOString() },
    });
  });

  app.get("/api/admin/database/export", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="xendelta-hub-backup-${timestamp}.ndjson.gz"`);

    try {
      await streamExport(getDb(), res, { exportedBy: userId });
    } catch (err) {
      console.error("Database export failed:", err);
      // Headers/body may already be partially sent, so we can't fall back to a JSON error.
      res.destroy();
    }
  });

  app.post(
    "/api/admin/database/import",
    authenticateToken,
    requireAdmin,
    uploadDatabaseDump.single("dump"),
    async function (req: express.Request, res: express.Response) {
      const userId = (req as AuthenticatedRequest).user!._id;
      const { confirmationPhrase, skipSafetySnapshot } = req.body;

      if (confirmationPhrase !== DATABASE_IMPORT_CONFIRMATION_PHRASE) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(400).json({
          status: false,
          message: "Confirmation phrase did not match. Database was not modified.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          status: false,
          message: "No database dump file provided",
        });
      }

      const uploadedPath = req.file.path;
      const db = getDb();
      let safetySnapshotPath: string | null = null;

      try {
        if (skipSafetySnapshot !== "true" && skipSafetySnapshot !== true) {
          const backupDir = path.resolve(DATABASE_BACKUP_DIR);
          fs.mkdirSync(backupDir, { recursive: true });
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const snapshotName = `pre-import-${timestamp}.ndjson.gz`;
          const snapshotFullPath = path.join(backupDir, snapshotName);

          try {
            await streamExport(db, fs.createWriteStream(snapshotFullPath), { exportedBy: userId });
            safetySnapshotPath = path.join(DATABASE_BACKUP_DIR, snapshotName);
          } catch (snapshotErr) {
            console.error("Pre-import safety snapshot failed:", snapshotErr);
            return res.status(500).json({
              status: false,
              message: "Failed to write pre-import safety snapshot. Database was not modified.",
            });
          }
        }

        const collections = await restoreFromGzipStream(db, fs.createReadStream(uploadedPath));

        return res.json({
          status: true,
          message: "Database restored successfully",
          data: { collections, safetySnapshot: safetySnapshotPath },
        });
      } finally {
        fs.unlink(uploadedPath, () => {});
      }
    }
  );
};
