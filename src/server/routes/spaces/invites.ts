import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { Space } from "../../models/space";
import { SpaceInvite } from "../../models/spaceInvite";
import { User } from "../../models/user";
import { loadPeople } from "../../chat/service";
import { hasPermission, isSpaceMember } from "../../spaces/policy";
import { announceSpace, loadSpace } from "../../spaces/service";
import { can } from "../../social/policy";
import { realtime } from "../../realtime";
import { notify } from "../../utils/notificationUtils";
import { AppError, callerId } from "../../utils/http";
import {
  validate,
  validateParams,
  inviteSpaceSchema,
  respondInviteSchema,
  spaceMemberParamSchema,
  spaceParamSchema,
} from "../../utils/validation";
import {
  SPACE_INVITES_PER_HOUR,
  SPACE_MAX_MEMBERS,
  SPACE_MAX_SPACES_PER_USER,
  type MySpaceInvite,
  type PendingSpaceInvite,
} from "@shared/spaces";

const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });
const needInvite = (space: Parameters<typeof hasPermission>[0], me: string) => {
  if (!hasPermission(space, me, "invite")) throw new AppError(403, "You can't invite people to this space");
};

export function registerInviteRoutes(app: Application) {
  // Invite people who have an account. Anyone already in, or already invited, is skipped, so asking twice is harmless.
  app.post(
    "/api/spaces/:spaceId/invites",
    authenticateToken,
    validateParams(spaceParamSchema),
    validate(inviteSpaceSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      needInvite(space, me);
      const { userIds } = inviteSpaceSchema.parse(req.body);
      if (userIds.some((id) => !can(me, id, "addToSpace"))) throw new AppError(403, "You can't invite that person");

      const users = await User.find({ _id: { $in: userIds } }, "_id")
        .lean()
        .exec();
      if (users.length !== userIds.length) throw new AppError(404, "Someone you picked doesn't exist");

      const already = new Set(space.members.map((m) => m.user_id));
      const open = new Set(
        (
          await SpaceInvite.find({ spaceId: String(space._id), userId: { $in: userIds } }, "userId")
            .lean()
            .exec()
        ).map((i) => i.userId),
      );
      const fresh = userIds.filter((id) => !already.has(id) && !open.has(id));

      const sentLately = await SpaceInvite.countDocuments({
        invitedBy: me,
        createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) },
      }).exec();
      if (sentLately + fresh.length > SPACE_INVITES_PER_HOUR) {
        throw new AppError(429, "You've sent a lot of invites. Try again in a while.");
      }
      if (space.members.length + open.size + fresh.length > SPACE_MAX_MEMBERS) {
        throw new AppError(400, `A space can have at most ${SPACE_MAX_MEMBERS} people`);
      }

      await SpaceInvite.insertMany(fresh.map((userId) => ({ spaceId: String(space._id), userId, invitedBy: me })));
      const inviter = (await loadPeople([me])).get(me)?.username ?? "Someone";
      for (const userId of fresh) {
        realtime.toUsers([userId], "space:invite", { spaceId: String(space._id) });
        void notify(userId, {
          title: "Space invite",
          message: `${inviter} invited you to ${space.name}`,
          link: "/internal/spaces",
          icon: "person",
        }).catch(() => undefined);
      }
      ok(res, { invited: fresh.length });
    },
  );

  // Invites nobody has answered yet. For people who can invite.
  app.get(
    "/api/spaces/:spaceId/invites",
    authenticateToken,
    validateParams(spaceParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      needInvite(space, me);
      const invites = await SpaceInvite.find({ spaceId: String(space._id) })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
      const people = await loadPeople(invites.map((i) => i.userId));
      const pending: PendingSpaceInvite[] = invites.flatMap((i) => {
        const person = people.get(i.userId);
        return person ? [{ person, invitedBy: i.invitedBy, createdAt: i.createdAt.toISOString() }] : [];
      });
      ok(res, { invites: pending });
    },
  );

  // Take an invite back.
  app.delete(
    "/api/spaces/:spaceId/invites/:userId",
    authenticateToken,
    validateParams(spaceMemberParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      needInvite(space, me);
      const target = req.params.userId as string;
      const removed = await SpaceInvite.findOneAndDelete({ spaceId: String(space._id), userId: target }).exec();
      if (!removed) throw new AppError(404, "There's no invite for them");
      realtime.toUsers([target], "space:invite", { spaceId: String(space._id) });
      ok(res, {});
    },
  );

  // Invites waiting for me.
  app.get("/api/space-invites", authenticateToken, async (req: Request, res: Response) => {
    const me = callerId(req);
    const invites = await SpaceInvite.find({ userId: me }).sort({ createdAt: -1 }).lean().exec();
    const spaces = await Space.find({ _id: { $in: invites.map((i) => i.spaceId) } }).exec();
    const bySpace = new Map(spaces.map((s) => [String(s._id), s]));
    const people = await loadPeople(invites.map((i) => i.invitedBy));
    const mine: MySpaceInvite[] = invites.flatMap((i) => {
      const space = bySpace.get(i.spaceId);
      if (!space) return [];
      return [
        {
          spaceId: i.spaceId,
          spaceName: space.name,
          spaceIcon: space.icon ?? null,
          memberCount: space.members.length,
          invitedBy: people.get(i.invitedBy) ?? null,
          createdAt: i.createdAt.toISOString(),
        },
      ];
    });
    ok(res, { invites: mine });
  });

  // Say yes or no. Only the person invited can answer.
  app.put(
    "/api/space-invites/:spaceId",
    authenticateToken,
    validateParams(spaceParamSchema),
    validate(respondInviteSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const spaceId = req.params.spaceId as string;
      const invite = await SpaceInvite.findOne({ spaceId, userId: me }).exec();
      if (!invite) throw new AppError(404, "That invite is no longer open");

      if (!respondInviteSchema.parse(req.body).accept) {
        await invite.deleteOne();
        return ok(res, { joined: false });
      }

      const space = await Space.findById(spaceId).exec();
      if (!space) {
        await invite.deleteOne();
        throw new AppError(404, "That space no longer exists");
      }
      if (!isSpaceMember(space, me)) {
        if (space.members.length >= SPACE_MAX_MEMBERS) throw new AppError(400, "That space is full");
        if ((await Space.countDocuments({ "members.user_id": me }).exec()) >= SPACE_MAX_SPACES_PER_USER) {
          throw new AppError(400, `You can be in at most ${SPACE_MAX_SPACES_PER_USER} spaces`);
        }
        space.members.push({ user_id: me, role: "member", roleIds: [], joinedAt: new Date() } as never);
        await space.save();
        announceSpace(space);
      }
      await invite.deleteOne();
      ok(res, { joined: true, spaceId });
    },
  );
}
