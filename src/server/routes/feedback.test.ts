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
    expect(all.items.map((i: any) => i.message)).toEqual(["newest", "old"]);
    expect(all.total).toBe(2);
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

describe("resolving a report, with gems or a message", () => {
  const resolve = (who: { token: string }, id: string, body: object) =>
    request(t.app).post(`/api/admin/feedback/${id}/resolve`).set(auth(who)).send(body);
  const gemsOf = async (who: { user: { _id: unknown } }) =>
    ((await mongoose.model("User").findById(who.user._id)) as any).gems;
  const sendAndGetId = async (who: { user: { _id: unknown; username?: string } }) => {
    // Created directly: sending through the route is rate limited, and these tests make many.
    const row = await mongoose
      .model("Feedback")
      .create({ user_id: String(who.user._id), username: "ann", message: "The timer didn't ring" });
    return String(row._id);
  };

  it("credits the gems once, tells the person with the admin's message, archives it and audits it", async () => {
    const id = await sendAndGetId(ann);
    const before = await gemsOf(ann);
    const res = await resolve(boss, id, { gems: 50, message: "Thanks, it's fixed!" });
    expect(res.status).toBe(200);
    expect(res.body.data.feedback).toMatchObject({ status: "archived", rewardedGems: 50 });
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
      resolve(boss, id, { gems: 25, message: "Thanks!" }),
      resolve(otherAdmin, id, { gems: 25, message: "Thanks!" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await gemsOf(ann)).toBe(before + 25);
  });

  it("is for admins only, and checks the amount, the message and the id", async () => {
    const id = await sendAndGetId(ann);
    const before = await gemsOf(ann);
    expect((await resolve(ann, id, { gems: 50, message: "Thanks" })).status).toBe(403);
    for (const body of [
      { gems: -5, message: "x" },
      { gems: 1.5, message: "x" },
      { gems: 10_001, message: "x" },
      { gems: 50, message: "  " },
      { gems: 50, message: "x".repeat(501) },
    ]) {
      expect((await resolve(boss, id, body)).status).toBe(400);
    }
    expect((await resolve(boss, "nope", { gems: 50, message: "x" })).status).toBe(400);
    const missing = new mongoose.Types.ObjectId().toString();
    expect((await resolve(boss, missing, { gems: 50, message: "x" })).status).toBe(404);
    expect(await gemsOf(ann)).toBe(before);
  });

  it("closes quietly with no gems and no message: done, audited, and the person is not told", async () => {
    const id = await sendAndGetId(ann);
    const res = await resolve(boss, id, { gems: 0 });
    expect(res.status).toBe(200);
    expect(res.body.data.feedback.status).toBe("done");
    expect(await mongoose.model("Notification").countDocuments({ userId: String(ann.user._id) })).toBe(0);
    expect(await mongoose.model("AdminAudit").countDocuments({ action: "feedback_resolve" })).toBe(1);
  });

  it("dismisses quietly: status dismissed, no notification, and no gems or message allowed with it", async () => {
    const id = await sendAndGetId(ann);
    const before = await gemsOf(ann);
    expect((await resolve(boss, id, { outcome: "dismissed", gems: 100, message: "Thanks" })).status).toBe(400);
    expect((await resolve(boss, id, { outcome: "dismissed", message: "Thanks" })).status).toBe(400);
    const res = await resolve(boss, id, { outcome: "dismissed" });
    expect(res.status).toBe(200);
    expect(res.body.data.feedback.status).toBe("dismissed");
    expect(await gemsOf(ann)).toBe(before);
    expect(await mongoose.model("Notification").countDocuments({ userId: String(ann.user._id) })).toBe(0);
    const audit = await mongoose.model("AdminAudit").find({ action: "feedback_resolve" }).lean<any[]>();
    expect(audit[0].detail).toContain("Dismissed");
    expect(audit[0].meta.outcome).toBe("dismissed");
  });

  it("needs a message to go with gems", async () => {
    const id = await sendAndGetId(ann);
    const before = await gemsOf(ann);
    expect((await resolve(boss, id, { gems: 100 })).status).toBe(400);
    expect((await resolve(boss, id, { gems: 100, message: "  " })).status).toBe(400);
    expect(await gemsOf(ann)).toBe(before);
  });

  it("sends a message without gems, marks it done, and can be followed by a reward", async () => {
    const id = await sendAndGetId(ann);
    const before = await gemsOf(ann);
    const res = await resolve(boss, id, { gems: 0, message: "Fixed, thanks!" });
    expect(res.status).toBe(200);
    expect(res.body.data.feedback.status).toBe("done");
    expect(res.body.data.feedback.rewardedGems).toBeUndefined();
    expect(await gemsOf(ann)).toBe(before);
    const notes = await mongoose
      .model("Notification")
      .find({ userId: String(ann.user._id) })
      .lean<any[]>();
    expect(notes[0]).toMatchObject({ title: "About your feedback", message: "Fixed, thanks!" });
    expect(await mongoose.model("AdminAudit").countDocuments({ action: "feedback_resolve" })).toBe(1);

    expect((await resolve(boss, id, { gems: 25, message: "Here you go" })).status).toBe(200);
    expect(await gemsOf(ann)).toBe(before + 25);
  });

  it("releases the claim when the sender no longer exists", async () => {
    const row = await mongoose
      .model("Feedback")
      .create({ user_id: String(new mongoose.Types.ObjectId()), username: "ghost", message: "hi there" });
    const res = await resolve(boss, String(row._id), { gems: 50, message: "Thanks" });
    expect(res.status).toBe(404);
    const after: any = await mongoose.model("Feedback").findById(row._id).lean();
    expect(after.rewardedGems).toBeUndefined();
  });
});

describe("telling the person", () => {
  it("only happens when an admin resolves with a message, never from a status change, archive or delete", async () => {
    const row0 = await mongoose
      .model("Feedback")
      .create({ user_id: String(ann.user._id), username: "ann", message: "The timer didn't ring" });
    const id = String(row0._id);
    const mine = () => mongoose.model("Notification").countDocuments({ userId: String(ann.user._id) });
    for (const status of ["seen", "done", "new", "archived"]) {
      await request(t.app).put(`/api/admin/feedback/${id}`).set(auth(boss)).send({ status });
    }
    await request(t.app).delete(`/api/admin/feedback/${id}`).set(auth(boss));
    expect(await mine()).toBe(0);

    const row = await mongoose
      .model("Feedback")
      .create({ user_id: String(ann.user._id), username: "ann", message: "hi there" });
    await request(t.app)
      .post(`/api/admin/feedback/${row._id}/resolve`)
      .set(auth(boss))
      .send({ gems: 0, message: "Thanks" });
    expect(await mine()).toBe(1);
  });
});

describe("archiving and deleting", () => {
  it("keeps archived feedback out of the default list, and shows it under the Archived filter", async () => {
    const model = mongoose.model("Feedback");
    await model.create({ user_id: "1", username: "a", message: "open one" });
    await model.create({ user_id: "2", username: "b", message: "put away", status: "archived" });
    expect((await inbox(boss)).body.data.items.map((i: any) => i.message)).toEqual(["open one"]);
    expect((await inbox(boss, "?status=archived")).body.data.items.map((i: any) => i.message)).toEqual(["put away"]);
    await model.create({ user_id: "3", username: "c", message: "no thanks", status: "dismissed" });
    expect((await inbox(boss, "?status=dismissed")).body.data.items.map((i: any) => i.message)).toEqual(["no thanks"]);
  });

  it("deletes only archived feedback, for admins, and audits it", async () => {
    const live = await mongoose.model("Feedback").create({ user_id: "1", username: "a", message: "still open" });
    const del = (who: { token: string }, id: unknown) =>
      request(t.app).delete(`/api/admin/feedback/${id}`).set(auth(who));
    expect((await del(boss, live._id)).status).toBe(409);
    expect(await mongoose.model("Feedback").countDocuments()).toBe(1);

    await request(t.app).put(`/api/admin/feedback/${live._id}`).set(auth(boss)).send({ status: "archived" });
    expect((await del(ann, live._id)).status).toBe(403);
    expect((await del(boss, live._id)).status).toBe(200);
    expect(await mongoose.model("Feedback").countDocuments()).toBe(0);
    expect(await mongoose.model("AdminAudit").countDocuments({ action: "feedback_delete" })).toBe(1);
    expect((await del(boss, live._id)).status).toBe(404);
  });
});
