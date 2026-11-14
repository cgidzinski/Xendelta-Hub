import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

const { sendNotification } = vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  return { sendNotification: vi.fn(async () => ({})) };
});
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([
    () => import("./presence.js"),
    () => import("./chat/index.js"),
    () => import("./communities/index.js"),
  ]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(async () => (await import("../presence/tracker.js")).presenceTracker.reset());

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const id = (u: U) => String(u.user._id);
const dm = async (a: U, b: U) =>
  (
    await request(t.app)
      .post("/api/chat/conversations")
      .set(as(a))
      .send({ userIds: [id(b)] })
  ).body.data.conversation._id as string;
const tracker = async () => (await import("../presence/tracker.js")).presenceTracker;
const seen = async (viewer: U) =>
  (await request(t.app).get("/api/presence").set(as(viewer))).body.data.presence as any[];
const put = (who: U, body: unknown) =>
  request(t.app)
    .put("/api/presence")
    .set(as(who))
    .send(body as object);

describe("who sees whom", () => {
  it("shows people you share a chat with while a tab of theirs is connected, and nobody else", async () => {
    const [a, b, stranger] = [await createUser(), await createUser(), await createUser()];
    await dm(a, b);
    const tr = await tracker();
    expect(await seen(a)).toEqual([]);
    tr.connect(id(b), "tab1");
    tr.connect(id(stranger), "tab9");
    expect(await seen(a)).toEqual([{ userId: id(b), status: "online", customStatus: null }]);
    expect(await seen(stranger)).toEqual([]);
    tr.disconnect(id(b), "tab1");
    expect(await seen(a)).toEqual([]);
  });

  it("people in the same community see each other, though they have no chat together", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const made = (await request(t.app).post("/api/communities").set(as(a)).send({ name: "Crew" })).body.data.community;
    const { Community } = await import("../models/community.js");
    await Community.updateOne({ _id: made._id }, { $push: { members: { user_id: id(b), role: "member" } } });
    (await tracker()).connect(id(a), "t1");
    expect((await seen(b)).map((e) => e.userId)).toEqual([id(a)]);
  });

  it("idle when every tab has been left alone, online again when any is in use", async () => {
    const [a, b] = [await createUser(), await createUser()];
    await dm(a, b);
    const tr = await tracker();
    tr.connect(id(b), "t1");
    tr.connect(id(b), "t2");
    tr.setIdle(id(b), "t1", true);
    expect((await seen(a))[0].status).toBe("online");
    tr.setIdle(id(b), "t2", true);
    expect((await seen(a))[0].status).toBe("idle");
    tr.setIdle(id(b), "t1", false);
    expect((await seen(a))[0].status).toBe("online");
  });
});

