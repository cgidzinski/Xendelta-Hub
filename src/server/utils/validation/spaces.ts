import { z } from "zod";
import { objectIdSchema } from "./core";
import {
  SPACE_MAX_INVITES_AT_ONCE,
  CHANNEL_PERMISSIONS,
  SPACE_PERMISSIONS,
  SPACE_MAX_ROLES,
  SPACE_ROLE_NAME_MAX,
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

export const spaceRoleParamSchema = z.object({ spaceId: objectIdSchema, roleId: objectIdSchema });

const permission = z.enum(SPACE_PERMISSIONS);
const permissions = z
  .array(permission)
  .max(SPACE_PERMISSIONS.length)
  .transform((list) => [...new Set(list)]);
// A hex colour like "#5b8def", or empty for the default text colour.
const roleColor = z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #5b8def")]);
const roleName = z.string().trim().min(1, "Give the role a name").max(SPACE_ROLE_NAME_MAX);

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
export const reorderRolesSchema = z.object({ ids: z.array(objectIdSchema).max(SPACE_MAX_ROLES) });
/** The roles a member should have now (not counting everyone). */
export const memberRolesSchema = z.object({
  roleIds: z
    .array(objectIdSchema)
    .max(SPACE_MAX_ROLES)
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
    .max(SPACE_MAX_ROLES)
    .refine((list) => new Set(list.map((o) => o.roleId)).size === list.length, { message: "One entry per role" }),
});

export const inviteSpaceSchema = z.object({
  userIds: z
    .array(objectIdSchema)
    .min(1, "Pick at least one person")
    .max(SPACE_MAX_INVITES_AT_ONCE)
    .transform((list) => [...new Set(list)]),
});
/** Answer an invite: join (true) or turn it down (false). */
export const respondInviteSchema = z.object({ accept: z.boolean() });
