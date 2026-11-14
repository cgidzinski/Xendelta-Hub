import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

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
  events = [];
});

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const id = (u: U) => String(u.user._id);
const base = (chat: string) => `/api/chat/conversations/${chat}`;
const group = async (owner: U, others: U[]) =>
  (
    await request(t.app)
      .post("/api/chat/conversations")
      .set(as(owner))
      .send({ userIds: others.map(id), name: "Trip" })
  ).body.data.conversation._id as string;
const poll = (who: U, chat: string, body: Record<string, unknown>) =>
  request(t.app)
    .post(`${base(chat)}/polls`)
    .set(as(who))
    .send(body);
const vote = (who: U, chat: string, seq: number, optionIds: string[]) =>
  request(t.app)
    .put(`${base(chat)}/messages/${seq}/poll/vote`)
    .set(as(who))
    .send({ optionIds });
const make = async (a: U, chat: string, extra: Record<string, unknown> = {}) =>
  (await poll(a, chat, { question: "Where to eat?", options: ["Thai", "Pizza", "Tacos"], ...extra })).body.data.message;

describe("creating a poll", () => {
  it("is a message of kind poll: the question, the options, and nobody has voted", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const res = await poll(a, chat, { question: "  Where to eat? ", options: ["Thai", "Pizza"] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.message).toMatchObject({
      kind: "poll",
      body: "Where to eat?",
      from: id(a),
      poll: {
        question: "Where to eat?",
        multiple: false,
        endsAt: null,
        closedAt: null,
        options: [
          { id: "0", text: "Thai", userIds: [] },
          { id: "1", text: "Pizza", userIds: [] },
        ],
      },
    });
    const list = (await request(t.app).get("/api/chat/conversations").set(as(b))).body.data.conversations;
    expect(list[0].lastMessage.preview).toBe("Poll: Where to eat?");
    expect(events.some((e) => e.event === "chat:message" && e.room === `user:${id(b)}`)).toBe(true);
  });

  it("needs a question and 2 to 10 different options, and an end time that makes sense", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const bad = async (body: Record<string, unknown>) => expect((await poll(a, chat, body)).status).toBe(400);
    await bad({ question: "", options: ["a", "b"] });
    await bad({ question: "q", options: ["only one"] });
    await bad({ question: "q", options: Array.from({ length: 11 }, (_, i) => `o${i}`) });
    await bad({ question: "q", options: ["same", "Same"] });
    await bad({ question: "q", options: ["a", ""] });
    await bad({ question: "q", options: ["a", "b"], endsAt: "2001-01-01T00:00:00Z" });
    await bad({ question: "q", options: ["a", "b"], endsAt: new Date(Date.now() + 40 * 86_400_000).toISOString() });
    expect(
      (
        await poll(a, chat, {
          question: "q",
          options: ["a", "b"],
          endsAt: new Date(Date.now() + 3_600_000).toISOString(),
        })
      ).status,
    ).toBe(200);
  });

  it("only those who can post can start one", async () => {
    const [a, b, outsider] = [await createUser(), await createUser(), await createUser()];
    const chat = await group(a, [b]);
    expect((await poll(outsider, chat, { question: "q", options: ["a", "b"] })).status).toBe(404);
  });
});

