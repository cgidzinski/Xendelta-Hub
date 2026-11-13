import { z } from "zod";
import { objectIdSchema } from "./core";
import {
  SPACE_CATEGORY_MAX,
  SPACE_CHANNEL_NAME_MAX,
  SPACE_CHANNEL_TOPIC_MAX,
  SPACE_MAX_CHANNELS,
  SPACE_NAME_MAX,
} from "../../../shared/spaces";

export const spaceParamSchema = z.object({ spaceId: objectIdSchema });
export const spaceMemberParamSchema = z.object({ spaceId: objectIdSchema, userId: objectIdSchema });

const spaceName = z.string().trim().min(1, "Give the space a name").max(SPACE_NAME_MAX);

export const createSpaceSchema = z.object({ name: spaceName });
export const renameSpaceSchema = z.object({ name: spaceName });
/** Hand the space to another member. */
export const spaceOwnerSchema = z.object({ userId: objectIdSchema });

export const spaceChannelParamSchema = z.object({ spaceId: objectIdSchema, channelId: objectIdSchema });

const channelName = z.string().trim().min(1, "Give the channel a name").max(SPACE_CHANNEL_NAME_MAX);
const channelTopic = z.string().trim().max(SPACE_CHANNEL_TOPIC_MAX);
const channelCategory = z.string().trim().max(SPACE_CATEGORY_MAX);

export const createChannelSchema = z.object({
  name: channelName,
  topic: channelTopic.optional(),
  category: channelCategory.optional(),
});
export const updateChannelSchema = z
  .object({ name: channelName.optional(), topic: channelTopic.optional(), category: channelCategory.optional() })
  .refine((v) => v.name !== undefined || v.topic !== undefined || v.category !== undefined, {
    message: "Nothing to change",
  });
/** Every channel of the space, top to bottom, each with the category it now sits under. */
export const reorderChannelsSchema = z.object({
  channels: z
    .array(z.object({ id: objectIdSchema, category: channelCategory }))
    .min(1)
    .max(SPACE_MAX_CHANNELS),
});
