import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp([() => import("./index.js"), () => import("../chat/index.js")]);
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
type U = Awaited<ReturnType<typeof createUser>>;
const id = (u: U) => String(u.user._id);

const make = async (me: U, name = "Crew") => {
  const res = await request(t.app).post("/api/communities").set(as(me.token)).send({ name });
  expect(res.status).toBe(200);
  return res.body.data.community as any;
};
const addMember = async (communityId: string, who: U) => {
  const { Community } = await import("../../models/community.js");
  await Community.updateOne({ _id: communityId }, { $push: { members: { user_id: id(who), role: "member" } } }).exec();
};
const channels = async (communityId: string, me: U) => {
  const res = await request(t.app).get(`/api/communities/${communityId}/channels`).set(as(me.token));
  expect(res.status).toBe(200);
  return res.body.data.channels as any[];
};
const addChannel = async (communityId: string, me: U, body: Record<string, unknown>) =>
  request(t.app).post(`/api/communities/${communityId}/channels`).set(as(me.token)).send(body);
/** Pretend someone posted: the posting itself arrives with #309. */
const post = async (channelId: string, seq: number) => {
  const { Conversation } = await import("../../models/conversation.js");
  await Conversation.updateOne(
    { _id: channelId },
    { seq, lastMessage: { seq, from: "x", preview: "hi", at: new Date() } },
  );
};

describe("channels of a community", () => {
  it("a new community starts with a general channel", async () => {
    const a = await createUser();
    const community = await make(a);
    const list = await channels(community._id, a);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      name: "general",
      communityId: community._id,
      position: 0,
      category: "",
      topic: "",
      unread: 0,
    });
  });

  it("needs manage channels to add one, and puts it at the end", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    expect((await addChannel(community._id, b, { name: "mine" })).status).toBe(403);
    const res = await addChannel(community._id, a, { name: "  random ", topic: "anything", category: "Chat" });
    expect(res.status).toBe(200);
    expect(res.body.data.channel).toMatchObject({ name: "random", topic: "anything", category: "Chat", position: 1 });
    expect((await channels(community._id, b)).map((c) => c.name)).toEqual(["general", "random"]);
  });

  it("a non-member can't list or add, and bad input is refused", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await make(a);
    expect((await request(t.app).get(`/api/communities/${community._id}/channels`).set(as(b.token))).status).toBe(404);
    expect((await addChannel(community._id, b, { name: "x" })).status).toBe(404);
    expect((await addChannel(community._id, a, { name: " " })).status).toBe(400);
    expect((await addChannel(community._id, a, { name: "x".repeat(51) })).status).toBe(400);
  });

  it("renames, sets the topic and moves to a category", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    const [general] = await channels(community._id, a);
    const url = `/api/communities/${community._id}/channels/${general._id}`;
    expect((await request(t.app).patch(url).set(as(b.token)).send({ name: "no" })).status).toBe(403);
    expect((await request(t.app).patch(url).set(as(a.token)).send({})).status).toBe(400);
    const res = await request(t.app).patch(url).set(as(a.token)).send({ name: "lobby", topic: "Hi", category: "Info" });
    expect(res.body.data.channel).toMatchObject({ name: "lobby", topic: "Hi", category: "Info" });
  });

  it("reorders, and must be told about every channel once", async () => {
    const a = await createUser();
    const community = await make(a);
    await addChannel(community._id, a, { name: "two" });
    await addChannel(community._id, a, { name: "three" });
    const [one, two, three] = await channels(community._id, a);
    const url = `/api/communities/${community._id}/channels/order`;
    const put = (list: any[]) => request(t.app).put(url).set(as(a.token)).send({ channels: list });

    expect((await put([{ id: one._id, category: "" }])).status).toBe(400);
    expect(
      (
        await put([
          { id: one._id, category: "" },
          { id: one._id, category: "" },
          { id: two._id, category: "" },
        ])
      ).status,
    ).toBe(400);
    const fake = new mongoose.Types.ObjectId().toString();
    expect(
      (
        await put([
          { id: one._id, category: "" },
          { id: two._id, category: "" },
          { id: fake, category: "" },
        ])
      ).status,
    ).toBe(400);

    const res = await put([
      { id: three._id, category: "Top" },
      { id: one._id, category: "Top" },
      { id: two._id, category: "" },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.data.channels.map((c: any) => [c.name, c.position, c.category])).toEqual([
      ["three", 0, "Top"],
      ["general", 1, "Top"],
      ["two", 2, ""],
    ]);
  });

  it("deletes a channel, but a community keeps at least one", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    const extra = (await addChannel(community._id, a, { name: "extra" })).body.data.channel;
    const [general] = await channels(community._id, a);
    expect(
      (await request(t.app).delete(`/api/communities/${community._id}/channels/${extra._id}`).set(as(b.token))).status,
    ).toBe(403);
    expect(
      (await request(t.app).delete(`/api/communities/${community._id}/channels/${extra._id}`).set(as(a.token))).status,
    ).toBe(200);
    expect(
      (await request(t.app).delete(`/api/communities/${community._id}/channels/${general._id}`).set(as(a.token)))
        .status,
    ).toBe(400);
    expect((await channels(community._id, a)).map((c) => c.name)).toEqual(["general"]);
  });

  it("a channel of another community is a 404, whatever the id", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const mine = await make(a, "Mine");
    const theirs = await make(b, "Theirs");
    const [theirChannel] = await channels(theirs._id, b);
    const res = await request(t.app)
      .patch(`/api/communities/${mine._id}/channels/${theirChannel._id}`)
      .set(as(a.token))
      .send({ name: "x" });
    expect(res.status).toBe(404);
  });
});

