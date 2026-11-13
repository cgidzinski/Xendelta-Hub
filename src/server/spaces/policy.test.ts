import { describe, it, expect } from "vitest";
import { SPACE_PERMISSIONS, type ChannelOverride } from "@shared/spaces";
import {
  channelPermissions,
  hasPermission,
  isSpaceMember,
  isSpaceOwner,
  spacePermissions,
  type SpaceLike,
} from "./policy";
import { canManageChat, canPostChat, canReadChat } from "../chat/policy";

const space: SpaceLike = {
  members: [
    { user_id: "owner", role: "owner", roleIds: [] },
    { user_id: "plain", role: "member", roleIds: [] },
    { user_id: "mod", role: "member", roleIds: ["r-mod"] },
    { user_id: "muted", role: "member", roleIds: ["r-muted"] },
  ],
  roles: [
    { _id: "r-everyone", everyone: true, position: 0, permissions: ["readMessages", "sendMessages", "invite"] },
    { _id: "r-mod", position: 2, permissions: ["manageMessages", "pinMessages", "kickMembers"] },
    { _id: "r-muted", position: 1, permissions: [] },
  ],
};

describe("space permissions", () => {
  it("the owner has every permission", () => {
    expect([...spacePermissions(space, "owner")].sort()).toEqual([...SPACE_PERMISSIONS].sort());
    expect(isSpaceOwner(space, "owner")).toBe(true);
    expect(isSpaceOwner(space, "plain")).toBe(false);
  });

  it("a member gets the everyone role", () => {
    expect([...spacePermissions(space, "plain")].sort()).toEqual(["invite", "readMessages", "sendMessages"]);
  });

  it("roles combine with the everyone role", () => {
    const p = spacePermissions(space, "mod");
    expect(p.has("sendMessages")).toBe(true);
    expect(p.has("pinMessages")).toBe(true);
    expect(p.has("manageRoles")).toBe(false);
  });

  it("a person who is not in the space has nothing", () => {
    expect(spacePermissions(space, "stranger").size).toBe(0);
    expect(isSpaceMember(space, "stranger")).toBe(false);
    expect(hasPermission(space, "stranger", "readMessages")).toBe(false);
  });

  it("ignores a permission name it does not know", () => {
    const odd: SpaceLike = {
      members: [{ user_id: "a", role: "member", roleIds: [] }],
      roles: [{ _id: "e", everyone: true, permissions: ["readMessages", "flyTheMoon"] }],
    };
    expect([...spacePermissions(odd, "a")]).toEqual(["readMessages"]);
  });
});

describe("channel overrides", () => {
  const privateForEveryone: ChannelOverride[] = [
    { roleId: "r-everyone", allow: [], deny: ["readMessages", "sendMessages"] },
    { roleId: "r-mod", allow: ["readMessages", "sendMessages"], deny: [] },
  ];

  it("denying everyone makes a channel private, and a role can let people back in", () => {
    expect(hasPermission(space, "plain", "readMessages", privateForEveryone)).toBe(false);
    expect(hasPermission(space, "mod", "readMessages", privateForEveryone)).toBe(true);
    expect(hasPermission(space, "owner", "readMessages", privateForEveryone)).toBe(true);
  });

  it("a read-only channel denies sending but not reading", () => {
    const readOnly: ChannelOverride[] = [{ roleId: "r-everyone", allow: [], deny: ["sendMessages"] }];
    expect(hasPermission(space, "plain", "readMessages", readOnly)).toBe(true);
    expect(hasPermission(space, "plain", "sendMessages", readOnly)).toBe(false);
  });

  it("a deny on one of your roles beats the base permissions", () => {
    const o: ChannelOverride[] = [{ roleId: "r-muted", allow: [], deny: ["sendMessages"] }];
    expect(hasPermission(space, "muted", "sendMessages", o)).toBe(false);
    expect(hasPermission(space, "plain", "sendMessages", o)).toBe(true);
  });

  it("an override cannot hand out managing the space", () => {
    const o: ChannelOverride[] = [{ roleId: "r-everyone", allow: ["manageSpace", "manageRoles"], deny: [] }];
    expect(channelPermissions(space, "plain", o).has("manageSpace")).toBe(false);
    expect(channelPermissions(space, "plain", o).has("manageRoles")).toBe(false);
  });

  it("an override for a role you do not have changes nothing", () => {
    const o: ChannelOverride[] = [{ roleId: "r-mod", allow: [], deny: ["readMessages"] }];
    expect(hasPermission(space, "plain", "readMessages", o)).toBe(true);
  });
});

describe("chat access", () => {
  const dm = {
    members: [
      { user_id: "a", role: "owner" },
      { user_id: "b", role: "member" },
    ],
  };

  it("a chat outside a space is decided by its members, as before", () => {
    expect(canReadChat({ chat: dm }, "a")).toBe(true);
    expect(canPostChat({ chat: dm }, "b")).toBe(true);
    expect(canReadChat({ chat: dm }, "c")).toBe(false);
    expect(canManageChat({ chat: dm }, "a", "manageMessages")).toBe(true);
    expect(canManageChat({ chat: dm }, "b", "manageMessages")).toBe(false);
  });

  it("a channel is decided by the space, not by the chat's members", () => {
    const channel = { chat: { members: [] }, space };
    expect(canReadChat(channel, "plain")).toBe(true);
    expect(canPostChat(channel, "plain")).toBe(true);
    expect(canReadChat(channel, "stranger")).toBe(false);
    expect(canManageChat(channel, "mod", "pinMessages")).toBe(true);
    expect(canManageChat(channel, "plain", "pinMessages")).toBe(false);
  });

  it("you cannot post or manage where you cannot read", () => {
    const hidden = {
      chat: { members: [] },
      space,
      overrides: [{ roleId: "r-everyone", allow: [], deny: ["readMessages"] }] as ChannelOverride[],
    };
    expect(canReadChat(hidden, "plain")).toBe(false);
    expect(canPostChat(hidden, "plain")).toBe(false);
    expect(canManageChat(hidden, "plain", "invite")).toBe(false);
  });
});
