import { z } from "zod";
import { objectIdSchema } from "./core";
import {
  COMMUNITY_MAX_INVITES_AT_ONCE,
  CHANNEL_PERMISSIONS,
  COMMUNITY_PERMISSIONS,
  COMMUNITY_MAX_ROLES,
  COMMUNITY_ROLE_NAME_MAX,
  COMMUNITY_CATEGORY_MAX,
  COMMUNITY_CHANNEL_NAME_MAX,
  COMMUNITY_CHANNEL_TOPIC_MAX,
  COMMUNITY_MAX_CHANNELS,
  COMMUNITY_NAME_MAX,
} from "../../../shared/communities";

export const communityParamSchema = z.object({ communityId: objectIdSchema });
export const communityMemberParamSchema = z.object({ communityId: objectIdSchema, userId: objectIdSchema });

const communityName = z.string().trim().min(1, "Give the community a name").max(COMMUNITY_NAME_MAX);

export const createCommunitySchema = z.object({ name: communityName });
export const renameCommunitySchema = z.object({ name: communityName });
/** Hand the community to another member. */
export const communityOwnerSchema = z.object({ userId: objectIdSchema });

export const communityChannelParamSchema = z.object({ communityId: objectIdSchema, channelId: objectIdSchema });

const channelName = z.string().trim().min(1, "Give the channel a name").max(COMMUNITY_CHANNEL_NAME_MAX);
const channelTopic = z.string().trim().max(COMMUNITY_CHANNEL_TOPIC_MAX);
const channelCategory = z.string().trim().max(COMMUNITY_CATEGORY_MAX);

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
/** Every channel of the community, top to bottom, each with the category it now sits under. */
export const reorderChannelsSchema = z.object({
  channels: z
    .array(z.object({ id: objectIdSchema, category: channelCategory }))
    .min(1)
    .max(COMMUNITY_MAX_CHANNELS),
});

export const communityRoleParamSchema = z.object({ communityId: objectIdSchema, roleId: objectIdSchema });

const permission = z.enum(COMMUNITY_PERMISSIONS);
const permissions = z
  .array(permission)
  .max(COMMUNITY_PERMISSIONS.length)
  .transform((list) => [...new Set(list)]);
// A hex colour like "#5b8def", or empty for the default text colour.
const roleColor = z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #5b8def")]);
const roleName = z.string().trim().min(1, "Give the role a name").max(COMMUNITY_ROLE_NAME_MAX);

export const createRoleSchema = z.object({
  name: roleName,
  color: roleColor.default(""),
  permissions: permissions.default([]),
});
export const updateRoleSchema = z
  .object({ name: roleName.optional(), color: roleColor.optional(), permissions: permissions.optional() })
  .refine((v) => v.name !== undefined || v.color !== undefined || v.permissions !== undefined, {
    message: "Nothing to change",
  });
/** Every role except everyone, highest first. */
export const reorderRolesSchema = z.object({ ids: z.array(objectIdSchema).max(COMMUNITY_MAX_ROLES) });
/** The roles a member should have now (not counting everyone). */
export const memberRolesSchema = z.object({
  roleIds: z
    .array(objectIdSchema)
    .max(COMMUNITY_MAX_ROLES)
    .transform((list) => [...new Set(list)]),
});

const channelPermission = z.enum(CHANNEL_PERMISSIONS as [string, ...string[]]);
/** Replaces all of a channel's overrides. A role missing from the list has none. */
export const channelOverridesSchema = z.object({
  overrides: z
    .array(
      z
        .object({
          roleId: objectIdSchema,
          allow: z.array(channelPermission).transform((l) => [...new Set(l)]),
          deny: z.array(channelPermission).transform((l) => [...new Set(l)]),
        })
        .refine((o) => !o.allow.some((p) => o.deny.includes(p)), {
          message: "A permission can't be both allowed and denied",
        }),
    )
    .max(COMMUNITY_MAX_ROLES)
    .refine((list) => new Set(list.map((o) => o.roleId)).size === list.length, { message: "One entry per role" }),
});

export const inviteCommunitySchema = z.object({
  userIds: z
    .array(objectIdSchema)
    .min(1, "Pick at least one person")
    .max(COMMUNITY_MAX_INVITES_AT_ONCE)
    .transform((list) => [...new Set(list)]),
});
/** Answer an invite: join (true) or turn it down (false). */
export const respondInviteSchema = z.object({ accept: z.boolean() });
