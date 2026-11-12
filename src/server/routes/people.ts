import express = require("express");
import { User } from "../models/user";
import { authenticateToken } from "../middleware/auth";
import { AppError, callerId } from "../utils/http";
import { PUBLIC_USER_FIELDS } from "../utils/publicUser";
import { knownPeopleOf, knownTallyOf, publicPerson, sharedSpacesBetween } from "../social";
import { userIdParamSchema, userSearchQuerySchema, validateParams, validateQuery } from "../utils/validation";
import { escapeRegex } from "@shared/regex";

const SEARCH_MIN = 2;
const SEARCH_LIMIT = 20;

// People: who you know (everyone you share a space with), a safe search over everyone, and a public profile.
// The hub is open, so a stranger is found by name and can be added; these routes only make that easy and safe.
module.exports = function (app: express.Application) {
  // Everyone you share a space with, most shared first. The pickers show this before any search.
  app.get("/api/people", authenticateToken, async (req: express.Request, res: express.Response) => {
    const people = await knownPeopleOf(callerId(req));
    return res.json({ status: true, message: "", data: { people } });
  });

  // Search by username prefix. Fewer than two letters returns nothing rather than an arbitrary slice of the user base,
  // and the text is escaped so it can never be a regex. People you know sort first.
  app.get(
    "/api/users/search",
    authenticateToken,
    validateQuery(userSearchQuerySchema),
    async (req: express.Request, res: express.Response) => {
      const me = callerId(req);
      const q = String(req.query.q ?? "").trim();
      if (q.length < SEARCH_MIN) return res.json({ status: true, message: "", data: { users: [] } });

      const [found, tally] = await Promise.all([
        User.find({ username: { $regex: `^${escapeRegex(q)}`, $options: "i" }, _id: { $ne: me } }, PUBLIC_USER_FIELDS)
          .sort({ username: 1 })
          .limit(SEARCH_LIMIT)
          .lean(),
        knownTallyOf(me),
      ]);
      const users = found
        .map((u) => ({ ...publicPerson(u), sharedCount: tally.get(String(u._id))?.count ?? 0 }))
        .sort((a, b) => b.sharedCount - a.sharedCount);
      return res.json({ status: true, message: "", data: { users } });
    },
  );

  // A person's public profile, plus the spaces you share. Public fields only: no email, roles, gems or inventory.
  app.get(
    "/api/users/:userId",
    authenticateToken,
    validateParams(userIdParamSchema),
    async (req: express.Request, res: express.Response) => {
      const me = callerId(req);
      const { userId } = req.params as { userId: string };
      const user = await User.findById(userId, PUBLIC_USER_FIELDS).lean();
      if (!user) throw new AppError(404, "User not found");
      const isSelf = userId === me;
      return res.json({
        status: true,
        message: "",
        data: {
          user: { ...publicPerson(user), joinedAt: (user._id as any).getTimestamp().toISOString() },
          isSelf,
          sharedSpaces: isSelf ? [] : await sharedSpacesBetween(me, userId),
        },
      });
    },
  );
};
