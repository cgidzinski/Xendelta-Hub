import { describe, it, expect } from "vitest";
import { COMMUNITY_PERMISSIONS, type ChannelOverride } from "@shared/communities";
import {
  channelPermissions,
  hasPermission,
  isCommunityMember,
  isCommunityOwner,
  communityPermissions,
  type CommunityLike,
} from "./policy";
import { canManageChat, canPostChat, canReadChat } from "../chat/policy";

const community: CommunityLike = {
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

describe("community permissions", () => {
  it("the owner has every permission", () => {
    expect([...communityPermissions(community, "owner")].sort()).toEqual([...COMMUNITY_PERMISSIONS].sort());
    expect(isCommunityOwner(community, "owner")).toBe(true);
    expect(isCommunityOwner(community, "plain")).toBe(false);
  });

  it("a member gets the everyone role", () => {
    expect([...communityPermissions(community, "plain")].sort()).toEqual(["invite", "readMessages", "sendMessages"]);
  });

  it("roles combine with the everyone role", () => {
    const p = communityPermissions(community, "mod");
    expect(p.has("sendMessages")).toBe(true);
    expect(p.has("pinMessages")).toBe(true);
    expect(p.has("manageRoles")).toBe(false);
  });

  it("a person who is not in the community has nothing", () => {
    expect(communityPermissions(community, "stranger").size).toBe(0);
    expect(isCommunityMember(community, "stranger")).toBe(false);
    expect(hasPermission(community, "stranger", "readMessages")).toBe(false);
  });

  it("ignores a permission name it does not know", () => {
    const odd: CommunityLike = {
      members: [{ user_id: "a", role: "member", roleIds: [] }],
      roles: [{ _id: "e", everyone: true, permissions: ["readMessages", "flyTheMoon"] }],
    };
    expect([...communityPermissions(odd, "a")]).toEqual(["readMessages"]);
  });
});

describe("channel overrides", () => {
  const privateForEveryone: ChannelOverride[] = [
    { roleId: "r-everyone", allow: [], deny: ["readMessages", "sendMessages"] },
    { roleId: "r-mod", allow: ["readMessages", "sendMessages"], deny: [] },
  ];

  it("denying everyone makes a channel private, and a role can let people back in", () => {
    expect(hasPermission(community, "plain", "readMessages", privateForEveryone)).toBe(false);
    expect(hasPermission(community, "mod", "readMessages", privateForEveryone)).toBe(true);
    expect(hasPermission(community, "owner", "readMessages", privateForEveryone)).toBe(true);
  });

  it("a read-only channel denies sending but not reading", () => {
    const readOnly: ChannelOverride[] = [{ roleId: "r-everyone", allow: [], deny: ["sendMessages"] }];
    expect(hasPermission(community, "plain", "readMessages", readOnly)).toBe(true);
    expect(hasPermission(community, "plain", "sendMessages", readOnly)).toBe(false);
  });

  it("a deny on one of your roles beats the base permissions", () => {
    const o: ChannelOverride[] = [{ roleId: "r-muted", allow: [], deny: ["sendMessages"] }];
    expect(hasPermission(community, "muted", "sendMessages", o)).toBe(false);
    expect(hasPermission(community, "plain", "sendMessages", o)).toBe(true);
  });

  it("an override cannot hand out managing the community", () => {
    const o: ChannelOverride[] = [{ roleId: "r-everyone", allow: ["manageCommunity", "manageRoles"], deny: [] }];
    expect(channelPermissions(community, "plain", o).has("manageCommunity")).toBe(false);
    expect(channelPermissions(community, "plain", o).has("manageRoles")).toBe(false);
  });

  it("an override for a role you do not have changes nothing", () => {
    const o: ChannelOverride[] = [{ roleId: "r-mod", allow: [], deny: ["readMessages"] }];
    expect(hasPermission(community, "plain", "readMessages", o)).toBe(true);
  });
});

describe("chat access", () => {
  const dm = {
    members: [
      { user_id: "a", role: "owner" },
      { user_id: "b", role: "member" },
    ],
  };

  it("a chat outside a community is decided by its members, as before", () => {
    expect(canReadChat({ chat: dm }, "a")).toBe(true);
    expect(canPostChat({ chat: dm }, "b")).toBe(true);
    expect(canReadChat({ chat: dm }, "c")).toBe(false);
    expect(canManageChat({ chat: dm }, "a", "manageMessages")).toBe(true);
    expect(canManageChat({ chat: dm }, "b", "manageMessages")).toBe(false);
  });

  it("a channel is decided by the community, not by the chat's members", () => {
    const channel = { chat: { members: [] }, community };
    expect(canReadChat(channel, "plain")).toBe(true);
    expect(canPostChat(channel, "plain")).toBe(true);
    expect(canReadChat(channel, "stranger")).toBe(false);
    expect(canManageChat(channel, "mod", "pinMessages")).toBe(true);
    expect(canManageChat(channel, "plain", "pinMessages")).toBe(false);
  });

  it("you cannot post or manage where you cannot read", () => {
    const hidden = {
      chat: { members: [] },
      community,
      overrides: [{ roleId: "r-everyone", allow: [], deny: ["readMessages"] }] as ChannelOverride[],
    };
    expect(canReadChat(hidden, "plain")).toBe(false);
    expect(canPostChat(hidden, "plain")).toBe(false);
    expect(canManageChat(hidden, "plain", "invite")).toBe(false);
  });
});
