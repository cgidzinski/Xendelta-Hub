import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";
import { CHAT_MAX_PINS } from "@shared/chat";

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

const setup = async () => {
  const [a, b, outsider] = [await createUser(), await createUser(), await createUser()];
  const community = (await request(t.app).post("/api/communities").set(as(a)).send({ name: "Crew" })).body.data
    .community;
  const { Community } = await import("../../models/community.js");
  await Community.updateOne({ _id: community._id }, { $push: { members: { user_id: id(b), role: "member" } } });
  const [general] = (await request(t.app).get(`/api/communities/${community._id}/channels`).set(as(a))).body.data
    .channels;
  return { a, b, outsider, community, channelId: general._id as string };
};
const base = (chatId: string) => `/api/chat/conversations/${chatId}`;
const send = async (who: U, chatId: string, body: string) =>
  (
    await request(t.app)
      .post(`${base(chatId)}/messages`)
      .set(as(who))
      .send({ body })
  ).body.data.message;
const pin = (who: U, chatId: string, seq: number) =>
  request(t.app)
    .put(`${base(chatId)}/messages/${seq}/pin`)
    .set(as(who));
const unpin = (who: U, chatId: string, seq: number) =>
  request(t.app)
    .delete(`${base(chatId)}/messages/${seq}/pin`)
    .set(as(who));
const pins = async (who: U, chatId: string) =>
  (
    await request(t.app)
      .get(`${base(chatId)}/pins`)
      .set(as(who))
  ).body.data.messages as any[];
const history = async (who: U, chatId: string) =>
  (
    await request(t.app)
      .get(`${base(chatId)}/messages`)
      .set(as(who))
  ).body.data.messages as any[];

describe("pinning in a community", () => {
  it("the owner pins a message, everyone sees it pinned, and a line says so", async () => {
    const { a, b, channelId } = await setup();
    const m = await send(b, channelId, "the schedule");
    const res = await pin(a, channelId, m.seq);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.message).toMatchObject({ pinnedBy: id(a) });
    expect(res.body.data.message.pinnedAt).toBeTruthy();
    expect((await pins(b, channelId)).map((p) => p.body)).toEqual(["the schedule"]);
    const lines = (await history(b, channelId)).filter((x) => x.kind === "system");
    expect(lines.map((x) => x.body)).toEqual([`${a.user.username} pinned a message`]);
    expect(lines[0].system).toMatchObject({ event: "pinned", userIds: [id(a)] });
  });

  it("needs the pin permission, which a role can give", async () => {
    const { a, b, community, channelId } = await setup();
    const m = await send(a, channelId, "pin me");
    expect((await pin(b, channelId, m.seq)).status).toBe(403);
    expect((await unpin(b, channelId, m.seq)).status).toBe(403);
    const role = await request(t.app)
      .post(`/api/communities/${community._id}/roles`)
      .set(as(a))
      .send({ name: "pinner", permissions: ["pinMessages"] });
    const roleId = role.body.data.community.roles.find((r: any) => r.name === "pinner")._id;
    await request(t.app)
      .put(`/api/communities/${community._id}/members/${id(b)}/roles`)
      .set(as(a))
      .send({ roleIds: [roleId] });
    expect((await pin(b, channelId, m.seq)).status).toBe(200);
    expect((await unpin(b, channelId, m.seq)).status).toBe(200);
    expect(await pins(a, channelId)).toEqual([]);
  });

  it("pinning twice is harmless and says so once; unpinning clears it", async () => {
    const { a, channelId } = await setup();
    const m = await send(a, channelId, "once");
    await pin(a, channelId, m.seq);
    await pin(a, channelId, m.seq);
    expect((await history(a, channelId)).filter((x) => x.kind === "system")).toHaveLength(1);
    const out = await unpin(a, channelId, m.seq);
    expect(out.body.data.message.pinnedAt).toBeNull();
    expect(await pins(a, channelId)).toEqual([]);
  });

  it("lists the newest pin first, and a deleted message leaves the list", async () => {
    const { a, channelId } = await setup();
    const [one, two, three] = [
      await send(a, channelId, "one"),
      await send(a, channelId, "two"),
      await send(a, channelId, "three"),
    ];
    for (const m of [one, two, three]) {
      await pin(a, channelId, m.seq);
      await new Promise((r) => setTimeout(r, 5));
    }
    expect((await pins(a, channelId)).map((p) => p.body)).toEqual(["three", "two", "one"]);
    await request(t.app)
      .delete(`${base(channelId)}/messages/${two.seq}`)
      .set(as(a));
    expect((await pins(a, channelId)).map((p) => p.body)).toEqual(["three", "one"]);
  });

  it("only a real message can be pinned, outsiders get a 404, and there is a limit", async () => {
    const { a, outsider, channelId } = await setup();
    const m = await send(a, channelId, "a message");
    await pin(a, channelId, m.seq);
    const system = (await history(a, channelId)).find((x) => x.kind === "system");
    expect((await pin(a, channelId, system.seq)).status).toBe(400);
    expect((await pin(outsider, channelId, m.seq)).status).toBe(404);
    expect(
      (
        await request(t.app)
          .get(`${base(channelId)}/pins`)
          .set(as(outsider))
      ).status,
    ).toBe(404);

    const { Message } = await import("../../models/message.js");
    const target = await send(a, channelId, "one too many");
    await Message.insertMany(
      Array.from({ length: CHAT_MAX_PINS - 1 }, (_, i) => ({
        conversationId: channelId,
        seq: 1000 + i,
        from: id(a),
        body: `p${i}`,
        pinnedAt: new Date(),
      })),
    );
    expect((await pin(a, channelId, target.seq)).status).toBe(400);
  });
});

describe("pinning in a group chat", () => {
  it("any member can pin and unpin", async () => {
    const [x, y, z] = [await createUser(), await createUser(), await createUser()];
    const chat = (
      await request(t.app)
        .post("/api/chat/conversations")
        .set(as(x))
        .send({ userIds: [id(y), id(z)], name: "G" })
    ).body.data.conversation;
    const m = await send(x, chat._id, "plans");
    expect((await pin(z, chat._id, m.seq)).status).toBe(200);
    expect((await pins(y, chat._id)).map((p) => p.body)).toEqual(["plans"]);
    expect((await unpin(y, chat._id, m.seq)).status).toBe(200);
  });
});
