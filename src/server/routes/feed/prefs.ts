import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { loadCaller } from "../../utils/http";
import { feedPrefsSchema, validate } from "../../utils/validation";
import type { FeedPrefs } from "@shared/feed";

const prefsOf = (user: { feedPrefs?: { mutedApps?: string[]; mutedSpaces?: string[] } | null }): FeedPrefs => ({
  mutedApps: [...(user.feedPrefs?.mutedApps ?? [])],
  mutedSpaces: [...(user.feedPrefs?.mutedSpaces ?? [])],
});

export function registerFeedPrefsRoutes(app: Application) {
  // GET /api/feed/prefs
  app.get("/api/feed/prefs", authenticateToken, async (req: Request, res: Response) => {
    res.json({ status: true, message: "", data: prefsOf(await loadCaller(req)) });
  });

  // PUT /api/feed/prefs { mutedApps, mutedSpaces } - replaces both lists
  app.put("/api/feed/prefs", authenticateToken, validate(feedPrefsSchema), async (req: Request, res: Response) => {
    const user = await loadCaller(req);
    const { mutedApps, mutedSpaces } = req.body as FeedPrefs;
    user.set("feedPrefs", { mutedApps: [...new Set(mutedApps)], mutedSpaces: [...new Set(mutedSpaces)] });
    await user.save();
    res.json({ status: true, message: "Saved", data: prefsOf(user) });
  });
}
