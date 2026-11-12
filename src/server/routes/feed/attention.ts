import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { callerId } from "../../utils/http";
import { readAttention } from "../../feed/attention";

export function registerAttentionRoutes(app: Application) {
  // GET /api/feed/attention - what is waiting on the caller, plus per-app counts for the pinned-app badges
  app.get("/api/feed/attention", authenticateToken, async (req: Request, res: Response) => {
    res.json({ status: true, message: "", data: await readAttention(callerId(req)) });
  });
}
