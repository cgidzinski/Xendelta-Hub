import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { loadCommunity } from "../../communities/service";
import { donate, fundOf } from "../../billing/fund";
import { callerId } from "../../utils/http";
import { validate, validateParams, communityParamSchema, donateToFundSchema } from "../../utils/validation";

const ok = (res: Response, data: unknown, message = "") => res.json({ status: true, message, data });

// A community's fund (billing/fund.ts). Members only: `loadCommunity` answers 404 to anyone else.
export function registerCommunityFundRoutes(app: Application) {
  app.get(
    "/api/communities/:communityId/fund",
    authenticateToken,
    validateParams(communityParamSchema),
    async (req: Request, res: Response) => {
      const community = await loadCommunity(req.params.communityId as string, callerId(req));
      ok(res, await fundOf(community));
    },
  );

  app.post(
    "/api/communities/:communityId/fund/donate",
    authenticateToken,
    validateParams(communityParamSchema),
    validate(donateToFundSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      const { gems, requestId } = donateToFundSchema.parse(req.body);
      const result = await donate(community, me, gems, requestId);
      ok(res, result, "Thanks for chipping in");
    },
  );
}
