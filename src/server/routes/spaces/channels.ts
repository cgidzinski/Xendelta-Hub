import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { Conversation } from "../../models/conversation";
import { hasPermission } from "../../spaces/policy";
import {
  canSeeChannel,
  createChannel,
  deleteChannel,
  listChannels,
  loadChannel,
  serializeChannel,
} from "../../spaces/channels";
import { loadSpace, spaceMemberIds } from "../../spaces/service";
import { realtime } from "../../realtime";
import { AppError, callerId } from "../../utils/http";
import {
  validate,
  validateParams,
  createChannelSchema,
  reorderChannelsSchema,
  spaceChannelParamSchema,
  spaceParamSchema,
  updateChannelSchema,
} from "../../utils/validation";
import { SPACE_MAX_CHANNELS } from "@shared/spaces";

const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });

export function registerChannelRoutes(app: Application) {
  const tell = (space: { _id: unknown; members: Array<{ user_id: string }> }) =>
    realtime.toUsers(spaceMemberIds(space), "space:channels", { spaceId: String(space._id) });

  // The channels you can see, in order.
  app.get(
    "/api/spaces/:spaceId/channels",
    authenticateToken,
    validateParams(spaceParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      ok(res, { channels: await listChannels(space, me) });
    },
  );

  // Add a channel at the end. Needs manage channels.
  app.post(
    "/api/spaces/:spaceId/channels",
    authenticateToken,
    validateParams(spaceParamSchema),
    validate(createChannelSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      if (!hasPermission(space, me, "manageChannels"))
        throw new AppError(403, "You can't change this space's channels");
      if ((await Conversation.countDocuments({ spaceId: String(space._id) }).exec()) >= SPACE_MAX_CHANNELS) {
        throw new AppError(400, `A space can have at most ${SPACE_MAX_CHANNELS} channels`);
      }
      const channel = await createChannel(space, createChannelSchema.parse(req.body));
      tell(space);
      ok(res, { channel: serializeChannel(channel, undefined) });
    },
  );

  // Put the channels in a new order, and under new categories. Must name every channel of the space exactly once.
  app.put(
    "/api/spaces/:spaceId/channels/order",
    authenticateToken,
    validateParams(spaceParamSchema),
    validate(reorderChannelsSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      if (!hasPermission(space, me, "manageChannels"))
        throw new AppError(403, "You can't change this space's channels");
      const wanted = reorderChannelsSchema.parse(req.body).channels;
      const existing = await Conversation.find({ spaceId: String(space._id) }, "_id")
        .lean()
        .exec();
      const ids = new Set(existing.map((c) => String(c._id)));
      if (
        wanted.length !== ids.size ||
        new Set(wanted.map((w) => w.id)).size !== ids.size ||
        wanted.some((w) => !ids.has(w.id))
      ) {
        throw new AppError(400, "List every channel of the space once");
      }
      await Conversation.bulkWrite(
        wanted.map((w, position) => ({
          updateOne: {
            filter: { _id: w.id, spaceId: String(space._id) },
            update: { $set: { "channel.position": position, "channel.category": w.category } },
          },
        })),
      );
      tell(space);
      ok(res, { channels: await listChannels(space, me) });
    },
  );

  // Rename, set the topic, or move to another category. Needs manage channels.
  app.patch(
    "/api/spaces/:spaceId/channels/:channelId",
    authenticateToken,
    validateParams(spaceChannelParamSchema),
    validate(updateChannelSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      const channel = await loadChannel(space, req.params.channelId as string);
      if (!canSeeChannel(space, channel, me)) throw new AppError(404, "Channel not found");
      if (!hasPermission(space, me, "manageChannels"))
        throw new AppError(403, "You can't change this space's channels");
      const change = updateChannelSchema.parse(req.body);
      if (change.name !== undefined) channel.name = change.name;
      if (change.topic !== undefined) channel.set("channel.topic", change.topic);
      if (change.category !== undefined) channel.set("channel.category", change.category);
      await channel.save();
      tell(space);
      ok(res, { channel: serializeChannel(channel, undefined) });
    },
  );

  // Delete a channel and its messages. A space always keeps at least one.
  app.delete(
    "/api/spaces/:spaceId/channels/:channelId",
    authenticateToken,
    validateParams(spaceChannelParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      const channel = await loadChannel(space, req.params.channelId as string);
      if (!canSeeChannel(space, channel, me)) throw new AppError(404, "Channel not found");
      if (!hasPermission(space, me, "manageChannels"))
        throw new AppError(403, "You can't change this space's channels");
      if ((await Conversation.countDocuments({ spaceId: String(space._id) }).exec()) <= 1) {
        throw new AppError(400, "A space needs at least one channel");
      }
      await deleteChannel(channel._id);
      tell(space);
      ok(res, {});
    },
  );
}
