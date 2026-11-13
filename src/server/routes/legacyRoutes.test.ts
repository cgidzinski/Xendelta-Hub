import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// What notifications, push subscriptions and the paint collection answer, including every refusal. These were written before
// the routes were moved onto AppError / callerId, to show that moving them changed nothing a client can see: the same
// statuses and the same { status: false, message } bodies.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./notifications.js"), () => import("./push.js"), () => import("./paints.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const call = (who: U | null, method: "get" | "post" | "put" | "delete", url: string, body?: object) => {
  const req = request(t.app)[method](url);
  return (who ? req.set(as(who)) : req).send(body);
};
// A refusal: its status and message. (The test app's own error handler adds a stack; production's errorHandler turns an
// AppError into { status: false, message }, which errorHandler.test.ts covers, so the body is not compared here.)
const refused = (res: request.Response, status: number, message: string) => {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  expect(res.body.message).toBe(message);
};
const notify = (who: U, title: string, unread = true) =>
  mongoose
    .model("Notification")
    .create({ userId: who.user._id, title, message: "m", time: new Date().toISOString(), unread });

describe("notifications", () => {
  it("lists the caller's latest ten, newest first, and records that they looked", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    for (let i = 0; i < 12; i++) {
      await mongoose
        .model("Notification")
        .create({ userId: me.user._id, title: `n${i}`, message: "m", time: new Date(2026, 0, 1, 0, i).toISOString() });
    }
    await notify(other, "not mine");
    const res = await call(me, "get", "/api/user/notifications");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: true, message: "" });
    const titles = res.body.data.notifications.map((n: any) => n.title);
    expect(titles).toHaveLength(10);
    expect(titles[0]).toBe("n11");
    expect(titles).not.toContain("not mine");
    expect((await mongoose.model("User").findById(me.user._id).lean<any>()).notificationsLastCheckedAt).toBeTruthy();
    expect((await call(null, "get", "/api/user/notifications")).status).toBe(401);
  });

  it("marks one read, only for its owner; a stranger or a missing one is a 404", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    const n = await notify(me, "mine");
    const res = await call(me, "put", `/api/user/notifications/${n.id}/mark-read`);
    expect(res.body).toMatchObject({ status: true, message: "Notification marked as read" });
    expect(res.body.data.notification.unread).toBe(false);

    const theirs = await notify(me, "theirs");
    refused(await call(other, "put", `/api/user/notifications/${theirs.id}/mark-read`), 404, "Notification not found");
    refused(
      await call(me, "put", `/api/user/notifications/${new mongoose.Types.ObjectId()}/mark-read`),
      404,
      "Notification not found",
    );
    expect((await mongoose.model("Notification").findById(theirs.id).lean<any>()).unread).toBe(true);
    expect((await call(me, "put", "/api/user/notifications/not-an-id/mark-read")).status).toBe(400);
  });

  it("marks everything read, dismisses one, and clears all", async () => {
    const me = await createUser();
    await notify(me, "a");
    const b = await notify(me, "b");
    await notify(me, "c");
    const all = await call(me, "put", "/api/user/notifications/mark-read");
    expect(all.body).toMatchObject({ status: true, message: "All notifications marked as read" });
    expect(all.body.data.notifications.every((n: any) => n.unread === false)).toBe(true);

    const one = await call(me, "delete", `/api/user/notifications/${b.id}`);
    expect(one.body).toEqual({ status: true, message: "Notification dismissed", data: { notificationId: b.id } });
    refused(await call(me, "delete", `/api/user/notifications/${b.id}`), 404, "Notification not found");

    const cleared = await call(me, "delete", "/api/user/notifications");
    expect(cleared.body).toEqual({ status: true, message: "All notifications cleared", data: {} });
    expect(await mongoose.model("Notification").countDocuments({ userId: me.user._id })).toBe(0);
  });
});

