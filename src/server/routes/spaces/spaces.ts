import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { Space } from "../../models/space";
import { loadPeople } from "../../chat/service";
import { createChannel } from "../../spaces/channels";
import { hasPermission, isSpaceOwner } from "../../spaces/policy";
import { announceSpace, deleteSpace, loadSpace, presentSpace, serializeSpace } from "../../spaces/service";
import { AppError, callerId } from "../../utils/http";
import {
  validate,
  validateParams,
  createSpaceSchema,
  renameSpaceSchema,
  spaceParamSchema,
} from "../../utils/validation";
import { DEFAULT_CHANNEL_NAME, DEFAULT_EVERYONE_PERMISSIONS, SPACE_MAX_SPACES_PER_USER } from "@shared/spaces";

const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });

export function registerSpaceRoutes(app: Application) {
  // My spaces, newest first.
  app.get("/api/spaces", authenticateToken, async (req: Request, res: Response) => {
    const me = callerId(req);
    const spaces = await Space.find({ "members.user_id": me }).sort({ createdAt: -1 }).exec();
    const people = await loadPeople(spaces.flatMap((s) => s.members.map((m) => m.user_id)));
    ok(res, { spaces: spaces.map((s) => serializeSpace(s, me, people)) });
  });

  // Make a space. The maker is its owner.
  app.post("/api/spaces", authenticateToken, validate(createSpaceSchema), async (req: Request, res: Response) => {
    const me = callerId(req);
    if ((await Space.countDocuments({ "members.user_id": me }).exec()) >= SPACE_MAX_SPACES_PER_USER) {
      throw new AppError(400, `You can be in at most ${SPACE_MAX_SPACES_PER_USER} spaces`);
    }
    const space = await Space.create({
      name: createSpaceSchema.parse(req.body).name,
      members: [{ user_id: me, role: "owner" }],
      roles: [{ name: "everyone", position: 0, everyone: true, permissions: [...DEFAULT_EVERYONE_PERMISSIONS] }],
    });
    await createChannel(space, { name: DEFAULT_CHANNEL_NAME });
    ok(res, { space: await presentSpace(space, me) });
  });

  app.get(
    "/api/spaces/:spaceId",
    authenticateToken,
    validateParams(spaceParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      ok(res, { space: await presentSpace(space, me) });
    },
  );

  // Rename. Needs manage space.
  app.patch(
    "/api/spaces/:spaceId",
    authenticateToken,
    validateParams(spaceParamSchema),
    validate(renameSpaceSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      if (!hasPermission(space, me, "manageSpace")) throw new AppError(403, "You can't change this space");
      space.name = renameSpaceSchema.parse(req.body).name;
      await space.save();
      announceSpace(space);
      ok(res, { space: await presentSpace(space, me) });
    },
  );

  // Delete the space for everyone. Only the owner.
  app.delete(
    "/api/spaces/:spaceId",
    authenticateToken,
    validateParams(spaceParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      if (!isSpaceOwner(space, me)) throw new AppError(403, "Only the owner can delete a space");
      await deleteSpace(space);
      announceSpace(
        space,
        space.members.map((m) => m.user_id),
      );
      ok(res, {});
    },
  );
}