describe("who can see a channel", () => {
  it("a channel closed to everyone is hidden from members, and answers 404 to them", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    const secret = (await addChannel(community._id, a, { name: "staff" })).body.data.channel;
    const everyone = community.roles.find((r: any) => r.everyone)._id;
    const { Conversation } = await import("../../models/conversation.js");
    await Conversation.updateOne(
      { _id: secret._id },
      { overrides: [{ roleId: everyone, allow: [], deny: ["readMessages"] }] },
    );

    expect((await channels(community._id, b)).map((c) => c.name)).toEqual(["general"]);
    expect((await channels(community._id, a)).map((c) => c.name)).toEqual(["general", "staff"]);
    expect(
      (await request(t.app).delete(`/api/communities/${community._id}/channels/${secret._id}`).set(as(b.token))).status,
    ).toBe(404);
  });
});

describe("what you may do in a channel", () => {
  it("each channel says what the viewer may do there, with the channel's overrides applied", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    const [general] = await channels(community._id, a);
    const everyone = community.roles.find((r: any) => r.everyone)._id;
    expect((await channels(community._id, b))[0].permissions.sort()).toEqual([
      "invite",
      "readMessages",
      "sendMessages",
    ]);

    const { Conversation } = await import("../../models/conversation.js");
    await Conversation.updateOne(
      { _id: general._id },
      { overrides: [{ roleId: everyone, allow: [], deny: ["sendMessages"] }] },
    );
    expect((await channels(community._id, b))[0].permissions.sort()).toEqual(["invite", "readMessages"]);
    // The owner is never held back, and the answer to a change carries it too.
    expect((await channels(community._id, a))[0].permissions).toContain("sendMessages");
    const renamed = await request(t.app)
      .patch(`/api/communities/${community._id}/channels/${general._id}`)
      .set(as(a.token))
      .send({ topic: "x" });
    expect(renamed.body.data.channel.permissions).toContain("sendMessages");
  });
});

