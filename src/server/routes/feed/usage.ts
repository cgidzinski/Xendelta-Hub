import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { callerId } from "../../utils/http";
import { usedApps } from "../../feed/appUsage";

export function registerUsageRoutes(app: Application) {
  // GET /api/feed/usage - which apps the caller already uses (for the "Did you know?" tips on Home)
  app.get("/api/feed/usage", authenticateToken, async (req: Request, res: Response) => {
    res.json({ status: true, message: "", data: { used: await usedApps(callerId(req)) } });
  });
}
