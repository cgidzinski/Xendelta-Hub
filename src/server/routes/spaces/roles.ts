import type { Application, Request, Response } from "express";
import { authenticateToken } from "../../middleware/auth";
import { Conversation } from "../../models/conversation";
import { loadChannel, serializeChannel } from "../../spaces/channels";
import { canGrantPermissions, canManageRole, hasPermission, memberOf, rankOf } from "../../spaces/policy";
import { announceSpace, loadSpace, presentSpace, spaceMemberIds } from "../../spaces/service";
import { realtime } from "../../realtime";
import { AppError, callerId } from "../../utils/http";
import {
  validate,
  validateParams,
  channelOverridesSchema,
  createRoleSchema,
  memberRolesSchema,
  reorderRolesSchema,
  spaceChannelParamSchema,
  spaceMemberParamSchema,
  spaceParamSchema,
  spaceRoleParamSchema,
  updateRoleSchema,
} from "../../utils/validation";
import { SPACE_MAX_ROLES } from "@shared/spaces";

const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });
const needRoles = (allowed: boolean) => {
  if (!allowed) throw new AppError(403, "You can't manage roles");
};

export function registerRoleRoutes(app: Application) {
  // Make a role. It starts just above everyone, so a person can never make one that outranks themselves.
  app.post(
    "/api/spaces/:spaceId/roles",
    authenticateToken,
    validateParams(spaceParamSchema),
    validate(createRoleSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      needRoles(hasPermission(space, me, "manageRoles"));
      if (space.roles.length >= SPACE_MAX_ROLES)
        throw new AppError(400, `A space can have at most ${SPACE_MAX_ROLES} roles`);
      const input = createRoleSchema.parse(req.body);
      if (!canGrantPermissions(space, me, input.permissions)) {
        throw new AppError(403, "You can only give permissions you have yourself");
      }
      for (const r of space.roles) if (!r.everyone) r.position = (r.position ?? 0) + 1;
      space.roles.push({ name: input.name, color: input.color, permissions: input.permissions, position: 1 } as never);
      await space.save();
      announceSpace(space);
      ok(res, { space: await presentSpace(space, me) });
    },
  );

  // Put the roles in a new order (highest first, everyone is always last and is not listed).
  app.put(
    "/api/spaces/:spaceId/roles/order",
    authenticateToken,
    validateParams(spaceParamSchema),
    validate(reorderRolesSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      needRoles(hasPermission(space, me, "manageRoles"));
      const ids = reorderRolesSchema.parse(req.body).ids;
      const movable = space.roles.filter((r) => !r.everyone);
      if (
        ids.length !== movable.length ||
        new Set(ids).size !== ids.length ||
        movable.some((r) => !ids.includes(String(r._id)))
      ) {
        throw new AppError(400, "List every role except everyone, once");
      }
      // Anyone but the owner can only shuffle the roles below their own: the rest must stay where they are.
      const next = new Map(ids.map((id, i) => [id, ids.length - i]));
      const rank = rankOf(space, me);
      for (const r of movable) {
        if ((r.position ?? 0) >= rank && next.get(String(r._id)) !== r.position) {
          throw new AppError(403, "You can only move roles below your own");
        }
      }
      for (const r of movable) r.position = next.get(String(r._id))!;
      await space.save();
      announceSpace(space);
      ok(res, { space: await presentSpace(space, me) });
    },
  );

  // Change a role. Everyone can have its permissions changed but keeps its name and place.
  app.patch(
    "/api/spaces/:spaceId/roles/:roleId",
    authenticateToken,
    validateParams(spaceRoleParamSchema),
    validate(updateRoleSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      const role = space.roles.id(req.params.roleId as string);
      if (!role) throw new AppError(404, "Role not found");
      const change = updateRoleSchema.parse(req.body);
      needRoles(
        hasPermission(space, me, "manageRoles") &&
          (canManageRole(space, me, role) || (role.everyone && canManageEveryone(space, me))),
      );
      if (role.everyone && (change.name !== undefined || change.color !== undefined)) {
        throw new AppError(400, "The everyone role keeps its name and colour");
      }
      if (change.permissions) {
        // Taking permissions away is always fine; giving one needs holding it yourself.
        const added = change.permissions.filter((p) => !role.permissions.includes(p));
        if (!canGrantPermissions(space, me, added))
          throw new AppError(403, "You can only give permissions you have yourself");
        role.set("permissions", change.permissions);
      }
      if (change.name !== undefined) role.name = change.name;
      if (change.color !== undefined) role.color = change.color;
      await space.save();
      announceSpace(space);
      ok(res, { space: await presentSpace(space, me) });
    },
  );

  // Delete a role: people lose it and channels forget their overrides for it. Everyone can't be deleted.
  app.delete(
    "/api/spaces/:spaceId/roles/:roleId",
    authenticateToken,
    validateParams(spaceRoleParamSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      const role = space.roles.id(req.params.roleId as string);
      if (!role) throw new AppError(404, "Role not found");
      if (role.everyone) throw new AppError(400, "The everyone role can't be deleted");
      needRoles(canManageRole(space, me, role));
      const roleId = String(role._id);
      space.set(
        "roles",
        space.roles.filter((r) => String(r._id) !== roleId),
      );
      space.set(
        "members",
        space.members.map((m) => ({
          user_id: m.user_id,
          role: m.role,
          joinedAt: m.joinedAt,
          roleIds: (m.roleIds ?? []).filter((id) => id !== roleId),
        })),
      );
      await space.save();
      await Conversation.updateMany({ spaceId: String(space._id) }, { $pull: { overrides: { roleId } } }).exec();
      announceSpace(space);
      realtime.toUsers(spaceMemberIds(space), "space:channels", { spaceId: String(space._id) });
      ok(res, { space: await presentSpace(space, me) });
    },
  );

  // Set the roles someone has (not counting everyone). Only roles below your own, and only for people below you.
  app.put(
    "/api/spaces/:spaceId/members/:userId/roles",
    authenticateToken,
    validateParams(spaceMemberParamSchema),
    validate(memberRolesSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      needRoles(hasPermission(space, me, "manageRoles"));
      const target = memberOf(space, req.params.userId as string);
      if (!target) throw new AppError(404, "They're not in this space");
      if (target.role === "owner") throw new AppError(400, "The owner already has every permission");
      const wanted = memberRolesSchema.parse(req.body).roleIds;
      const byId = new Map(space.roles.map((r) => [String(r._id), r]));
      if (wanted.some((id) => !byId.has(id) || byId.get(id)!.everyone)) throw new AppError(400, "Unknown role");

      // Everything that changes (added or removed) has to be a role the caller may manage, and the person has to rank
      // below the caller (or be the caller, who can only give up roles, never gain them).
      const current = new Set((target.roleIds ?? []).map(String));
      const changed = [
        ...wanted.filter((id) => !current.has(id)),
        ...[...current].filter((id) => !wanted.includes(id)),
      ];
      if (changed.some((id) => byId.has(id) && !canManageRole(space, me, byId.get(id)!))) {
        throw new AppError(403, "You can only give or take roles below your own");
      }
      if (target.user_id !== me && rankOf(space, target.user_id) >= rankOf(space, me)) {
        throw new AppError(403, "You can't change the roles of someone at or above your rank");
      }
      if (target.user_id === me && wanted.some((id) => !current.has(id))) {
        throw new AppError(403, "You can't give yourself roles");
      }

      space.set(
        "members",
        space.members.map((m) => ({
          user_id: m.user_id,
          role: m.role,
          joinedAt: m.joinedAt,
          roleIds: m.user_id === target.user_id ? wanted : m.roleIds,
        })),
      );
      await space.save();
      announceSpace(space);
      realtime.toUsers(spaceMemberIds(space), "space:channels", { spaceId: String(space._id) });
      ok(res, { space: await presentSpace(space, me) });
    },
  );

  // Replace a channel's overrides: what each role is allowed or denied here (a private or read-only channel).
  app.put(
    "/api/spaces/:spaceId/channels/:channelId/overrides",
    authenticateToken,
    validateParams(spaceChannelParamSchema),
    validate(channelOverridesSchema),
    async (req: Request, res: Response) => {
      const me = callerId(req);
      const space = await loadSpace(req.params.spaceId as string, me);
      const channel = await loadChannel(space, req.params.channelId as string);
      needRoles(hasPermission(space, me, "manageRoles"));
      const { overrides } = channelOverridesSchema.parse(req.body);
      const roles = new Map(space.roles.map((r) => [String(r._id), r]));
      if (overrides.some((o) => !roles.has(o.roleId))) throw new AppError(400, "Unknown role");
      // You can only allow what you have yourself; denying is always fine for someone who manages roles.
      if (overrides.some((o) => !canGrantPermissions(space, me, o.allow))) {
        throw new AppError(403, "You can only allow permissions you have yourself");
      }
      channel.set("overrides", overrides);
      await channel.save();
      realtime.toUsers(spaceMemberIds(space), "space:channels", { spaceId: String(space._id) });
      ok(res, { channel: serializeChannel(channel, undefined) });
    },
  );
}

/** Editing what everyone can do is a big change, so it needs manage roles and the space's top rank or the owner. */
function canManageEveryone(space: Parameters<typeof rankOf>[0], actor: string) {
  return rankOf(space, actor) >= 1;
}
