import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

const { pushes } = vi.hoisted(() => ({ pushes: [] as Array<{ userId: string; title: string }> }));
vi.mock("../../utils/pushUtils", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  sendPushToUser: vi.fn(async (userId: string, payload: { title: string }) => {
    pushes.push({ userId, title: payload.title });
    return { sent: 1, pruned: 0 };
  }),
}));

let t: TestApp;
let events: Array<{ room: string; event: string; payload: any }> = [];
beforeAll(async () => {
  t = await startTestApp([() => import("../communities/index.js"), () => import("./index.js")]);
  const { SocketManager } = await import("../../infrastructure/SocketManager.js");
  (SocketManager.getInstance() as any).io = {
    to: (room: string) => ({ emit: (event: string, payload: any) => events.push({ room, event, payload }) }),
    sockets: { adapter: { rooms: new Map() } },
  };
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  pushes.length = 0;
  events = [];
});

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const id = (u: U) => String(u.user._id);
const base = (chatId: string) => `/api/chat/conversations/${chatId}`;

const group = async (owner: U, others: U[]) =>
  (
    await request(t.app)
      .post("/api/chat/conversations")
      .set(as(owner))
      .send({ userIds: others.map(id), name: "Trip" })
  ).body.data.conversation._id as string;
const send = async (who: U, chatId: string, body: string, extra: Record<string, unknown> = {}) =>
  (
    await request(t.app)
      .post(`${base(chatId)}/messages`)
      .set(as(who))
      .send({ body, ...extra })
  ).body.data.message;
const history = async (who: U, chatId: string) =>
  (
    await request(t.app)
      .get(`${base(chatId)}/messages`)
      .set(as(who))
  ).body.data.messages as any[];
const thread = (who: U, chatId: string, seq: number) =>
  request(t.app)
    .get(`${base(chatId)}/messages/${seq}/thread`)
    .set(as(who));

describe("replying in a thread", () => {
  it("keeps replies out of the main history, and counts them on the first message", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const chat = await group(a, [b, c]);
    const root = await send(a, chat, "Where should we eat?");
    await send(b, chat, "unrelated chatter");
    const r1 = await send(b, chat, "Thai?", { threadRoot: root.seq });
    expect(r1).toMatchObject({ threadRoot: root.seq });
    await send(c, chat, "Pizza", { threadRoot: root.seq });

    const main = await history(a, chat);
    expect(main.filter((m) => m.kind === "text").map((m) => m.body)).toEqual([
      "unrelated chatter",
      "Where should we eat?",
    ]);
    const shown = main.find((m) => m.seq === root.seq);
    expect(shown.thread).toMatchObject({ count: 2, lastBy: id(c) });

    const res = await thread(c, chat, root.seq);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.root.body).toBe("Where should we eat?");
    expect(res.body.data.replies.map((m: any) => m.body)).toEqual(["Thai?", "Pizza"]);
    expect(res.body.data.hasMore).toBe(false);
  });

  it("tells the chat live: the reply, and the first message's new count", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const root = await send(a, chat, "Question");
    events = [];
    await send(b, chat, "Answer", { threadRoot: root.seq });
    const toA = events.filter((e) => e.room === `user:${id(a)}`);
    expect(toA.find((e) => e.event === "chat:message")?.payload.message).toMatchObject({ threadRoot: root.seq });
    const update = toA.find((e) => e.event === "chat:message_update");
    expect(update?.payload.message).toMatchObject({ seq: root.seq, thread: { count: 1, lastBy: id(b) } });
  });

  it("only works on a real first message that is not itself a reply", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const root = await send(a, chat, "Root");
    const reply = await send(b, chat, "Reply", { threadRoot: root.seq });
    const post = (threadRoot: number) =>
      request(t.app)
        .post(`${base(chat)}/messages`)
        .set(as(a))
        .send({ body: "x", threadRoot });
    expect((await post(999)).status).toBe(400);
    expect((await post(reply.seq)).status).toBe(400);
    const system = (await history(a, chat)).find((m) => m.kind === "system");
    expect((await post(system.seq)).status).toBe(400);
    await request(t.app)
      .delete(`${base(chat)}/messages/${root.seq}`)
      .set(as(a));
    expect((await post(root.seq)).status).toBe(400);
    expect((await thread(a, chat, root.seq)).status).toBe(404);
  });

  it("a deleted reply stops counting", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const root = await send(a, chat, "Root");
    const r1 = await send(b, chat, "one", { threadRoot: root.seq });
    await send(b, chat, "two", { threadRoot: root.seq });
    await request(t.app)
      .delete(`${base(chat)}/messages/${r1.seq}`)
      .set(as(b));
    expect((await history(a, chat)).find((m) => m.seq === root.seq).thread.count).toBe(1);
  });
});