describe("voting", () => {
  it("one vote per person on a single-choice poll: a new choice replaces the old", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const p = await make(a, chat);
    const first = await vote(b, chat, p.seq, ["1"]);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data.message.poll.options.map((o: any) => o.userIds)).toEqual([[], [id(b)], []]);
    const second = await vote(b, chat, p.seq, ["2"]);
    expect(second.body.data.message.poll.options.map((o: any) => o.userIds)).toEqual([[], [], [id(b)]]);
    expect((await vote(b, chat, p.seq, ["0", "1"])).status).toBe(400);
  });

  it("a multiple-choice poll takes several options, and an empty list takes the vote back", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const p = await make(a, chat, { multiple: true });
    await vote(a, chat, p.seq, ["0"]);
    const res = await vote(b, chat, p.seq, ["0", "2", "2"]);
    expect(res.body.data.message.poll.options.map((o: any) => o.userIds)).toEqual([[id(a), id(b)], [], [id(b)]]);
    const withdrawn = await vote(b, chat, p.seq, []);
    expect(withdrawn.body.data.message.poll.options.map((o: any) => o.userIds)).toEqual([[id(a)], [], []]);
  });

  it("tells the chat live", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const p = await make(a, chat);
    events = [];
    await vote(b, chat, p.seq, ["0"]);
    const update = events.find((e) => e.event === "chat:message_update" && e.room === `user:${id(a)}`);
    expect(update?.payload.message.poll.options[0].userIds).toEqual([id(b)]);
  });

  it("rejects options that aren't in the poll, and things that aren't polls", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const p = await make(a, chat);
    expect((await vote(b, chat, p.seq, ["7"])).status).toBe(400);
    expect((await vote(b, chat, p.seq, ["x"])).status).toBe(400);
    const text = (
      await request(t.app)
        .post(`${base(chat)}/messages`)
        .set(as(a))
        .send({ body: "hi" })
    ).body.data.message;
    expect((await vote(b, chat, text.seq, ["0"])).status).toBe(404);
    expect((await vote(b, chat, 999, ["0"])).status).toBe(404);
  });

  it("only people in the chat can vote", async () => {
    const [a, b, outsider] = [await createUser(), await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const p = await make(a, chat);
    expect((await vote(outsider, chat, p.seq, ["0"])).status).toBe(404);
  });

  it("follows the channel's rules: readers who can't post can't vote", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = (await request(t.app).post("/api/communities").set(as(a)).send({ name: "Crew" })).body.data
      .community;
    const { Community } = await import("../../models/community.js");
    await Community.updateOne({ _id: community._id }, { $push: { members: { user_id: id(b), role: "member" } } });
    const [general] = (await request(t.app).get(`/api/communities/${community._id}/channels`).set(as(a))).body.data
      .channels;
    const p = await make(a, general._id);
    expect((await vote(b, general._id, p.seq, ["0"])).status).toBe(200);
    const everyone = community.roles.find((r: any) => r.everyone)._id;
    const { Conversation } = await import("../../models/conversation.js");
    await Conversation.updateOne(
      { _id: general._id },
      { overrides: [{ roleId: everyone, allow: [], deny: ["sendMessages"] }] },
    );
    expect((await vote(b, general._id, p.seq, ["1"])).status).toBe(403);
    expect((await poll(b, general._id, { question: "q", options: ["a", "b"] })).status).toBe(403);
  });
});

describe("closing", () => {
  it("no votes after the end time", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const p = await make(a, chat, { endsAt: new Date(Date.now() + 3_600_000).toISOString() });
    expect((await vote(b, chat, p.seq, ["0"])).status).toBe(200);
    const { Message } = await import("../../models/message.js");
    await Message.updateOne({ _id: p._id }, { "poll.endsAt": new Date(Date.now() - 1000) });
    expect((await vote(b, chat, p.seq, ["1"])).status).toBe(409);
  });

  it("the creator closes it early, after which nobody can vote; others can't close it", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const p = await make(b, chat);
    const close = (who: U) =>
      request(t.app)
        .post(`${base(chat)}/messages/${p.seq}/poll/close`)
        .set(as(who));
    await vote(a, chat, p.seq, ["0"]);
    // a is the chat's owner and may close anyone's poll; make a plain third member to show others can't
    const c = await createUser();
    await request(t.app)
      .post(`${base(chat)}/members`)
      .set(as(a))
      .send({ userIds: [id(c)] });
    expect((await close(c)).status).toBe(403);
    events = [];
    const res = await close(b);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.message.poll.closedAt).toBeTruthy();
    expect(events.some((e) => e.event === "chat:message_update")).toBe(true);
    expect((await vote(a, chat, p.seq, ["1"])).status).toBe(409);
    // the votes stay
    expect(res.body.data.message.poll.options[0].userIds).toEqual([id(a)]);
  });
});

describe("deleting", () => {
  it("the creator can delete a poll, which clears it", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await group(a, [b]);
    const p = await make(b, chat);
    const del = await request(t.app)
      .delete(`${base(chat)}/messages/${p.seq}`)
      .set(as(b));
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    expect(del.body.data.message.poll).toBeNull();
    expect((await vote(a, chat, p.seq, ["0"])).status).toBe(404);
  });
});
