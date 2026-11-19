import express = require("express");
import { rateLimit } from "express-rate-limit";
import { authenticateToken } from "../middleware/auth";
import { AppError, callerId } from "../utils/http";
import { searchEverything } from "../search";
import { searchQuerySchema, validateQuery } from "../utils/validation";

// Per person: the palette searches as you type, so it is generous, but it can't be used to hammer every collection.
const perPersonPerMinute = rateLimit({
  windowMs: 60 * 1000,
  limit: 90,
  keyGenerator: (req) => callerId(req),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  handler: (_req, _res, next) => next(new AppError(429, "Searching too fast. Wait a moment.")),
});

module.exports = function (app: express.Application) {
  // GET /api/search?q=... : what the caller can open, grouped by app, a few of each.
  app.get(
    "/api/search",
    authenticateToken,
    perPersonPerMinute,
    validateQuery(searchQuerySchema),
    async (req: express.Request, res: express.Response) => {
      const q = String(req.query.q ?? "");
      return res.json({ status: true, data: { groups: await searchEverything(callerId(req), q) } });
    },
  );
};