describe("push subscriptions", () => {
  it("says push isn't configured (503) until there is a key, then serves it", async () => {
    const saved = process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    refused(
      await call(null, "get", "/api/push/public-key"),
      503,
      "Push notifications are not configured on this server",
    );
    process.env.VAPID_PUBLIC_KEY = "BKey123";
    expect((await call(null, "get", "/api/push/public-key")).body).toEqual({
      status: true,
      message: "",
      data: { publicKey: "BKey123" },
    });
    if (saved === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = saved;
  });

  it("saves a subscription, moves it to another account on the same device, and removes only your own", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } };
    expect((await call(me, "post", "/api/push/subscribe", sub)).body).toMatchObject({
      status: true,
      message: "Push subscription saved",
    });
    await call(other, "post", "/api/push/subscribe", sub); // same device, new account: one row, now theirs
    const rows = await mongoose.model("PushSubscription").find({ endpoint: sub.endpoint }).lean<any[]>();
    expect(rows).toHaveLength(1);
    expect(String(rows[0].userId)).toBe(String(other.user._id));

    await call(me, "delete", "/api/push/subscribe", { endpoint: sub.endpoint }); // not mine now: nothing removed
    expect(await mongoose.model("PushSubscription").countDocuments({ endpoint: sub.endpoint })).toBe(1);
    expect((await call(other, "delete", "/api/push/subscribe", { endpoint: sub.endpoint })).body).toEqual({
      status: true,
      message: "Push subscription removed",
      data: {},
    });
    expect(await mongoose.model("PushSubscription").countDocuments({ endpoint: sub.endpoint })).toBe(0);
    expect((await call(me, "post", "/api/push/subscribe", { endpoint: "nope", keys: {} })).status).toBe(400);
    expect((await call(null, "post", "/api/push/subscribe", sub)).status).toBe(401);
  });
});

describe("the paint collection", () => {
  const add = (who: U, paint: object) => call(who, "post", "/api/paints", paint);

  it("adds, lists (by brand then name) and only lists your own", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    const a = await add(me, { brand: "Citadel", name: "Nuln Oil", quantity: 2 });
    expect(a.body).toMatchObject({ status: true, message: "Paint added" });
    expect(a.body.data.paint).toMatchObject({ brand: "Citadel", name: "Nuln Oil", quantity: 2 });
    await add(me, { brand: "Army Painter", name: "Skeleton Bone" });
    await add(other, { brand: "Vallejo", name: "Mine" });
    const list = await call(me, "get", "/api/paints");
    expect(list.body.data.paints.map((p: any) => p.name)).toEqual(["Skeleton Bone", "Nuln Oil"]);
  });

  it("refuses a paint with no name (400) and a duplicate (409)", async () => {
    const me = await createUser();
    refused(await add(me, { brand: "Citadel", name: "   " }), 400, "A paint needs a name");
    expect((await add(me, { brand: "Citadel", name: "Abaddon Black" })).status).toBe(200);
    refused(
      await add(me, { brand: "Citadel", name: "Abaddon Black" }),
      409,
      "That paint is already in your collection",
    );
  });

  it("updates your own paint, merging what you send onto what is stored", async () => {
    const me = await createUser();
    const id = (await add(me, { brand: "Citadel", name: "Mephiston Red", quantity: 1, hex: "#aa0000" })).body.data.paint
      ._id;
    const res = await call(me, "put", `/api/paints/${id}`, { quantity: 3 });
    expect(res.body).toMatchObject({ status: true, message: "Paint updated" });
    expect(res.body.data.paint).toMatchObject({ name: "Mephiston Red", brand: "Citadel", quantity: 3 });
  });

  it("refuses an update or delete of a missing paint (404) or someone else's (403), and a rename onto an existing one (409)", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    const mine = (await add(me, { brand: "Citadel", name: "One" })).body.data.paint._id;
    await add(me, { brand: "Citadel", name: "Two" });
    const missing = new mongoose.Types.ObjectId().toString();

    refused(await call(me, "put", `/api/paints/${missing}`, { name: "x" }), 404, "Paint not found");
    refused(await call(me, "delete", `/api/paints/${missing}`), 404, "Paint not found");
    refused(await call(other, "put", `/api/paints/${mine}`, { name: "stolen" }), 403, "Access denied");
    refused(await call(other, "delete", `/api/paints/${mine}`), 403, "Access denied");
    refused(
      await call(me, "put", `/api/paints/${mine}`, { name: "Two" }),
      409,
      "Another paint in your collection already has that brand, range and name",
    );
    refused(await call(me, "put", `/api/paints/${mine}`, { name: "   ", brand: "" }), 400, "A paint needs a name");
    expect((await mongoose.model("Paint").findById(mine).lean<any>()).name).toBe("One");

    expect((await call(me, "delete", `/api/paints/${mine}`)).body).toEqual({ status: true, message: "Paint removed" });
    expect(await mongoose.model("Paint").findById(mine)).toBeNull();
    expect((await call(null, "get", "/api/paints")).status).toBe(401);
  });
});
