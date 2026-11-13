import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { hasPermission, isSpaceOwner, memberOf } from "../../spaces/policy";
import { announceSpace, loadSpace, presentSpace } from "../../spaces/service";
import { AppError, callerId } from "../../utils/http";
import {
  validate,
  validateParams,
  spaceMemberParamSchema,
  spaceOwnerSchema,
  spaceParamSchema,
} from "../../utils/validation";

const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });

export function registerSpaceMemberRoutes(app: Application) {
  // Leave. The owner can't: hand the space to someone else first, or delete it.
  app.delete(
    "/api/spaces/:spaceId/membership",
    authenticateToken,
    validateParams(spaceParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      if (isSpaceOwner(space, me)) {
        throw new AppError(400, "The owner can't leave: hand the space to someone else first, or delete it");
      }
      space.set(
        "members",
        space.members.filter((m) => m.user_id !== me),
      );
      await space.save();
      announceSpace(space, [me]);
      ok(res, {});
    },
  );

  // Remove someone. Needs kick members, and the owner can't be removed.
  app.delete(
    "/api/spaces/:spaceId/members/:userId",
    authenticateToken,
    validateParams(spaceMemberParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const target = req.params.userId as string;
      const space = await loadSpace(req.params.spaceId as string, me);
      if (!hasPermission(space, me, "kickMembers")) throw new AppError(403, "You can't remove people");
      if (target === me) throw new AppError(400, "Use leave to go yourself");
      const member = memberOf(space, target);
      if (!member) throw new AppError(404, "They're not in this space");
      if (member.role === "owner") throw new AppError(400, "The owner can't be removed");
      space.set(
        "members",
        space.members.filter((m) => m.user_id !== target),
      );
      await space.save();
      announceSpace(space, [target]);
      ok(res, { space: await presentSpace(space, me) });
    },
  );

  // Hand the space to another member. Only the owner; they become an ordinary member.
  app.patch(
    "/api/spaces/:spaceId/owner",
    authenticateToken,
    validateParams(spaceParamSchema),
    validate(spaceOwnerSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      if (!isSpaceOwner(space, me)) throw new AppError(403, "Only the owner can hand the space over");
      const to = spaceOwnerSchema.parse(req.body).userId;
      if (to === me) throw new AppError(400, "You already own this space");
      if (!memberOf(space, to)) throw new AppError(404, "They're not in this space");
      space.set(
        "members",
        space.members.map((m) => ({
          user_id: m.user_id,
          role: m.user_id === to ? "owner" : "member",
          roleIds: m.roleIds,
          joinedAt: m.joinedAt,
        })),
      );
      await space.save();
      announceSpace(space);
      ok(res, { space: await presentSpace(space, me) });
    },
  );
}
