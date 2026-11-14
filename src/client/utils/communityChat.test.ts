import { describe, it, expect } from "vitest";
import type { Community, CommunityChannel } from "@shared/communities";
import { channelConversation, firstChannel, groupChannels, roleColorOf, unreadChannelCount } from "./communityChat";

const person = (id: string) => ({ _id: id, username: id, avatar: "" });
const community: Community = {
  _id: "c",
  name: "Crew",
  icon: null,
  ownerId: "a",
  members: [
    { user_id: "a", role: "owner", roleIds: [], joinedAt: "2026-01-01T00:00:00Z" },
    { user_id: "s", role: "member", roleIds: ["mod", "helper"], joinedAt: "2026-01-02T00:00:00Z" },
    { user_id: "j", role: "member", roleIds: ["plain"], joinedAt: "2026-01-03T00:00:00Z" },
  ],
  people: [person("a"), person("s"), person("j")],
  roles: [
    { _id: "mod", name: "Moderator", color: "#0f766e", position: 3, permissions: [], everyone: false },
    { _id: "helper", name: "Helper", color: "#7e22ce", position: 2, permissions: [], everyone: false },
    { _id: "plain", name: "Plain", color: "", position: 1, permissions: [], everyone: false },
    { _id: "e", name: "everyone", color: "", position: 0, permissions: [], everyone: true },
  ],
  permissions: ["readMessages"],
  unreadChannels: 0,
  unreadMentions: 0,
  createdAt: "2026-01-01T00:00:00Z",
};
const channel = (over: Partial<CommunityChannel>): CommunityChannel => ({
  _id: "ch",
  communityId: "c",
  name: "general",
  topic: "",
  category: "",
  position: 0,
  seq: 10,
  lastMessage: null,
  unread: 0,
  mentions: 0,
  muted: false,
  overrides: [],
  permissions: ["readMessages", "sendMessages"],
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});

describe("channelConversation", () => {
  it("shows a channel in the chat screen's shape, with the community's people and the viewer's read position", () => {
    const c = channelConversation(community, channel({ seq: 10, unread: 3, name: "random" }), "j");
    expect(c).toMatchObject({ _id: "ch", name: "random", seq: 10, unread: 3, muted: false });
    expect(c.people.map((p) => p._id)).toEqual(["a", "s", "j"]);
    expect(c.members.find((m) => m.user_id === "j")!.lastReadSeq).toBe(7);
    expect(c.members.find((m) => m.user_id === "a")!.role).toBe("owner");
    // A name makes the chat screen treat it as a group, so sender names show.
    expect(c.name).toBeTruthy();
  });

  it("never reads a negative position", () => {
    const c = channelConversation(community, channel({ seq: 2, unread: 5 }), "j");
    expect(c.members.find((m) => m.user_id === "j")!.lastReadSeq).toBe(0);
  });
});

describe("roleColorOf", () => {
  it("is the colour of the highest role that has one", () => {
    expect(roleColorOf(community, "s")).toBe("#0f766e");
  });
  it("is empty for a role with no colour, an unknown person, or no roles", () => {
    expect(roleColorOf(community, "j")).toBe("");
    expect(roleColorOf(community, "a")).toBe("");
    expect(roleColorOf(community, "nobody")).toBe("");
  });
});

describe("channel lists", () => {
  const list = [
    channel({ _id: "1", name: "general", category: "Info", position: 0 }),
    channel({ _id: "2", name: "news", category: "Info", position: 1 }),
    channel({ _id: "3", name: "plans", category: "Projects", position: 2, unread: 2 }),
    channel({ _id: "4", name: "lobby", category: "", position: 3 }),
  ];

  it("groups by category in order, with uncategorised channels first", () => {
    expect(groupChannels(list).map((g) => [g.category, g.channels.map((c) => c.name)])).toEqual([
      ["", ["lobby"]],
      ["Info", ["general", "news"]],
      ["Projects", ["plans"]],
    ]);
  });

  it("opens the first unread channel, else the first", () => {
    expect(firstChannel(list)!._id).toBe("3");
    expect(firstChannel(list.map((c) => ({ ...c, unread: 0 })))!._id).toBe("1");
    expect(firstChannel([])).toBeUndefined();
  });

  it("a muted channel doesn't count as unread or get opened first", () => {
    const muted = list.map((c) => (c._id === "3" ? { ...c, muted: true } : c));
    expect(firstChannel(muted)!._id).toBe("1");
    expect(unreadChannelCount(list)).toBe(1);
    expect(unreadChannelCount(muted)).toBe(0);
  });
});
