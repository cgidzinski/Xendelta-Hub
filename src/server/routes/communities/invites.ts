import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { Community } from "../../models/community";
import { CommunityInvite } from "../../models/communityInvite";
import { User } from "../../models/user";
import { loadPeople } from "../../chat/service";
import { hasPermission, isCommunityMember } from "../../communities/policy";
import { announceCommunity, loadCommunity } from "../../communities/service";
import { can } from "../../social/policy";
import { realtime } from "../../realtime";
import { notify } from "../../utils/notificationUtils";
import { AppError, callerId } from "../../utils/http";
import {
  validate,
  validateParams,
  inviteCommunitySchema,
  respondInviteSchema,
  communityMemberParamSchema,
  communityParamSchema,
} from "../../utils/validation";
import {
  COMMUNITY_INVITES_PER_HOUR,
  COMMUNITY_MAX_MEMBERS,
  COMMUNITY_MAX_COMMUNITIES_PER_USER,
  type MyCommunityInvite,
  type PendingCommunityInvite,
} from "@shared/communities";

const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });
const needInvite = (community: Parameters<typeof hasPermission>[0], me: string) => {
  if (!hasPermission(community, me, "invite")) throw new AppError(403, "You can't invite people to this community");
};

export function registerInviteRoutes(app: Application) {
  // Invite people who have an account. Anyone already in, or already invited, is skipped, so asking twice is harmless.
  app.post(
    "/api/communities/:communityId/invites",
    authenticateToken,
    validateParams(communityParamSchema),
    validate(inviteCommunitySchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      needInvite(community, me);
      const { userIds } = inviteCommunitySchema.parse(req.body);
      if (userIds.some((id) => !can(me, id, "addToSpace"))) throw new AppError(403, "You can't invite that person");

      const users = await User.find({ _id: { $in: userIds } }, "_id")
        .lean()
        .exec();
      if (users.length !== userIds.length) throw new AppError(404, "Someone you picked doesn't exist");

      const already = new Set(community.members.map((m) => m.user_id));
      const open = new Set(
        (
          await CommunityInvite.find({ communityId: String(community._id), userId: { $in: userIds } }, "userId")
            .lean()
            .exec()
        ).map((i) => i.userId),
      );
      const fresh = userIds.filter((id) => !already.has(id) && !open.has(id));

      const sentLately = await CommunityInvite.countDocuments({
        invitedBy: me,
        createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) },
      }).exec();
      if (sentLately + fresh.length > COMMUNITY_INVITES_PER_HOUR) {
        throw new AppError(429, "You've sent a lot of invites. Try again in a while.");
      }
      if (community.members.length + open.size + fresh.length > COMMUNITY_MAX_MEMBERS) {
        throw new AppError(400, `A community can have at most ${COMMUNITY_MAX_MEMBERS} people`);
      }

      await CommunityInvite.insertMany(
        fresh.map((userId) => ({ communityId: String(community._id), userId, invitedBy: me })),
      );
      const inviter = (await loadPeople([me])).get(me)?.username ?? "Someone";
      for (const userId of fresh) {
        realtime.toUsers([userId], "community:invite", { communityId: String(community._id) });
        void notify(userId, {
          title: "Community invite",
          message: `${inviter} invited you to ${community.name}`,
          link: "/internal/communities",
          icon: "person",
        }).catch(() => undefined);
      }
      ok(res, { invited: fresh.length });
    },
  );

  // Invites nobody has answered yet. For people who can invite.
  app.get(
    "/api/communities/:communityId/invites",
    authenticateToken,
    validateParams(communityParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      needInvite(community, me);
      const invites = await CommunityInvite.find({ communityId: String(community._id) })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
      const people = await loadPeople(invites.map((i) => i.userId));
      const pending: PendingCommunityInvite[] = invites.flatMap((i) => {
        const person = people.get(i.userId);
        return person ? [{ person, invitedBy: i.invitedBy, createdAt: i.createdAt.toISOString() }] : [];
      });
      ok(res, { invites: pending });
    },
  );

  // Take an invite back.
  app.delete(
    "/api/communities/:communityId/invites/:userId",
    authenticateToken,
    validateParams(communityMemberParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      needInvite(community, me);
      const target = req.params.userId as string;
      const removed = await CommunityInvite.findOneAndDelete({
        communityId: String(community._id),
        userId: target,
      }).exec();
      if (!removed) throw new AppError(404, "There's no invite for them");
      realtime.toUsers([target], "community:invite", { communityId: String(community._id) });
      ok(res, {});
    },
  );

  // Invites waiting for me.
  app.get("/api/community-invites", authenticateToken, async (req: Request, res: Response) => {
    const me = callerId(req);
    const invites = await CommunityInvite.find({ userId: me }).sort({ createdAt: -1 }).lean().exec();
    const communities = await Community.find({ _id: { $in: invites.map((i) => i.communityId) } }).exec();
    const byCommunity = new Map(communities.map((s) => [String(s._id), s]));
    const people = await loadPeople(invites.map((i) => i.invitedBy));
    const mine: MyCommunityInvite[] = invites.flatMap((i) => {
      const community = byCommunity.get(i.communityId);
      if (!community) return [];
      return [
        {
          communityId: i.communityId,
          communityName: community.name,
          communityIcon: community.icon ?? null,
          memberCount: community.members.length,
          invitedBy: people.get(i.invitedBy) ?? null,
          createdAt: i.createdAt.toISOString(),
        },
      ];
    });
    ok(res, { invites: mine });
  });

  // Say yes or no. Only the person invited can answer.
  app.put(
    "/api/community-invites/:communityId",
    authenticateToken,
    validateParams(communityParamSchema),
    validate(respondInviteSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const communityId = req.params.communityId as string;
      const invite = await CommunityInvite.findOne({ communityId, userId: me }).exec();
      if (!invite) throw new AppError(404, "That invite is no longer open");

      if (!respondInviteSchema.parse(req.body).accept) {
        await invite.deleteOne();
        return ok(res, { joined: false });
      }

      const community = await Community.findById(communityId).exec();
      if (!community) {
        await invite.deleteOne();
        throw new AppError(404, "That community no longer exists");
      }
      if (!isCommunityMember(community, me)) {
        if (community.members.length >= COMMUNITY_MAX_MEMBERS) throw new AppError(400, "That community is full");
        if ((await Community.countDocuments({ "members.user_id": me }).exec()) >= COMMUNITY_MAX_COMMUNITIES_PER_USER) {
          throw new AppError(400, `You can be in at most ${COMMUNITY_MAX_COMMUNITIES_PER_USER} communities`);
        }
        community.members.push({ user_id: me, role: "member", roleIds: [], joinedAt: new Date() } as never);
        await community.save();
        announceCommunity(community);
      }
      await invite.deleteOne();
      ok(res, { joined: true, communityId });
    },
  );
}
