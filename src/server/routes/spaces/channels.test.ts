import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
  const res = await request(t.app).post("/api/spaces").set(as(me.token)).send({ name });
  expect(res.status).toBe(200);
  return res.body.data.space as any;
};
const addMember = async (spaceId: string, who: U) => {
  const { Space } = await import("../../models/space.js");
  await Space.updateOne({ _id: spaceId }, { $push: { members: { user_id: id(who), role: "member" } } }).exec();
};
const channels = async (spaceId: string, me: U) => {
  const res = await request(t.app).get(`/api/spaces/${spaceId}/channels`).set(as(me.token));
  expect(res.status).toBe(200);
  return res.body.data.channels as any[];
};
const addChannel = async (spaceId: string, me: U, body: Record<string, unknown>) =>
  request(t.app).post(`/api/spaces/${spaceId}/channels`).set(as(me.token)).send(body);
/** Pretend someone posted: the posting itself arrives with #309. */
const post = async (channelId: string, seq: number) => {
  const { Conversation } = await import("../../models/conversation.js");
  await Conversation.updateOne(
    { _id: channelId },
    { seq, lastMessage: { seq, from: "x", preview: "hi", at: new Date() } },
  );
};

describe("channels of a space", () => {
  it("a new space starts with a general channel", async () => {
    const a = await createUser();
    const space = await make(a);
    const list = await channels(space._id, a);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      name: "general",
      spaceId: space._id,
      position: 0,
      category: "",
      topic: "",
      unread: 0,
    });
  });

  it("needs manage channels to add one, and puts it at the end", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    expect((await addChannel(space._id, b, { name: "mine" })).status).toBe(403);
    const res = await addChannel(space._id, a, { name: "  random ", topic: "anything", category: "Chat" });
    expect(res.status).toBe(200);
    expect(res.body.data.channel).toMatchObject({ name: "random", topic: "anything", category: "Chat", position: 1 });
    expect((await channels(space._id, b)).map((c) => c.name)).toEqual(["general", "random"]);
  });

  it("a non-member can't list or add, and bad input is refused", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    expect((await request(t.app).get(`/api/spaces/${space._id}/channels`).set(as(b.token))).status).toBe(404);
    expect((await addChannel(space._id, b, { name: "x" })).status).toBe(404);
    expect((await addChannel(space._id, a, { name: " " })).status).toBe(400);
    expect((await addChannel(space._id, a, { name: "x".repeat(51) })).status).toBe(400);
  });

  it("renames, sets the topic and moves to a category", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    const [general] = await channels(space._id, a);
    const url = `/api/spaces/${space._id}/channels/${general._id}`;
    expect((await request(t.app).patch(url).set(as(b.token)).send({ name: "no" })).status).toBe(403);
    expect((await request(t.app).patch(url).set(as(a.token)).send({})).status).toBe(400);
    const res = await request(t.app).patch(url).set(as(a.token)).send({ name: "lobby", topic: "Hi", category: "Info" });
    expect(res.body.data.channel).toMatchObject({ name: "lobby", topic: "Hi", category: "Info" });
  });

  it("reorders, and must be told about every channel once", async () => {
    const a = await createUser();
    const space = await make(a);
    await addChannel(space._id, a, { name: "two" });
    await addChannel(space._id, a, { name: "three" });
    const [one, two, three] = await channels(space._id, a);
    const url = `/api/spaces/${space._id}/channels/order`;
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

  it("deletes a channel, but a space keeps at least one", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    const extra = (await addChannel(space._id, a, { name: "extra" })).body.data.channel;
    const [general] = await channels(space._id, a);
    expect(
      (await request(t.app).delete(`/api/spaces/${space._id}/channels/${extra._id}`).set(as(b.token))).status,
    ).toBe(403);
    expect(
      (await request(t.app).delete(`/api/spaces/${space._id}/channels/${extra._id}`).set(as(a.token))).status,
    ).toBe(200);
    expect(
      (await request(t.app).delete(`/api/spaces/${space._id}/channels/${general._id}`).set(as(a.token))).status,
    ).toBe(400);
    expect((await channels(space._id, a)).map((c) => c.name)).toEqual(["general"]);
  });

  it("a channel of another space is a 404, whatever the id", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const mine = await make(a, "Mine");
    const theirs = await make(b, "Theirs");
    const [theirChannel] = await channels(theirs._id, b);
    const res = await request(t.app)
      .patch(`/api/spaces/${mine._id}/channels/${theirChannel._id}`)
      .set(as(a.token))
      .send({ name: "x" });
    expect(res.status).toBe(404);
  });
});

describe("who can see a channel", () => {
  it("a channel closed to everyone is hidden from members, and answers 404 to them", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    const secret = (await addChannel(space._id, a, { name: "staff" })).body.data.channel;
    const everyone = space.roles.find((r: any) => r.everyone)._id;
    const { Conversation } = await import("../../models/conversation.js");
    await Conversation.updateOne(
      { _id: secret._id },
      { overrides: [{ roleId: everyone, allow: [], deny: ["readMessages"] }] },
    );

    expect((await channels(space._id, b)).map((c) => c.name)).toEqual(["general"]);
    expect((await channels(space._id, a)).map((c) => c.name)).toEqual(["general", "staff"]);
    expect(
      (await request(t.app).delete(`/api/spaces/${space._id}/channels/${secret._id}`).set(as(b.token))).status,
    ).toBe(404);
  });
});

describe("unread", () => {
  it("counts a channel with unread messages for each person, and not a muted one", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const space = await make(a);
    await addMember(space._id, b);
    const [general] = await channels(space._id, a);
    const unread = async (u: U) => (await request(t.app).get("/api/chat/unread").set(as(u.token))).body.data.count;

    expect(await unread(b)).toBe(0);
    await post(general._id, 3);
    expect(await unread(b)).toBe(1);
    expect((await channels(space._id, b))[0].unread).toBe(3);

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
    expect((await channels(space._id, b))[0]).toMatchObject({ unread: 3, muted: true });
  });

  it("a channel never shows up in the chat list or through the chat routes", async () => {
    const a = await createUser();
    const space = await make(a);
    const [general] = await channels(space._id, a);
    const list = await request(t.app).get("/api/chat/conversations").set(as(a.token));
    expect(list.body.data.conversations).toEqual([]);
    expect((await request(t.app).get(`/api/chat/conversations/${general._id}/messages`).set(as(a.token))).status).toBe(
      404,
    );
  });
});

describe("deleting a space", () => {
  it("deletes its channels and their messages and read state", async () => {
    const a = await createUser();
    const space = await make(a);
    const [general] = await channels(space._id, a);
    const { Message } = await import("../../models/message.js");
    const { Conversation } = await import("../../models/conversation.js");
    const { ChannelState } = await import("../../models/channelState.js");
    await Message.create({ conversationId: general._id, seq: 1, from: id(a), body: "hi" });
    await ChannelState.create({ userId: id(a), conversationId: general._id, lastReadSeq: 1 });

    expect((await request(t.app).delete(`/api/spaces/${space._id}`).set(as(a.token))).status).toBe(200);
    expect(await Conversation.countDocuments({ spaceId: space._id })).toBe(0);
    expect(await Message.countDocuments({ conversationId: general._id })).toBe(0);
    expect(await ChannelState.countDocuments({ conversationId: general._id })).toBe(0);
  });
});
