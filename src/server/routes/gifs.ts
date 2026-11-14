import type { Application, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticateToken } from "../middleware/auth";
import { findGifs, gifsEnabled } from "../gifs/giphy";
import { AppError, callerId } from "../utils/http";
import { validateQuery, gifSearchQuerySchema } from "../utils/validation";

// GIF search for the chat picker, through GIPHY. The key is read from the environment and never sent to the client, and
// each person may search a limited number of times a minute. API keys cannot reach /api/gifs (shared/apiKeys.ts lists the apps they can).
const perPersonPerMinute = rateLimit({
  windowMs: 60_000,
  limit: 60,
  keyGenerator: (req) => callerId(req),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  handler: (_req, _res, next) => next(new AppError(429, "You're searching a lot. Try again in a minute.")),
});

module.exports = function (app: Application) {
  // Whether GIFs are set up, so the picker's button can be left out when they aren't.
  app.get("/api/gifs/status", authenticateToken, (_req: Request, res: Response) => {
    res.json({ status: true, message: "", data: { enabled: gifsEnabled() } });
  });

  app.get(
    "/api/gifs",
    authenticateToken,
    perPersonPerMinute,
    validateQuery(gifSearchQuerySchema),
    async (req: Request, res: Response) => {
      const { q, offset } = gifSearchQuerySchema.parse(req.query);
      res.json({ status: true, message: "", data: await findGifs(q, offset) });
    },
  );
};
