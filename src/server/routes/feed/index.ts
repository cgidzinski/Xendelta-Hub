import type { Application } from "express";
import { registerFeedRoutes } from "./feed";
import { registerAttentionRoutes } from "./attention";
import { registerFeedPrefsRoutes } from "./prefs";

// Registration order matters in Express: the literal paths (/attention, /prefs, /hide) are separate from
// /api/feed itself and none takes a :param, so they can go in any order.
module.exports = function (app: Application) {
  registerFeedRoutes(app);
  registerAttentionRoutes(app);
  registerFeedPrefsRoutes(app);
};