describe("unread", () => {
  it("counts a channel with unread messages for each person, and not a muted one", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    const [general] = await channels(community._id, a);
    const unread = async (u: U) => (await request(t.app).get("/api/chat/unread").set(as(u.token))).body.data.count;

    expect(await unread(b)).toBe(0);
    await post(general._id, 3);
    expect(await unread(b)).toBe(1);
    expect((await channels(community._id, b))[0].unread).toBe(3);

    const { ChannelState } = await import("../../models/channelState.js");
    await ChannelState.create({ userId: id(a), conversationId: general._id, lastReadSeq: 3 });
    expect(await unread(a)).toBe(0);
    expect(await unread(b)).toBe(1);

    await ChannelState.create({
      userId: id(b),
      conversationId: general._id,
      lastReadSeq: 0,
      mutedUntil: new Date(Date.now() + 60_000),
    });
    expect(await unread(b)).toBe(0);
    expect((await channels(community._id, b))[0]).toMatchObject({ unread: 3, muted: true });
  });

  it("a channel is not in the chat list, and is not a chat you can rename or add people to", async () => {
    const a = await createUser();
    const community = await make(a);
    const [general] = await channels(community._id, a);
    const list = await request(t.app).get("/api/chat/conversations").set(as(a.token));
    expect(list.body.data.conversations).toEqual([]);
    expect((await request(t.app).get(`/api/chat/conversations/${general._id}`).set(as(a.token))).status).toBe(404);
    expect(
      (await request(t.app).patch(`/api/chat/conversations/${general._id}`).set(as(a.token)).send({ name: "x" }))
        .status,
    ).toBe(404);
  });
});

