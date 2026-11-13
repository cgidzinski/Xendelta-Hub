import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Feedback from people (POST /api/feedback) and the admin inbox for it. Real routes and models; the push and email
// channels are not involved (only the in-app notification is checked).
vi.mock("../utils/pushUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  sendPushToUser: vi.fn(async () => ({ sent: 0, pruned: 0 })),
}));

let t: TestApp;
let boss: Awaited<ReturnType<typeof createUser>>;
let otherAdmin: Awaited<ReturnType<typeof createUser>>;
let ann: Awaited<ReturnType<typeof createUser>>;
let bob: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  t = await startTestApp([() => import("./feedback.js"), () => import("./admin/index.js")]);
  boss = await createUser({ roles: ["admin"], username: "boss" });
  otherAdmin = await createUser({ roles: ["admin"], username: "boss2" });
  ann = await createUser({ username: "ann" });
  bob = await createUser({ username: "bob" });
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(async () => {
  await mongoose.model("Feedback").deleteMany({});
  await mongoose.model("Notification").deleteMany({});
  await mongoose.model("AdminAudit").deleteMany({});
});

const auth = (who: { token: string }) => ({ Authorization: `Bearer ${who.token}` });
const send = (who: { token: string }, body: object) => request(t.app).post("/api/feedback").set(auth(who)).send(body);
const inbox = (who: { token: string }, query = "") => request(t.app).get(`/api/admin/feedback${query}`).set(auth(who));

describe("sending feedback", () => {
  it("needs a signed-in person", async () => {
    expect((await request(t.app).post("/api/feedback").send({ message: "hello" })).status).toBe(401);
  });

  it("saves it with who sent it, and tells every admin (and nobody else)", async () => {
    const res = await send(ann, { message: "Dark mode for the cook view" });
    expect(res.status).toBe(201);
    const rows = await mongoose.model("Feedback").find({}).lean<any[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      username: "ann",
      message: "Dark mode for the cook view",
      status: "new",
    });
    const notes = await mongoose.model("Notification").find({}).lean<any[]>();
    expect(notes.map((n) => String(n.userId)).sort()).toEqual([boss.user._id, otherAdmin.user._id].map(String).sort());
    expect(notes[0].title).toContain("ann");
    expect(notes[0].message).toContain("Dark mode");
    expect(notes[0].link).toBe("/admin/feedback");
  });

  it("refuses an empty or too long message", async () => {
    expect((await send(ann, { message: "  " })).status).toBe(400);
    expect((await send(ann, { message: "x".repeat(2001) })).status).toBe(400);
    expect(await mongoose.model("Feedback").countDocuments()).toBe(0);
  });

  it("limits how much one person can send in an hour, without affecting others", async () => {
    for (let i = 0; i < 10; i++) expect((await send(bob, { message: `message ${i}` })).status).toBe(201);
    const blocked = await send(bob, { message: "one more" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/try again later/i);
    expect((await send(ann, { message: "still fine" })).status).toBe(201);
  });
});

describe("the admin inbox", () => {
  it("is for admins only", async () => {
    expect((await inbox(ann)).status).toBe(403);
    const row = await mongoose.model("Feedback").create({ user_id: "1", username: "x", message: "hi" });
    const put = await request(t.app).put(`/api/admin/feedback/${row._id}`).set(auth(ann)).send({ status: "done" });
    expect(put.status).toBe(403);
  });

  it("lists newest first, filters by status, and counts the new ones", async () => {
    const model = mongoose.model("Feedback");
    await model.create({
      user_id: "1",
      username: "a",
      message: "old",
      createdAt: new Date("2026-01-01"),
    });
    await model.create({
      user_id: "2",
      username: "b",
      message: "newer",
      createdAt: new Date("2026-02-01"),
      status: "done",
    });
    await model.create({
      user_id: "3",
      username: "c",
      message: "newest",
      createdAt: new Date("2026-03-01"),
    });
    const all = (await inbox(boss)).body.data;
    expect(all.items.map((i: any) => i.message)).toEqual(["newest", "newer", "old"]);
    expect(all.total).toBe(3);
    expect(all.newCount).toBe(2);
    expect(all.items[0].from.username).toBe("c");
    const done = (await inbox(boss, "?status=done")).body.data;
    expect(done.items.map((i: any) => i.message)).toEqual(["newer"]);
    expect(done.newCount).toBe(2);
    expect((await inbox(boss, "?status=weird")).status).toBe(400);
  });

  it("changes the status, and writes an audit row naming who did it", async () => {
    await send(ann, { message: "The timer didn't ring" });
    const id = String((await mongoose.model("Feedback").findOne({}))!._id);
    const res = await request(t.app).put(`/api/admin/feedback/${id}`).set(auth(boss)).send({ status: "seen" });
    expect(res.status).toBe(200);
    expect(res.body.data.feedback.status).toBe("seen");
    const audit = await mongoose.model("AdminAudit").find({ action: "feedback_update" }).lean<any[]>();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ admin_name: "boss", category: "System" });
    expect(audit[0].target).toMatchObject({ type: "feedback", id });
    expect(audit[0].meta).toEqual({ before: "new", after: "seen" });
  });

  it("404s for feedback that isn't there, and 400s for a bad id or status", async () => {
    const missing = new mongoose.Types.ObjectId().toString();
    expect(
      (await request(t.app).put(`/api/admin/feedback/${missing}`).set(auth(boss)).send({ status: "done" })).status,
    ).toBe(404);
    expect((await request(t.app).put(`/api/admin/feedback/nope`).set(auth(boss)).send({ status: "done" })).status).toBe(
      400,
    );
    expect(
      (await request(t.app).put(`/api/admin/feedback/${missing}`).set(auth(boss)).send({ status: "lost" })).status,
    ).toBe(400);
  });
});