describe("who can see a thread", () => {
  it("a thread belongs to its chat: people outside it can't read, follow or reply", async () => {
    const [a, b, outsider] = [await createUser(), await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const root = await send(a, chat, "Private plans");
    await send(b, chat, "yes", { threadRoot: root.seq });
    expect((await thread(outsider, chat, root.seq)).status).toBe(404);
    expect(
      (
        await request(t.app)
          .get(`${base(chat)}/threads`)
          .set(as(outsider))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(t.app)
          .put(`${base(chat)}/messages/${root.seq}/thread/follow`)
          .set(as(outsider))
      ).status,
    ).toBe(404);
    const post = await request(t.app)
      .post(`${base(chat)}/messages`)
      .set(as(outsider))
      .send({ body: "hi", threadRoot: root.seq });
    expect(post.status).toBe(404);
  });

  it("follows the channel's permissions: a thread in a channel closed to someone is closed to them", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = (await request(t.app).post("/api/communities").set(as(a)).send({ name: "Crew" })).body.data
      .community;
    const { Community } = await import("../../models/community.js");
    await Community.updateOne({ _id: community._id }, { $push: { members: { user_id: id(b), role: "member" } } });
    const secret = (
      await request(t.app).post(`/api/communities/${community._id}/channels`).set(as(a)).send({ name: "staff" })
    ).body.data.channel;
    const everyone = community.roles.find((r: any) => r.everyone)._id;
    const { Conversation } = await import("../../models/conversation.js");
    await Conversation.updateOne(
      { _id: secret._id },
      { overrides: [{ roleId: everyone, allow: [], deny: ["readMessages"] }] },
    );
    const root = await send(a, secret._id, "staff only");
    await send(a, secret._id, "more", { threadRoot: root.seq });
    expect((await thread(b, secret._id, root.seq)).status).toBe(404);
    expect((await thread(a, secret._id, root.seq)).status).toBe(200);
    // a read-only channel: readers can read the thread but not reply
    await Conversation.updateOne(
      { _id: secret._id },
      { overrides: [{ roleId: everyone, allow: ["readMessages"], deny: ["sendMessages"] }] },
    );
    expect((await thread(b, secret._id, root.seq)).status).toBe(200);
    const reply = await request(t.app)
      .post(`${base(secret._id)}/messages`)
      .set(as(b))
      .send({ body: "can I?", threadRoot: root.seq });
    expect(reply.status).toBe(403);
  });
});

describe("following", () => {
  it("the replier and the author of the first message follow; push goes to followers and the named only", async () => {
    const [a, b, c, d] = [await createUser(), await createUser(), await createUser(), await createUser()];
    const chat = await group(a, [b, c, d]);
    const root = await send(a, chat, "Dinner?");
    pushes.length = 0;
    await send(b, chat, "Thai", { threadRoot: root.seq });
    const state = async (who: U) => (await thread(who, chat, root.seq)).body.data.following;
    expect([await state(a), await state(b), await state(c)]).toEqual([true, true, false]);
    // Pushes (offline in tests) went to the author of the first message, not to c or d.
    expect(pushes.map((p) => p.userId).sort()).toEqual([id(a)].sort());
    expect(pushes[0].title).toContain("(thread)");

    pushes.length = 0;
    await send(a, chat, `what about <@${id(d)}>`, { threadRoot: root.seq });
    expect(pushes.map((p) => p.userId).sort()).toEqual([id(b), id(d)].sort());
  });

  it("anyone who can read it can follow and unfollow", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const root = await send(a, chat, "Root");
    await send(a, chat, "first", { threadRoot: root.seq });
    const url = `${base(chat)}/messages/${root.seq}/thread/follow`;
    expect((await request(t.app).put(url).set(as(b))).body.data.following).toBe(true);
    expect((await thread(b, chat, root.seq)).body.data.following).toBe(true);
    expect((await request(t.app).delete(url).set(as(b))).body.data.following).toBe(false);
    expect((await thread(b, chat, root.seq)).body.data.following).toBe(false);
  });
});

describe("the threads of a chat", () => {
  it("lists them most recently active first, leaving out messages with no replies and deleted ones", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const first = await send(a, chat, "first topic");
    const second = await send(a, chat, "second topic");
    await send(a, chat, "no replies here");
    const gone = await send(a, chat, "removed topic");
    await send(b, chat, "r", { threadRoot: first.seq });
    await send(b, chat, "r", { threadRoot: gone.seq });
    await send(b, chat, "r", { threadRoot: second.seq });
    await request(t.app)
      .delete(`${base(chat)}/messages/${gone.seq}`)
      .set(as(a));
    const res = await request(t.app)
      .get(`${base(chat)}/threads`)
      .set(as(b));
    expect(res.status).toBe(200);
    expect(res.body.data.threads.map((m: any) => m.body)).toEqual(["second topic", "first topic"]);
    await send(b, chat, "again", { threadRoot: first.seq });
    expect(
      (
        await request(t.app)
          .get(`${base(chat)}/threads`)
          .set(as(b))
      ).body.data.threads.map((m: any) => m.body),
    ).toEqual(["first topic", "second topic"]);
  });
});
