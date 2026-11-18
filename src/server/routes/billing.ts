import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { callerId } from "../utils/http";
import { validate, validateParams, communityParamSchema, giftGemsSchema } from "../utils/validation";
import { giftGems } from "../billing/gifts";
import { loadCommunity } from "../communities/service";
import { billingOverview } from "../billing/overview";
import { communityAccount, userAccount } from "../billing/ledger";

// The Billing view's data (docs/billing.md): a person's own bill, and a community's for its members.
module.exports = function (app: express.Application) {
  app.get("/api/billing/me", authenticateToken, async (req: express.Request, res: express.Response) => {
    res.json({ status: true, message: "", data: await billingOverview(userAccount(callerId(req))) });
  });

  // Give gems to another person. Whole gems, never to yourself, and it can't be taken back.
  app.post(
    "/api/billing/gift",
    authenticateToken,
    validate(giftGemsSchema),
    async (req: express.Request, res: express.Response) => {
      const { toUserId, gems, note, requestId } = giftGemsSchema.parse(req.body);
      const result = await giftGems(callerId(req), toUserId, gems, note || undefined, requestId);
      res.json({ status: true, message: "Gems sent", data: result });
    },
  );

  // Any member can see the community's bill; anyone else gets 404.
  app.get(
    "/api/communities/:communityId/billing",
    authenticateToken,
    validateParams(communityParamSchema),
    async (req: express.Request, res: express.Response) => {
      const community = await loadCommunity(req.params.communityId as string, callerId(req));
      res.json({ status: true, message: "", data: await billingOverview(communityAccount(community._id)) });
    },
  );
};
