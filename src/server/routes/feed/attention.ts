import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { callerId } from "../../utils/http";
import { readAttention } from "../../feed/attention";
import { readTotals } from "../../feed/totals";

async function readAttentionWithTotals(userId: string) {
  const [attention, totals] = await Promise.all([readAttention(userId), readTotals(userId)]);
  return { ...attention, totals };
}

export function registerAttentionRoutes(app: Application) {
  // GET /api/feed/attention - what is waiting on the caller, plus per-app counts for the pinned-app badges
  app.get("/api/feed/attention", authenticateToken, async (req: Request, res: Response) => {
    res.json({ status: true, message: "", data: await readAttentionWithTotals(callerId(req)) });
  });
}