describe("choosing a status", () => {
  it("invisible reads as offline to others, but you still see yourself as chosen", async () => {
    const [a, b] = [await createUser(), await createUser()];
    await dm(a, b);
    (await tracker()).connect(id(b), "t1");
    expect((await put(b, { choice: "invisible" })).body.data.me.choice).toBe("invisible");
    expect(await seen(a)).toEqual([]);
    const mine = (await request(t.app).get("/api/presence").set(as(b))).body.data.me;
    expect(mine.choice).toBe("invisible");
    await put(b, { choice: "dnd" });
    expect((await seen(a))[0].status).toBe("dnd");
    await put(b, { choice: "idle" });
    expect((await seen(a))[0].status).toBe("idle");
  });

  it("a status line shows to others, can expire, and can be cleared; it hides when offline", async () => {
    const [a, b] = [await createUser(), await createUser()];
    await dm(a, b);
    (await tracker()).connect(id(b), "t1");
    const soon = new Date(Date.now() + 3_600_000).toISOString();
    const res = await put(b, { customStatus: { text: "At the lake", emoji: "🏕️", expiresAt: soon } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await seen(a))[0].customStatus).toEqual({ text: "At the lake", emoji: "🏕️", expiresAt: soon });

    const { User } = await import("../models/user.js");
    await User.updateOne({ _id: id(b) }, { "presence.customStatus.expiresAt": new Date(Date.now() - 1000) });
    expect((await seen(a))[0].customStatus).toBeNull();

    await put(b, { customStatus: { text: "Back at it", emoji: "" } });
    expect((await seen(a))[0].customStatus).toMatchObject({ text: "Back at it", expiresAt: null });
    await put(b, { customStatus: null });
    expect((await seen(a))[0].customStatus).toBeNull();
    // Choosing a status doesn't wipe the line.
    await put(b, { customStatus: { text: "Hi", emoji: "" } });
    await put(b, { choice: "online" });
    expect((await seen(a))[0].customStatus?.text).toBe("Hi");
  });

  it("rejects what makes no sense", async () => {
    const a = await createUser();
    expect((await put(a, {})).status).toBe(400);
    expect((await put(a, { choice: "away" })).status).toBe(400);
    expect((await put(a, { customStatus: { text: "", emoji: "" } })).status).toBe(400);
    expect((await put(a, { customStatus: { text: "x".repeat(81) } })).status).toBe(400);
    expect((await put(a, { customStatus: { text: "x", expiresAt: "2001-01-01T00:00:00Z" } })).status).toBe(400);
    expect((await request(t.app).put("/api/presence").send({ choice: "dnd" })).status).toBe(401);
  });
});

describe("telling people", () => {
  it("an update goes to the people who share a chat with you, and to you, and to no one else", async () => {
    const [a, b, stranger] = [await createUser(), await createUser(), await createUser()];
    await dm(a, b);
    const { announcePresence } = await import("../presence/tracker.js");
    const sent: Array<{ to: string[]; payload: any }> = [];
    (await tracker()).connect(id(a), "t1");
    await announcePresence(id(a), (to, _event, payload) => sent.push({ to, payload }));
    expect(sent).toHaveLength(1);
    expect(new Set(sent[0].to)).toEqual(new Set([id(b), id(a)]));
    expect(sent[0].to).not.toContain(id(stranger));
    expect(sent[0].payload).toMatchObject({ userId: id(a), status: "online" });
  });

  it("an invisible person is announced as offline", async () => {
    const [a, b] = [await createUser(), await createUser()];
    await dm(a, b);
    (await tracker()).connect(id(a), "t1");
    await put(a, { choice: "invisible" });
    const { announcePresence } = await import("../presence/tracker.js");
    const sent: any[] = [];
    await announcePresence(id(a), (_to, _event, payload) => sent.push(payload));
    expect(sent[0]).toMatchObject({ status: "offline", customStatus: null });
  });
});

describe("do not disturb", () => {
  const subscribe = async (u: U) => {
    const { PushSubscription } = await import("../models/pushSubscription.js");
    await PushSubscription.create({
      userId: id(u),
      endpoint: `https://push.example/${id(u)}`,
      keys: { p256dh: "k", auth: "a" },
    });
  };

  it("stops push notifications, and they come back when it is turned off", async () => {
    const a = await createUser();
    await subscribe(a);
    const { sendPushToUser } = await import("../utils/pushUtils.js");
    sendNotification.mockClear();
    await put(a, { choice: "dnd" });
    expect(await sendPushToUser(id(a), { title: "Hi", body: "there" })).toEqual({ sent: 0, pruned: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
    await put(a, { choice: "online" });
    expect((await sendPushToUser(id(a), { title: "Hi", body: "there" })).sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("invisible and idle still get push (only do not disturb silences it)", async () => {
    const a = await createUser();
    await subscribe(a);
    const { sendPushToUser } = await import("../utils/pushUtils.js");
    await put(a, { choice: "invisible" });
    expect((await sendPushToUser(id(a), { title: "Hi", body: "x" })).sent).toBe(1);
  });
});
