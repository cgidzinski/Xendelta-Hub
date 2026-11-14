import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("../communities/index.js"), () => import("./index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const id = (u: U) => String(u.user._id);
const base = (chat: string) => `/api/chat/conversations/${chat}`;
const chat = async (owner: U, others: U[], name?: string) =>
  (
    await request(t.app)
      .post("/api/chat/conversations")
      .set(as(owner))
      .send({ userIds: others.map(id), name })
  ).body.data.conversation._id as string;
const say = async (who: U, c: string, body: string) =>
  (
    await request(t.app)
      .post(`${base(c)}/messages`)
      .set(as(who))
      .send({ body })
  ).body.data.message;
const forward = (who: U, c: string, seq: number, to: string[]) =>
  request(t.app)
    .post(`${base(c)}/messages/${seq}/forward`)
    .set(as(who))
    .send({ toConversationIds: to });
const texts = async (who: U, c: string) =>
  (
    (
      await request(t.app)
        .get(`${base(c)}/messages`)
        .set(as(who))
    ).body.data.messages as any[]
  ).filter((m) => m.kind === "text");

describe("forwarding a message", () => {
  it("copies it into other chats as the forwarder, marked with who first said it, and not naming the source", async () => {
    const [a, b, c] = [await createUser(), await createUser(), await createUser()];
    const source = await chat(a, [b], "Secret plans");
    const target = await chat(b, [c]);
    const m = await say(a, source, "meet at noon");
    const res = await forward(b, source, m.seq, [target]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ sent: [target], skipped: [] });
    const [copy] = await texts(c, target);
    expect(copy).toMatchObject({ body: "meet at noon", from: id(b), forwardedFrom: id(a) });
    expect(JSON.stringify(copy)).not.toContain(source);
    // forwarding the copy still credits the first author
    const third = await chat(c, [a]);
    await forward(c, target, copy.seq, [third]);
    expect((await texts(a, third))[0].forwardedFrom).toBe(id(a));
  });

  it("only reads from chats you can read, and only writes to chats you can post in", async () => {
    const [a, b, outsider] = [await createUser(), await createUser(), await createUser()];
    const source = await chat(a, [b]);
    const mine = await chat(outsider, [a]);
    const others = await chat(a, [b], "Other");
    const m = await say(a, source, "hello");
    expect((await forward(outsider, source, m.seq, [mine])).status).toBe(404);
    const res = await forward(b, source, m.seq, [mine, others]);
    expect(res.body.data).toEqual({ sent: [others], skipped: [mine] });
    expect(await texts(outsider, mine)).toEqual([]);
  });

  it("respects read-only channels", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const community = (await request(t.app).post("/api/communities").set(as(a)).send({ name: "Crew" })).body.data
      .community;
    const { Community } = await import("../../models/community.js");
    await Community.updateOne({ _id: community._id }, { $push: { members: { user_id: id(b), role: "member" } } });
    const [general] = (await request(t.app).get(`/api/communities/${community._id}/channels`).set(as(a))).body.data
      .channels;
    const everyone = community.roles.find((r: any) => r.everyone)._id;
    const { Conversation } = await import("../../models/conversation.js");
    await Conversation.updateOne(
      { _id: general._id },
      { overrides: [{ roleId: everyone, allow: [], deny: ["sendMessages"] }] },
    );
    const own = await chat(b, [a]);
    const m = await say(b, own, "to share");
    expect((await forward(b, own, m.seq, [general._id])).body.data.skipped).toEqual([general._id]);
  });

  it("not deleted, system or poll messages, and validates the targets", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const source = await chat(a, [b], "S");
    const target = await chat(a, [b], "T");
    const m = await say(a, source, "x");
    const system = (
      (
        await request(t.app)
          .get(`${base(source)}/messages`)
          .set(as(a))
      ).body.data.messages as any[]
    ).find((x) => x.kind === "system");
    expect((await forward(a, source, system.seq, [target])).status).toBe(400);
    expect((await forward(a, source, 999, [target])).status).toBe(400);
    expect((await forward(a, source, m.seq, [])).status).toBe(400);
    expect((await forward(a, source, m.seq, [target, target])).status).toBe(400);
    expect((await forward(a, source, m.seq, ["nope"])).status).toBe(400);
    await request(t.app)
      .delete(`${base(source)}/messages/${m.seq}`)
      .set(as(a));
    expect((await forward(a, source, m.seq, [target])).status).toBe(400);
  });
});