describe("rewarding a bug report with gems", () => {
  const reward = (who: { token: string }, id: string, body: object) =>
    request(t.app).post(`/api/admin/feedback/${id}/reward`).set(auth(who)).send(body);
  const gemsOf = async (who: { user: { _id: unknown } }) =>
    ((await mongoose.model("User").findById(who.user._id)) as any).gems;
  const sendAndGetId = async (who: { token: string }) => {
    await send(who, { message: "The timer didn't ring" });
    return String((await mongoose.model("Feedback").findOne({}))!._id);
  };

  it("credits the gems once, tells the person with the admin's message, marks it done and audits it", async () => {
    const id = await sendAndGetId(ann);
    const before = await gemsOf(ann);
    const res = await reward(boss, id, { gems: 50, message: "Thanks, it's fixed!" });
    expect(res.status).toBe(200);
    expect(res.body.data.feedback).toMatchObject({ status: "done", rewardedGems: 50 });
    expect(await gemsOf(ann)).toBe(before + 50);

    const notes = await mongoose
      .model("Notification")
      .find({ userId: String(ann.user._id) })
      .lean<any[]>();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      title: "You earned 50 gems",
      message: "Thanks, it's fixed!",
      link: "/internal/shop",
    });

    const audit = await mongoose.model("AdminAudit").find({ action: "feedback_reward" }).lean<any[]>();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ admin_name: "boss", category: "Gems" });
    expect(audit[0].meta).toMatchObject({ gems: 50 });
  });

  it("refuses a second reward and never pays twice, even at the same moment", async () => {
    const id = await sendAndGetId(ann);
    const before = await gemsOf(ann);
    const results = await Promise.all([
      reward(boss, id, { gems: 25, message: "Thanks!" }),
      reward(otherAdmin, id, { gems: 25, message: "Thanks!" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await gemsOf(ann)).toBe(before + 25);
  });

  it("is for admins only, and checks the amount, the message and the id", async () => {
    const id = await sendAndGetId(ann);
    const before = await gemsOf(ann);
    expect((await reward(ann, id, { gems: 50, message: "Thanks" })).status).toBe(403);
    for (const body of [
      { gems: 0, message: "x" },
      { gems: -5, message: "x" },
      { gems: 1.5, message: "x" },
      { gems: 10_001, message: "x" },
      { gems: 50, message: "  " },
      { gems: 50, message: "x".repeat(501) },
      { message: "x" },
    ]) {
      expect((await reward(boss, id, body)).status).toBe(400);
    }
    expect((await reward(boss, "nope", { gems: 50, message: "x" })).status).toBe(400);
    const missing = new mongoose.Types.ObjectId().toString();
    expect((await reward(boss, missing, { gems: 50, message: "x" })).status).toBe(404);
    expect(await gemsOf(ann)).toBe(before);
  });

  it("releases the claim when the sender no longer exists", async () => {
    const row = await mongoose
      .model("Feedback")
      .create({ user_id: String(new mongoose.Types.ObjectId()), username: "ghost", message: "hi there" });
    const res = await reward(boss, String(row._id), { gems: 50, message: "Thanks" });
    expect(res.status).toBe(404);
    const after: any = await mongoose.model("Feedback").findById(row._id).lean();
    expect(after.rewardedGems).toBeUndefined();
  });
});
