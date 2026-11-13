import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { Community } from "../../models/community";
import { loadPeople } from "../../chat/service";
import { createChannel } from "../../communities/channels";
import { hasPermission, isCommunityOwner } from "../../communities/policy";
import {
  announceCommunity,
  deleteCommunity,
  loadCommunity,
  presentCommunity,
  serializeCommunity,
} from "../../communities/service";
import { AppError, callerId } from "../../utils/http";
import {
  validate,
  validateParams,
  createCommunitySchema,
  renameCommunitySchema,
  communityParamSchema,
} from "../../utils/validation";
import {
  DEFAULT_CHANNEL_NAME,
  DEFAULT_EVERYONE_PERMISSIONS,
  COMMUNITY_MAX_COMMUNITIES_PER_USER,
} from "@shared/communities";

const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });

export function registerCommunityRoutes(app: Application) {
  // My communities, newest first.
  app.get("/api/communities", authenticateToken, async (req: Request, res: Response) => {
    const me = callerId(req);
    const communities = await Community.find({ "members.user_id": me }).sort({ createdAt: -1 }).exec();
    const people = await loadPeople(communities.flatMap((s) => s.members.map((m) => m.user_id)));
    ok(res, { communities: communities.map((s) => serializeCommunity(s, me, people)) });
  });

  // Make a community. The maker is its owner.
  app.post(
    "/api/communities",
    authenticateToken,
    validate(createCommunitySchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      if ((await Community.countDocuments({ "members.user_id": me }).exec()) >= COMMUNITY_MAX_COMMUNITIES_PER_USER) {
        throw new AppError(400, `You can be in at most ${COMMUNITY_MAX_COMMUNITIES_PER_USER} communities`);
      }
      const community = await Community.create({
        name: createCommunitySchema.parse(req.body).name,
        members: [{ user_id: me, role: "owner" }],
        roles: [{ name: "everyone", position: 0, everyone: true, permissions: [...DEFAULT_EVERYONE_PERMISSIONS] }],
      });
      await createChannel(community, { name: DEFAULT_CHANNEL_NAME });
      ok(res, { community: await presentCommunity(community, me) });
    },
  );

  app.get(
    "/api/communities/:communityId",
    authenticateToken,
    validateParams(communityParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      ok(res, { community: await presentCommunity(community, me) });
    },
  );

  // Rename. Needs manage community.
  app.patch(
    "/api/communities/:communityId",
    authenticateToken,
    validateParams(communityParamSchema),
    validate(renameCommunitySchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      if (!hasPermission(community, me, "manageCommunity")) throw new AppError(403, "You can't change this community");
      community.name = renameCommunitySchema.parse(req.body).name;
      await community.save();
      announceCommunity(community);
      ok(res, { community: await presentCommunity(community, me) });
    },
  );

  // Delete the community for everyone. Only the owner.
  app.delete(
    "/api/communities/:communityId",
    authenticateToken,
    validateParams(communityParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      if (!isCommunityOwner(community, me)) throw new AppError(403, "Only the owner can delete a community");
      await deleteCommunity(community);
      announceCommunity(
        community,
        community.members.map((m) => m.user_id),
      );
      ok(res, {});
    },
  );
}
