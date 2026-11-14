import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { hasPermission, isCommunityOwner, memberOf } from "../../communities/policy";
import { announceCommunity, loadCommunity, presentCommunity } from "../../communities/service";
import { AppError, callerId } from "../../utils/http";
import {
  validate,
  validateParams,
  communityMemberParamSchema,
  communityOwnerSchema,
  communityParamSchema,
} from "../../utils/validation";

const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });

export function registerCommunityMemberRoutes(app: Application) {
  // Leave. The owner can't: hand the community to someone else first, or delete it.
  app.delete(
    "/api/communities/:communityId/membership",
    authenticateToken,
    validateParams(communityParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      if (isCommunityOwner(community, me)) {
        throw new AppError(400, "The owner can't leave: hand the community to someone else first, or delete it");
      }
      community.set(
        "members",
        community.members.filter((m) => m.user_id !== me),
      );
      await community.save();
      announceCommunity(community, [me]);
      ok(res, {});
    },
  );

  // Remove someone. Needs kick members, and the owner can't be removed.
  app.delete(
    "/api/communities/:communityId/members/:userId",
    authenticateToken,
    validateParams(communityMemberParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const target = req.params.userId as string;
      const community = await loadCommunity(req.params.communityId as string, me);
      if (!hasPermission(community, me, "kickMembers")) throw new AppError(403, "You can't remove people");
      if (target === me) throw new AppError(400, "Use leave to go yourself");
      const member = memberOf(community, target);
      if (!member) throw new AppError(404, "They're not in this community");
      if (member.role === "owner") throw new AppError(400, "The owner can't be removed");
      community.set(
        "members",
        community.members.filter((m) => m.user_id !== target),
      );
      await community.save();
      announceCommunity(community, [target]);
      ok(res, { community: await presentCommunity(community, me) });
    },
  );

  // Hand the community to another member. Only the owner; they become an ordinary member.
  app.patch(
    "/api/communities/:communityId/owner",
    authenticateToken,
    validateParams(communityParamSchema),
    validate(communityOwnerSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      if (!isCommunityOwner(community, me)) throw new AppError(403, "Only the owner can hand the community over");
      const to = communityOwnerSchema.parse(req.body).userId;
      if (to === me) throw new AppError(400, "You already own this community");
      if (!memberOf(community, to)) throw new AppError(404, "They're not in this community");
      community.set(
        "members",
        community.members.map((m) => ({
          user_id: m.user_id,
          role: m.user_id === to ? "owner" : "member",
          roleIds: m.roleIds,
          joinedAt: m.joinedAt,
        })),
      );
      await community.save();
      announceCommunity(community);
      ok(res, { community: await presentCommunity(community, me) });
    },
  );
}