describe("messages in a channel", () => {
  let sent: Array<{ room: string; event: string; payload: any }> = [];
  beforeAll(async () => {
    const { SocketManager } = await import("../../infrastructure/SocketManager.js");
    (SocketManager.getInstance() as any).io = {
      to: (room: string) => ({ emit: (event: string, payload: any) => sent.push({ room, event, payload }) }),
      sockets: { adapter: { rooms: new Map() } },
    };
  });
  beforeEach(() => {
    sent = [];
  });

  const msgUrl = (channelId: string) => `/api/chat/conversations/${channelId}/messages`;
  const send = (u: U, channelId: string, body: string) =>
    request(t.app).post(msgUrl(channelId)).set(as(u.token)).send({ body });
  const setOverrides = async (channelId: string, overrides: unknown[]) => {
    const { Conversation } = await import("../../models/conversation.js");
    await Conversation.updateOne({ _id: channelId }, { overrides });
  };

  it("members send and read, and every reader (not outsiders) hears about it", async () => {
    const [a, b, outsider] = [await createUser(), await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    const [general] = await channels(community._id, a);

    const res = await send(b, general._id, "hello channel");
    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatchObject({ seq: 1, from: id(b), body: "hello channel" });
    expect(
      sent
        .filter((e) => e.event === "chat:message")
        .map((e) => e.room)
        .sort(),
    ).toEqual([`user:${id(a)}`, `user:${id(b)}`].sort());

    const page = await request(t.app).get(msgUrl(general._id)).set(as(a.token));
    expect(page.body.data.messages.map((m: any) => m.body)).toEqual(["hello channel"]);
    expect((await request(t.app).get(msgUrl(general._id)).set(as(outsider.token))).status).toBe(404);
    expect((await send(outsider, general._id, "let me in")).status).toBe(404);
  });

  it("the sender has read their own message; others have it unread until they read", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    const [general] = await channels(community._id, a);
    await send(b, general._id, "one");
    await send(b, general._id, "two");

    expect((await channels(community._id, b))[0].unread).toBe(0);
    expect((await channels(community._id, a))[0].unread).toBe(2);
    sent = [];
    const read = await request(t.app)
      .post(`/api/chat/conversations/${general._id}/read`)
      .set(as(a.token))
      .send({ seq: 2 });
    expect(read.status).toBe(200);
    expect((await channels(community._id, a))[0].unread).toBe(0);
    // Reading is private to the reader's own tabs.
    expect(sent.filter((e) => e.event === "chat:read").map((e) => e.room)).toEqual([`user:${id(a)}`]);
  });

  it("muting a channel is your own setting", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    const [general] = await channels(community._id, a);
    const mute = (u: U, muted: boolean) =>
      request(t.app).patch(`/api/chat/conversations/${general._id}/me`).set(as(u.token)).send({ muted });
    expect((await mute(b, true)).status).toBe(200);
    expect((await channels(community._id, b))[0].muted).toBe(true);
    expect((await channels(community._id, a))[0].muted).toBe(false);
    expect((await mute(b, false)).status).toBe(200);
    expect((await channels(community._id, b))[0].muted).toBe(false);
  });

  it("a read-only channel lets people read but not post or react", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    const [general] = await channels(community._id, a);
    const first = await send(a, general._id, "announcement");
    const everyone = community.roles.find((r: any) => r.everyone)._id;
    await setOverrides(general._id, [{ roleId: everyone, allow: [], deny: ["sendMessages"] }]);

    expect((await request(t.app).get(msgUrl(general._id)).set(as(b.token))).status).toBe(200);
    expect((await send(b, general._id, "hi")).status).toBe(403);
    const react = await request(t.app)
      .put(`${msgUrl(general._id)}/${first.body.data.message.seq}/reactions/${encodeURIComponent("👍")}`)
      .set(as(b.token));
    expect(react.status).toBe(403);
    // The owner is never held back by an override.
    expect((await send(a, general._id, "more")).status).toBe(200);
  });

  it("a private channel is a 404 for people who can't read it, and they hear nothing from it", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    const secret = (await addChannel(community._id, a, { name: "staff" })).body.data.channel;
    const everyone = community.roles.find((r: any) => r.everyone)._id;
    await setOverrides(secret._id, [{ roleId: everyone, allow: [], deny: ["readMessages"] }]);

    expect((await send(b, secret._id, "hi")).status).toBe(404);
    expect((await request(t.app).get(msgUrl(secret._id)).set(as(b.token))).status).toBe(404);
    sent = [];
    expect((await send(a, secret._id, "secret")).status).toBe(200);
    expect(sent.filter((e) => e.event === "chat:message").map((e) => e.room)).toEqual([`user:${id(a)}`]);
  });

  it("editing is for the author; deleting is for the author or someone who manages messages", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    await addMember(community._id, c);
    const [general] = await channels(community._id, a);
    const { Community } = await import("../../models/community.js");
    const mod = await Community.findById(community._id).exec();
    mod!.roles.push({ name: "mod", position: 1, permissions: ["manageMessages"] } as any);
    const modRole = String(mod!.roles[mod!.roles.length - 1]!._id);
    await mod!.save();
    await Community.updateOne(
      { _id: community._id, "members.user_id": id(c) },
      { $set: { "members.$.roleIds": [modRole] } },
    );

    const m1 = (await send(b, general._id, "mine")).body.data.message;
    const url = `${msgUrl(general._id)}/${m1.seq}`;
    expect((await request(t.app).patch(url).set(as(c.token)).send({ body: "edited" })).status).toBe(403);
    expect((await request(t.app).patch(url).set(as(b.token)).send({ body: "edited" })).status).toBe(200);

    const m2 = (await send(b, general._id, "bad")).body.data.message;
    const other = await createUser();
    await addMember(community._id, other);
    expect(
      (
        await request(t.app)
          .delete(`${msgUrl(general._id)}/${m2.seq}`)
          .set(as(other.token))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(t.app)
          .delete(`${msgUrl(general._id)}/${m2.seq}`)
          .set(as(c.token))
      ).status,
    ).toBe(200);
    // The community owner can delete anyone's too.
    const m3 = (await send(b, general._id, "worse")).body.data.message;
    expect(
      (
        await request(t.app)
          .delete(`${msgUrl(general._id)}/${m3.seq}`)
          .set(as(a.token))
      ).status,
    ).toBe(200);
  });

  it("typing in a channel reaches the other readers, and only from someone who can post", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    await addMember(community._id, c);
    const [general] = await channels(community._id, a);

    let connection: (socket: any) => void = () => undefined;
    const io = {
      use: () => undefined,
      on: (event: string, handler: (socket: any) => void) => {
        if (event === "connection") connection = handler;
      },
      to: (room: string) => ({ emit: (event: string, payload: any) => sent.push({ room, event, payload }) }),
      sockets: { adapter: { rooms: new Map() } },
    };
    const { SocketManager } = await import("../../infrastructure/SocketManager.js");
    const manager = SocketManager.getInstance() as any;
    manager.isInitialized = false;
    await manager.initialize(io);
    const typing = (u: U) => {
      const handlers: Record<string, (data: unknown) => Promise<void>> = {};
      connection({
        id: `socket-${id(u)}`,
        userId: id(u),
        username: "someone",
        join: () => undefined,
        on: (event: string, handler: any) => (handlers[event] = handler),
        disconnect: () => undefined,
      });
      return (data: unknown) => handlers["chat:typing"]!(data);
    };

    await typing(b)({ conversationId: general._id, typing: true });
    expect(
      sent
        .filter((e) => e.event === "chat:typing")
        .map((e) => e.room)
        .sort(),
    ).toEqual([`user:${id(a)}`, `user:${id(c)}`].sort());

    // Closed to posting: no typing from them. Closed to reading: they can't say it and don't hear it.
    sent = [];
    const everyone = community.roles.find((r: any) => r.everyone)._id;
    await setOverrides(general._id, [{ roleId: everyone, allow: [], deny: ["sendMessages"] }]);
    await typing(b)({ conversationId: general._id, typing: true });
    expect(sent.filter((e) => e.event === "chat:typing")).toEqual([]);
    await typing(a)({ conversationId: general._id, typing: true });
    expect(sent.filter((e) => e.event === "chat:typing").length).toBe(2);
  });

  it("only readers are counted as the audience, so removed people stop hearing", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    const [general] = await channels(community._id, a);
    const { resolveChatAccess, audienceOf } = await import("../../chat/access.js");
    const context = (await resolveChatAccess(general._id, id(a)))!;
    expect(audienceOf(context).sort()).toEqual([id(a), id(b)].sort());
    expect(await resolveChatAccess(general._id, id(await createUser()))).toBeNull();
  });
});

