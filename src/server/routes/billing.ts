import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { callerId } from "../utils/http";
import { validateParams, communityParamSchema } from "../utils/validation";
import { loadCommunity } from "../communities/service";
import { billingOverview } from "../billing/overview";
import { communityAccount, userAccount } from "../billing/ledger";

// The Billing view's data (docs/billing.md): a person's own bill, and a community's for its members.
module.exports = function (app: express.Application) {
  app.get("/api/billing/me", authenticateToken, async (req: express.Request, res: express.Response) => {
    res.json({ status: true, message: "", data: await billingOverview(userAccount(callerId(req))) });
  });

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
