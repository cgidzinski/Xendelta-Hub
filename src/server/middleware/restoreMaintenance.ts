import type { NextFunction, Request, Response } from "express";
import { currentJob } from "../utils/gcsBackups";

/**
 * While a database restore runs, answer every API request with a 503 instead of letting it hit half-restored data.
 * That matters for sign-in too: the restore empties `users` for a moment, so a request then would get a 401, and the
 * client treats a 401 as "signed out" and drops the token. A 503 leaves everyone signed in.
 *
 * Two things stay open: /api/health, and the backup job's status, which answers without signing in (the admin's token
 * can't be checked while `users` is empty) and tells only that a restore is running.
 */
export function restoreMaintenance(req: Request, res: Response, next: NextFunction) {
  const job = currentJob();
  if (!job || job.kind !== "restore" || job.status !== "running") return next();
  if (!req.path.startsWith("/api/") || req.path === "/api/health") return next();
  if (req.method === "GET" && req.path === "/api/admin/backups/job") {
    const { id, kind, status, startedAt } = job;
    return res.json({ status: true, data: { job: { id, kind, status, startedAt } } });
  }
  res.status(503).json({
    status: false,
    code: "MAINTENANCE",
    message: "The database is being restored. Try again in a few minutes.",
  });
}