describe("the community list", () => {
  it("says how many channels have something unread, for each community", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = await make(a);
    await addMember(community._id, b);
    const [general] = await channels(community._id, a);
    const list = async (u: U) =>
      (await request(t.app).get("/api/communities").set(as(u.token))).body.data.communities as any[];
    expect((await list(b))[0].unreadChannels).toBe(0);
    await post(general._id, 2);
    expect((await list(b))[0].unreadChannels).toBe(1);
    const detail = await request(t.app).get(`/api/communities/${community._id}`).set(as(b.token));
    expect(detail.body.data.community.unreadChannels).toBe(1);
    const { ChannelState } = await import("../../models/channelState.js");
    await ChannelState.create({ userId: id(b), conversationId: general._id, lastReadSeq: 2 });
    expect((await list(b))[0].unreadChannels).toBe(0);
  });
});

describe("deleting a community", () => {
  it("deletes its channels and their messages and read state", async () => {
    const a = await createUser();
    const community = await make(a);
    const [general] = await channels(community._id, a);
    const { Message } = await import("../../models/message.js");
    const { Conversation } = await import("../../models/conversation.js");
    const { ChannelState } = await import("../../models/channelState.js");
    await Message.create({ conversationId: general._id, seq: 1, from: id(a), body: "hi" });
    await ChannelState.create({ userId: id(a), conversationId: general._id, lastReadSeq: 1 });

    expect((await request(t.app).delete(`/api/communities/${community._id}`).set(as(a.token))).status).toBe(200);
    expect(await Conversation.countDocuments({ communityId: community._id })).toBe(0);
    expect(await Message.countDocuments({ conversationId: general._id })).toBe(0);
    expect(await ChannelState.countDocuments({ conversationId: general._id })).toBe(0);
  });
});
