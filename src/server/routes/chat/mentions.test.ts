import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

// Which pushes were sent, so a test can see who was told and how.
const { pushes } = vi.hoisted(() => ({ pushes: [] as Array<{ userId: string; title: string }> }));
vi.mock("../../utils/pushUtils", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  sendPushToUser: vi.fn(async (userId: string, payload: { title: string }) => {
    pushes.push({ userId, title: payload.title });
    return { sent: 1, pruned: 0 };
  }),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("../communities/index.js"), () => import("./index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  pushes.length = 0;
});

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const id = (u: U) => String(u.user._id);
const mention = (u: U) => `<@${id(u)}>`;

const setup = async () => {
  const [a, b, c, outsider] = [await createUser(), await createUser(), await createUser(), await createUser()];
  const community = (await request(t.app).post("/api/communities").set(as(a)).send({ name: "Crew" })).body.data
    .community;
  const { Community } = await import("../../models/community.js");
  for (const u of [b, c])
    await Community.updateOne({ _id: community._id }, { $push: { members: { user_id: id(u), role: "member" } } });
  const [general] = (await request(t.app).get(`/api/communities/${community._id}/channels`).set(as(a))).body.data
    .channels;
  return { a, b, c, outsider, community, channelId: general._id as string };
};
const send = (who: U, channelId: string, body: string) =>
  request(t.app).post(`/api/chat/conversations/${channelId}/messages`).set(as(who)).send({ body });
const channelFor = async (who: U, communityId: string) =>
  (await request(t.app).get(`/api/communities/${communityId}/channels`).set(as(who))).body.data.channels[0];
const mute = (who: U, channelId: string) =>
  request(t.app).patch(`/api/chat/conversations/${channelId}/me`).set(as(who)).send({ muted: true });

describe("who a message can mention", () => {
  it("people who can read the channel are mentioned; the sender and outsiders are not", async () => {
    const { a, b, outsider, channelId } = await setup();
    const sent = await send(a, channelId, `hi ${mention(b)} ${mention(a)} ${mention(outsider)}`);
    expect(sent.status).toBe(200);
    expect(sent.body.data.message.mentions).toEqual([id(b)]);
    expect(sent.body.data.message).toMatchObject({ mentionsEveryone: false, mentionsHere: false });
  });

  it("a mention inside code is not a mention", async () => {
    const { a, b, channelId } = await setup();
    const sent = await send(a, channelId, `look: \`${mention(b)}\` @everyone`.replace("@everyone", "`@everyone`"));
    expect(sent.body.data.message.mentions).toEqual([]);
    expect(sent.body.data.message.mentionsEveryone).toBe(false);
  });

  it("@everyone and @here need the permission in a community, but not in a group chat", async () => {
    const { a, b, channelId } = await setup();
    const fromOwner = await send(a, channelId, "hello @everyone and @here");
    expect(fromOwner.body.data.message).toMatchObject({ mentionsEveryone: true, mentionsHere: true });
    const fromMember = await send(b, channelId, "hello @everyone and @here");
    expect(fromMember.status).toBe(200);
    expect(fromMember.body.data.message).toMatchObject({ mentionsEveryone: false, mentionsHere: false });

    const [x, y, z] = [await createUser(), await createUser(), await createUser()];
    const chat = (
      await request(t.app)
        .post("/api/chat/conversations")
        .set(as(x))
        .send({ userIds: [id(y), id(z)], name: "G" })
    ).body.data.conversation;
    const inGroup = await send(y, chat._id, "attention @everyone");
    expect(inGroup.body.data.message.mentionsEveryone).toBe(true);
  });

  it("editing changes who is mentioned", async () => {
    const { a, b, c, channelId } = await setup();
    const sent = (await send(a, channelId, `hi ${mention(b)}`)).body.data.message;
    const edited = await request(t.app)
      .patch(`/api/chat/conversations/${channelId}/messages/${sent.seq}`)
      .set(as(a))
      .send({ body: `hi ${mention(c)}` });
    expect(edited.body.data.message.mentions).toEqual([id(c)]);
  });
});

describe("previews and push", () => {
  it("the preview names the person, and the plain words keep no marks", async () => {
    const { a, b, community, channelId } = await setup();
    await send(a, channelId, `**hey** ${mention(b)}`);
    expect((await channelFor(b, community._id)).lastMessage.preview).toBe(`hey @${b.user.username}`);
  });

  it("naming someone tells them even when they muted the channel; a plain message doesn't", async () => {
    const { a, b, c, channelId } = await setup();
    await mute(b, channelId);
    await mute(c, channelId);
    await send(a, channelId, "nothing special");
    expect(pushes).toEqual([]);
    await send(a, channelId, `look ${mention(b)}`);
    expect(pushes.map((p) => p.userId)).toEqual([id(b)]);
    expect(pushes[0]!.title).toContain("mentioned you");
  });

  it("@everyone pings people who haven't muted, with a heading that says so", async () => {
    const { a, b, c, channelId } = await setup();
    await mute(c, channelId);
    await send(a, channelId, "meeting now @everyone");
    expect(pushes.map((p) => p.userId)).toEqual([id(b)]);
    expect(pushes[0]!.title).toContain("pinged everyone");
  });
});

describe("counting mentions", () => {
  it("a channel and a community count the mentions you haven't read, and reading clears them", async () => {
    const { a, b, c, community, channelId } = await setup();
    await send(a, channelId, "no mention");
    await send(a, channelId, `one ${mention(b)}`);
    await send(c, channelId, "to all @everyone".replace("@everyone", "plain")); // not a mention
    await send(a, channelId, "ping @everyone");

    expect((await channelFor(b, community._id)).mentions).toBe(2); // named once, plus @everyone
    expect((await channelFor(c, community._id)).mentions).toBe(1); // only @everyone
    const detail = await request(t.app).get(`/api/communities/${community._id}`).set(as(b));
    expect(detail.body.data.community.unreadMentions).toBe(2);
    const list = await request(t.app).get("/api/communities").set(as(b));
    expect(list.body.data.communities[0].unreadMentions).toBe(2);

    await request(t.app).post(`/api/chat/conversations/${channelId}/read`).set(as(b)).send({ seq: 99 });
    expect((await channelFor(b, community._id)).mentions).toBe(0);
    expect((await channelFor(c, community._id)).mentions).toBe(1);
  });

  it("you are never counted for your own messages", async () => {
    const { a, community, channelId } = await setup();
    await send(a, channelId, "me @everyone");
    expect((await channelFor(a, community._id)).mentions).toBe(0);
  });

  it("a muted channel still counts a mention of you, and shows on the Home feed", async () => {
    const { a, b, community, channelId } = await setup();
    await mute(b, channelId);
    await send(a, channelId, `urgent ${mention(b)}`);
    expect((await channelFor(b, community._id)).mentions).toBe(1);
    const { mentionsProvider } = await import("../../feed/providers/mentions.js");
    const cards = await mentionsProvider.fetch(id(b));
    expect(cards).toEqual([
      expect.objectContaining({
        key: `mentions:${community._id}`,
        title: "1 unread mention in Crew",
        link: `/internal/communities/${community._id}`,
        count: 1,
      }),
    ]);
    expect(await mentionsProvider.fetch(id(a))).toEqual([]);
  });
});
