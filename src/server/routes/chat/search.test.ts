import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("../communities/index.js"), () => import("./index.js")]);
  const { Message } = await import("../../models/message.js");
  await Message.init(); // the text index must exist before the first search
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const id = (u: U) => String(u.user._id);

const send = async (who: U, chatId: string, body: string, extra: Record<string, unknown> = {}) =>
  (
    await request(t.app)
      .post(`/api/chat/conversations/${chatId}/messages`)
      .set(as(who))
      .send({ body, ...extra })
  ).body.data.message;
const search = (who: U, query: Record<string, string | number>) =>
  request(t.app).get("/api/chat/search").set(as(who)).query(query);
const bodies = (res: request.Response) => (res.body.data.results as any[]).map((r) => r.message.body);

const dm = async (me: U, other: U) =>
  (
    await request(t.app)
      .post("/api/chat/conversations")
      .set(as(me))
      .send({ userIds: [id(other)] })
  ).body.data.conversation._id as string;

const makeCommunity = async (owner: U, members: U[]) => {
  const c = (await request(t.app).post("/api/communities").set(as(owner)).send({ name: "Crew" })).body.data.community;
  const { Community } = await import("../../models/community.js");
  for (const m of members)
    await Community.updateOne({ _id: c._id }, { $push: { members: { user_id: id(m), role: "member" } } });
  const channels = (await request(t.app).get(`/api/communities/${c._id}/channels`).set(as(owner))).body.data.channels;
  return { community: c, general: channels[0]._id as string };
};

describe("searching messages", () => {
  it("finds words in chats you are in, newest first, and says where", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b);
    await send(a, chat, "the lake house is booked");
    await send(b, chat, "Lake trip packing list");
    await send(a, chat, "something else");
    const res = await search(a, { q: "lake" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(bodies(res)).toEqual(["Lake trip packing list", "the lake house is booked"]);
    expect(res.body.data.results[0]).toMatchObject({ communityId: null, channelName: null });
    expect(res.body.data.people.map((p: any) => p._id ?? p.id)).toContain(id(b));
  });

  it("never returns messages from a chat the caller can't read", async () => {
    const [a, b, outsider] = [await createUser(), await createUser(), await createUser()];
    const chat = await dm(a, b);
    await send(a, chat, "private zebra plans");
    expect(bodies(await search(outsider, { q: "zebra" }))).toEqual([]);
    // Naming the chat or its sender doesn't widen what is searched.
    expect((await search(outsider, { q: "zebra", conversationId: chat })).status).toBe(404);
    expect(bodies(await search(outsider, { q: "zebra", from: id(a) }))).toEqual([]);
    expect(bodies(await search(b, { q: "zebra" }))).toEqual(["private zebra plans"]);
  });

  it("searches community channels you can read, not ones closed to you, and not after you leave", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const { community, general } = await makeCommunity(a, [b]);
    await send(a, general, "picnic on saturday");
    const secret = (
      await request(t.app).post(`/api/communities/${community._id}/channels`).set(as(a)).send({ name: "staff" })
    ).body.data.channel;
    const everyone = community.roles.find((r: any) => r.everyone)._id;
    const { Conversation } = await import("../../models/conversation.js");
    await Conversation.updateOne(
      { _id: secret._id },
      { overrides: [{ roleId: everyone, allow: [], deny: ["readMessages"] }] },
    );
    await send(a, secret._id, "picnic budget is secret");

    expect(bodies(await search(b, { q: "picnic" }))).toEqual(["picnic on saturday"]);
    expect(bodies(await search(a, { q: "picnic" }))).toEqual(["picnic budget is secret", "picnic on saturday"]);
    const res = await search(b, { q: "picnic", communityId: community._id });
    expect(res.body.data.results[0]).toMatchObject({ communityId: community._id, channelName: "general" });
    expect((await search(b, { q: "picnic", conversationId: secret._id })).status).toBe(404);

    const { Community } = await import("../../models/community.js");
    await Community.updateOne({ _id: community._id }, { $pull: { members: { user_id: id(b) } } });
    expect(bodies(await search(b, { q: "picnic" }))).toEqual([]);
    expect((await search(b, { q: "picnic", communityId: community._id })).status).toBe(404);
  });

  it("leaves out deleted messages and system lines", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b);
    const m = await send(a, chat, "oops wrong chat");
    await send(a, chat, "oops again");
    await request(t.app).delete(`/api/chat/conversations/${chat}/messages/${m.seq}`).set(as(a));
    expect(bodies(await search(a, { q: "oops" }))).toEqual(["oops again"]);
  });

  it("filters by sender, by attachment or link, and by date", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b);
    await send(a, chat, "menu from alex");
    await send(b, chat, "menu from sam https://example.com/menu");
    expect(bodies(await search(a, { q: "menu", from: id(b) }))).toEqual(["menu from sam https://example.com/menu"]);
    expect(bodies(await search(a, { q: "menu", has: "link" }))).toEqual(["menu from sam https://example.com/menu"]);
    expect(bodies(await search(a, { has: "link" }))).toEqual(["menu from sam https://example.com/menu"]);
    expect(bodies(await search(a, { from: id(a) }))).toEqual(["menu from alex"]);

    expect(bodies(await search(a, { q: "menu", before: "2000-01-01T00:00:00Z" }))).toEqual([]);
    expect(bodies(await search(a, { q: "menu", after: "2000-01-01T00:00:00Z" }))).toHaveLength(2);
    expect(bodies(await search(a, { q: "menu", after: "2999-01-01T00:00:00Z" }))).toEqual([]);

    const { Message } = await import("../../models/message.js");
    await Message.updateOne(
      { conversationId: chat, seq: 1 },
      { $push: { attachments: { fileId: "507f1f77bcf86cd799439011", name: "a.png", mimeType: "image/png", size: 1 } } },
    );
    expect(bodies(await search(a, { has: "attachment" }))).toEqual(["menu from alex"]);
  });

  it("pages with offset and says when more follow", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await dm(a, b);
    for (let i = 1; i <= 3; i++) await send(a, chat, `paging note ${i}`);
    const first = await search(a, { q: "paging", limit: 2 });
    expect(bodies(first)).toEqual(["paging note 3", "paging note 2"]);
    expect(first.body.data.hasMore).toBe(true);
    const second = await search(a, { q: "paging", limit: 2, offset: 2 });
    expect(bodies(second)).toEqual(["paging note 1"]);
    expect(second.body.data.hasMore).toBe(false);
  });

  it("needs something to look for, and rejects bad input", async () => {
    const a = await createUser();
    expect((await search(a, {})).status).toBe(400);
    expect((await search(a, { q: "x".repeat(101) })).status).toBe(400);
    expect((await search(a, { q: "x", conversationId: "nope" })).status).toBe(400);
    expect((await search(a, { q: "x", before: "yesterday-ish" })).status).toBe(400);
    expect((await search(a, { q: "x", has: "video" })).status).toBe(400);
    expect((await request(t.app).get("/api/chat/search").query({ q: "x" })).status).toBe(401);
  });
});
