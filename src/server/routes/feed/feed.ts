import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { callerId } from "../../utils/http";
import { hideActivitySchema, feedQuerySchema, validate, validateQuery } from "../../utils/validation";
import { readFeed } from "../../feed/read";
import { User } from "../../models/user";

const MAX_HIDDEN = 500;

export function registerFeedRoutes(app: Application) {
  // GET /api/feed?cursor&app&limit - one page of the caller's feed
  app.get("/api/feed", authenticateToken, validateQuery(feedQuerySchema), async (req: Request, res: Response) => {
    const q = feedQuerySchema.parse(req.query);
    const page = await readFeed(callerId(req), q);
    res.json({ status: true, message: "", data: page });
  });

  // POST /api/feed/hide { ids } - hide events from the caller's feed (an entry that merged several sends all of them)
  app.post("/api/feed/hide", authenticateToken, validate(hideActivitySchema), async (req: Request, res: Response) => {
    const { ids } = req.body as { ids: string[] };
    await User.updateOne({ _id: callerId(req) }, { $push: { hiddenActivityIds: { $each: ids, $slice: -MAX_HIDDEN } } });
    res.json({ status: true, message: "Hidden", data: {} });
  });
}
