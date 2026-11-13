import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { Conversation } from "../../models/conversation";
import { hasPermission } from "../../communities/policy";
import {
  canSeeChannel,
  createChannel,
  deleteChannel,
  listChannels,
  loadChannel,
  serializeChannel,
} from "../../communities/channels";
import { loadCommunity, communityMemberIds } from "../../communities/service";
import { realtime } from "../../realtime";
import { AppError, callerId } from "../../utils/http";
import {
  validate,
  validateParams,
  createChannelSchema,
  reorderChannelsSchema,
  communityChannelParamSchema,
  communityParamSchema,
  updateChannelSchema,
} from "../../utils/validation";
import { COMMUNITY_MAX_CHANNELS } from "@shared/communities";

const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });

export function registerChannelRoutes(app: Application) {
  const tell = (community: { _id: unknown; members: Array<{ user_id: string }> }) =>
    realtime.toUsers(communityMemberIds(community), "community:channels", { communityId: String(community._id) });

  // The channels you can see, in order.
  app.get(
    "/api/communities/:communityId/channels",
    authenticateToken,
    validateParams(communityParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      ok(res, { channels: await listChannels(community, me) });
    },
  );

  // Add a channel at the end. Needs manage channels.
  app.post(
    "/api/communities/:communityId/channels",
    authenticateToken,
    validateParams(communityParamSchema),
    validate(createChannelSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      if (!hasPermission(community, me, "manageChannels"))
        throw new AppError(403, "You can't change this community's channels");
      if (
        (await Conversation.countDocuments({ communityId: String(community._id) }).exec()) >= COMMUNITY_MAX_CHANNELS
      ) {
        throw new AppError(400, `A community can have at most ${COMMUNITY_MAX_CHANNELS} channels`);
      }
      const channel = await createChannel(community, createChannelSchema.parse(req.body));
      tell(community);
      ok(res, { channel: serializeChannel(channel, undefined) });
    },
  );

  // Put the channels in a new order, and under new categories. Must name every channel of the community exactly once.
  app.put(
    "/api/communities/:communityId/channels/order",
    authenticateToken,
    validateParams(communityParamSchema),
    validate(reorderChannelsSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      if (!hasPermission(community, me, "manageChannels"))
        throw new AppError(403, "You can't change this community's channels");
      const wanted = reorderChannelsSchema.parse(req.body).channels;
      const existing = await Conversation.find({ communityId: String(community._id) }, "_id")
        .lean()
        .exec();
      const ids = new Set(existing.map((c) => String(c._id)));
      if (
        wanted.length !== ids.size ||
        new Set(wanted.map((w) => w.id)).size !== ids.size ||
        wanted.some((w) => !ids.has(w.id))
      ) {
        throw new AppError(400, "List every channel of the community once");
      }
      await Conversation.bulkWrite(
        wanted.map((w, position) => ({
          updateOne: {
            filter: { _id: w.id, communityId: String(community._id) },
            update: { $set: { "channel.position": position, "channel.category": w.category } },
          },
        })),
      );
      tell(community);
      ok(res, { channels: await listChannels(community, me) });
    },
  );

  // Rename, set the topic, or move to another category. Needs manage channels.
  app.patch(
    "/api/communities/:communityId/channels/:channelId",
    authenticateToken,
    validateParams(communityChannelParamSchema),
    validate(updateChannelSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      const channel = await loadChannel(community, req.params.channelId as string);
      if (!canSeeChannel(community, channel, me)) throw new AppError(404, "Channel not found");
      if (!hasPermission(community, me, "manageChannels"))
        throw new AppError(403, "You can't change this community's channels");
      const change = updateChannelSchema.parse(req.body);
      if (change.name !== undefined) channel.name = change.name;
      if (change.topic !== undefined) channel.set("channel.topic", change.topic);
      if (change.category !== undefined) channel.set("channel.category", change.category);
      await channel.save();
      tell(community);
      ok(res, { channel: serializeChannel(channel, undefined) });
    },
  );

  // Delete a channel and its messages. A community always keeps at least one.
  app.delete(
    "/api/communities/:communityId/channels/:channelId",
    authenticateToken,
    validateParams(communityChannelParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const community = await loadCommunity(req.params.communityId as string, me);
      const channel = await loadChannel(community, req.params.channelId as string);
      if (!canSeeChannel(community, channel, me)) throw new AppError(404, "Channel not found");
      if (!hasPermission(community, me, "manageChannels"))
        throw new AppError(403, "You can't change this community's channels");
      if ((await Conversation.countDocuments({ communityId: String(community._id) }).exec()) <= 1) {
        throw new AppError(400, "A community needs at least one channel");
      }
      await deleteChannel(channel._id);
      tell(community);
      ok(res, {});
    },
  );
}
