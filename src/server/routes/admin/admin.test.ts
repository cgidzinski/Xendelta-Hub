import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

let t: TestApp;
let adminUser: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  t = await startTestApp([() => import("./index.js")]);
  const { SocketManager } = await import("../../infrastructure/SocketManager.js");
  (SocketManager.getInstance() as any).io = {
    to: () => ({ emit: () => undefined }),
    sockets: { adapter: { rooms: new Map() } },
  };
  adminUser = await createUser({ roles: ["admin"], username: "boss" });
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(async () => {
  await mongoose.model("AdminAudit").deleteMany({});
});

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (url: string) => request(t.app).get(`/api/admin${url}`).set(as(adminUser.token));
const send = (method: "post" | "put" | "delete", url: string, body?: object) =>
  request(t.app)[method](`/api/admin${url}`).set(as(adminUser.token)).send(body);
const audit = async (filter: object = {}) =>
  mongoose.model("AdminAudit").find(filter).sort({ createdAt: 1 }).lean<any[]>();
const id = (u: { user: { _id: unknown } }) => String(u.user._id);

describe("access", () => {
  it("is closed to anyone who isn't an admin, on reads and writes", async () => {
    const plain = await createUser();
    const paths = ["/overview", "/users", "/storage", "/purchases", "/system", "/audit", "/broadcasts"];
    for (const p of paths) {
      expect((await request(t.app).get(`/api/admin${p}`).set(as(plain.token))).status, p).toBe(403);
      expect((await request(t.app).get(`/api/admin${p}`)).status, `${p} signed out`).toBe(401);
    }
    const write = await request(t.app)
      .put(`/api/admin/users/${id(plain)}`)
      .set(as(plain.token))
      .send({ roles: ["admin"] });
    expect(write.status).toBe(403);
    const self = await mongoose.model("User").findById(plain.user._id).lean<any>();
    expect(self.roles ?? []).not.toContain("admin");
  });

  it("has no route that edits or deletes an audit entry", async () => {
    await send("put", `/users/${id(adminUser)}`, { xendriveQuota: 1024 });
    const [row] = await audit();
    for (const method of ["put", "patch", "delete"] as const) {
      const res = await request(t.app)[method](`/api/admin/audit/${row._id}`).set(as(adminUser.token));
      expect(res.status).toBe(404);
    }
  });
});

describe("users", () => {
  it("pages, searches, filters and sorts the people list", async () => {
    const [a, b, c] = [
      await createUser({ username: "zed_list", email: "zed_list@x.test" }),
      await createUser({ username: "amy_list", email: "amy_list@x.test", roles: ["admin"] }),
      await createUser({ username: "bob_list", email: "bob_list@x.test", xendrive: { spaceAllowed: 0 } }),
    ];
    const list = (q: string) => get(`/users?${q}`);

    const search = await list("q=_list&sort=name");
    expect(search.body.data.items.map((u: any) => u.username)).toEqual(["amy_list", "bob_list", "zed_list"]);
    expect(search.body.data.total).toBe(3);

    const page = await list("q=_list&sort=name&pageSize=2&page=2");
    expect(page.body.data.items.map((u: any) => u.username)).toEqual(["zed_list"]);
    expect(page.body.data.total).toBe(3);

    const admins = await list("q=_list&filter=admins");
    expect(admins.body.data.items.map((u: any) => u.username)).toEqual(["amy_list"]);

    // near their limit: bob stored 0.95 GB of the 1 GB free tier
    const File = mongoose.model("XenDriveFile");
    await File.create({
      owner_id: c.user._id,
      name: "big.bin",
      storage_path: "x/big",
      mimeType: "application/octet-stream",
      size: 1024 ** 3 * 0.95,
    });
    const near = await list("q=_list&filter=near_quota");
    expect(near.body.data.items.map((u: any) => u.username)).toEqual(["bob_list"]);
    expect(near.body.data.items[0].storage).toMatchObject({ files: 1, allowed: 1024 ** 3 });

    // gem buyers
    await mongoose.model("GemPurchase").create({
      user: a.user._id,
      itemId: "gems-1000",
      gems: 1000,
      amountCents: 500,
      currency: "USD",
      provider: "stripe",
      status: "completed",
      completedAt: new Date(),
    });
    const buyers = await list("q=_list&filter=buyers");
    expect(buyers.body.data.items.map((u: any) => u.username)).toEqual(["zed_list"]);

    const fresh = await list("q=_list&filter=new");
    expect(fresh.body.data.total).toBe(3);
    void b;
  });

  it("shows one person with their storage, items and purchases", async () => {
    const u = await createUser({ username: "detail_user", gems: 250, xendrive: { spaceAllowed: 2 * 1024 ** 3 } });
    await mongoose.model("XenDriveFile").create({
      owner_id: u.user._id,
      name: "a.png",
      storage_path: "x/a",
      mimeType: "image/png",
      size: 1000,
      source: { app: "chat", ref: "c1" },
    });
    await mongoose.model("GemPurchase").create({
      user: u.user._id,
      itemId: "gems-2200",
      gems: 2200,
      amountCents: 1000,
      currency: "USD",
      provider: "stripe",
      status: "completed",
      completedAt: new Date(),
    });
    const res = await get(`/users/${id(u)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      username: "detail_user",
      gems: 250,
      extraSpace: 2 * 1024 ** 3,
      appBytes: 1000,
      purchases: { count: 1, gems: 2200 },
    });
    expect(res.body.data.user.storage.allowed).toBe(3 * 1024 ** 3);
    expect((await get(`/users/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });

  it("audits role and storage changes with before and after, and won't let you drop your own admin role", async () => {
    const u = await createUser({ username: "roles_user" });
    await send("put", `/users/${id(u)}`, { roles: ["user", "admin"] });
    await send("put", `/users/${id(u)}`, { xendriveQuota: 5 * 1024 ** 3 });
    const rows = await audit({ "target.id": id(u) });
    expect(rows.map((r) => r.action)).toEqual(["role_change", "storage_change"]);
    expect(rows[0]).toMatchObject({
      category: "Roles",
      admin_name: "boss",
      meta: { before: [], after: ["user", "admin"] },
    });
    expect(rows[1].detail).toContain("5.00 GB");

    const self = await send("put", `/users/${id(adminUser)}`, { roles: ["user"] });
    expect(self.status).toBe(400);
    // an unchanged save writes nothing
    await send("put", `/users/${id(u)}`, { roles: ["user", "admin"] });
    expect(await audit({ "target.id": id(u) })).toHaveLength(2);
  });

  it("deletes a person only when their username is typed, and logs it", async () => {
    const u = await createUser({ username: "doomed" });
    expect((await send("delete", `/users/${id(u)}`, { confirm: "nope" })).status).toBe(400);
    expect(await mongoose.model("User").countDocuments({ _id: u.user._id })).toBe(1);
    expect((await send("delete", `/users/${id(u)}`, { confirm: "doomed" })).status).toBe(200);
    expect(await mongoose.model("User").countDocuments({ _id: u.user._id })).toBe(0);
    expect((await audit({ action: "user_delete" }))[0]).toMatchObject({
      category: "Danger",
      target: { label: "doomed" },
    });
    expect((await send("delete", `/users/${id(adminUser)}`, { confirm: "boss" })).status).toBe(400);
  });

  it("adjusts gems only with a reason, never below zero, and logs it", async () => {
    const u = await createUser({ username: "gems_user", gems: 100 });
    expect((await send("post", `/users/${id(u)}/gems`, { amount: 50, reason: "" })).status).toBe(400);
    expect((await send("post", `/users/${id(u)}/gems`, { amount: 0, reason: "nothing" })).status).toBe(400);
    const up = await send("post", `/users/${id(u)}/gems`, { amount: 500, reason: "Refund for failed purchase" });
    expect(up.body.data.gems).toBe(600);
    expect((await send("post", `/users/${id(u)}/gems`, { amount: -700, reason: "too much" })).status).toBe(400);
    expect(
      (await send("post", `/users/${id(u)}/gems`, { amount: -200, reason: "Duplicate credit" })).body.data.gems,
    ).toBe(400);
    const rows = await audit({ action: "gem_adjust" });
    expect(rows.map((r) => r.detail)).toEqual([
      "+500 gems. Reason: Refund for failed purchase",
      "-200 gems. Reason: Duplicate credit",
    ]);
  });

  it("logs giving and removing items", async () => {
    const u = await createUser({ username: "items_user" });
    expect((await send("post", `/users/${id(u)}/give-item`, { itemKey: "golden-badge" })).status).toBe(200);
    expect((await send("delete", `/users/${id(u)}/inventory/golden-badge`)).status).toBe(200);
    expect((await audit({ "target.id": id(u) })).map((r) => r.action)).toEqual(["item_give", "item_remove"]);
  });
});

describe("overview, storage and money", () => {
  it("summarises people, storage, purchases and what needs attention", async () => {
    await mongoose.model("ScheduledTask").create({
      task_type: "xensplit:recurring-expense",
      run_at: new Date(),
      anchor_date: new Date(),
      enabled: true,
      last_error: "Currency rate unavailable",
    });
    const buyer = await createUser({ username: "overview_buyer" });
    const hourAgo = new Date(Date.now() - 3 * 3_600_000);
    await mongoose.model("GemPurchase").create({
      user: buyer.user._id,
      itemId: "gems-2200",
      gems: 2200,
      amountCents: 1000,
      currency: "USD",
      provider: "stripe",
      status: "pending",
      createdAt: hourAgo,
    });
    const res = await get("/overview");
    const o = res.body.data.overview;
    expect(o.people.total).toBeGreaterThan(3);
    expect(o.people.signupsByDay).toHaveLength(30);
    expect(o.people.new7).toBeGreaterThan(0);
    expect(o.tasks).toMatchObject({ failing: 1 });
    expect(o.money.pending).toBeGreaterThanOrEqual(1);
    const keys = o.attention.map((a: any) => a.key);
    expect(keys).toContain("tasks");
    expect(keys).toContain("purchase");
    expect(o.attention.find((a: any) => a.key === "tasks").detail).toContain("Currency rate unavailable");
    expect(Array.isArray(o.storage.byApp)).toBe(true);
  });

  it("reports storage by app, the largest drives and housekeeping", async () => {
    const u = await createUser({ username: "storage_big" });
    const File = mongoose.model("XenDriveFile");
    await File.create({ owner_id: u.user._id, name: "a", storage_path: "s/a", mimeType: "x/y", size: 4000 });
    await File.create({
      owner_id: u.user._id,
      name: "b",
      storage_path: "s/b",
      mimeType: "x/y",
      size: 1000,
      source: { app: "chat", ref: "r" },
    });
    await File.create({
      owner_id: new mongoose.Types.ObjectId(),
      name: "orphan",
      storage_path: "s/o",
      mimeType: "x/y",
      size: 10,
    });
    const res = await get("/storage");
    const r = res.body.data.report;
    expect(r.byApp.find((x: any) => x.key === "drive").bytes).toBeGreaterThanOrEqual(4010);
    expect(r.byApp.find((x: any) => x.key === "chat").bytes).toBeGreaterThanOrEqual(1000);
    expect(r.top.find((x: any) => x.username === "storage_big")).toMatchObject({ used: 5000, appBytes: 1000 });
    expect(r.housekeeping.orphanedFiles).toBeGreaterThanOrEqual(1);
  });

  it("lists purchases by status with a summary and the shop catalogue", async () => {
    const u = await createUser({ username: "money_user" });
    const P = mongoose.model("GemPurchase");
    await P.create({
      user: u.user._id,
      itemId: "gems-1000",
      gems: 1000,
      amountCents: 500,
      currency: "USD",
      provider: "stripe",
      status: "completed",
      completedAt: new Date(),
    });
    await P.create({
      user: u.user._id,
      itemId: "gems-1000",
      gems: 1000,
      amountCents: 500,
      currency: "USD",
      provider: "stripe",
      status: "failed",
    });
    const failed = (await get("/purchases?status=failed")).body.data.report;
    expect(failed.purchases.items.every((p: any) => p.status === "failed")).toBe(true);
    expect(failed.purchases.items[0].user.username).toBe("money_user");
    const all = (await get("/purchases")).body.data.report;
    expect(all.summary.cents30).toBeGreaterThanOrEqual(500);
    expect(all.summary.failed30).toBeGreaterThanOrEqual(1);
    expect(all.catalogue.length).toBeGreaterThan(0);
    expect(all.catalogue.some((c: any) => c.price.startsWith("$"))).toBe(true);
  });
});

describe("messaging", () => {
  it("sends to an audience on chosen channels, reports reach, and logs it", async () => {
    const [a, b] = [
      await createUser({ username: "note_a" }),
      await createUser({ username: "note_b", roles: ["tester"] }),
    ];
    const Notification = mongoose.model("Notification");

    const reach = await get("/notify/reach?type=role&role=tester");
    expect(reach.body.data).toEqual({ people: 1, pushDevices: 0 });

    const res = await send("post", "/notify", {
      audience: { type: "role", role: "tester" },
      title: "Hello testers",
      message: "Body",
      channels: ["inapp"],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ people: 1, inapp: 1 });
    expect(await Notification.countDocuments({ userId: b.user._id, title: "Hello testers" })).toBe(1);
    expect(await Notification.countDocuments({ userId: a.user._id, title: "Hello testers" })).toBe(0);

    const one = await send("post", "/notify", {
      audience: { type: "users", userIds: [id(a)] },
      title: "Just you",
      message: "Hi",
      channels: ["inapp", "socket"],
    });
    expect(one.status).toBe(200);
    const rows = await audit({ action: "notify_send" });
    expect(rows).toHaveLength(2);
    expect(rows[1].target).toMatchObject({ type: "user", label: "note_a" });
    expect(rows[1].detail).toContain("in-app, live");
    expect((await get("/broadcasts")).body.data.items[0].meta.title).toBe("Just you");
  });

  it("refuses an empty audience and a message with no way to send it", async () => {
    const empty = await send("post", "/notify", {
      audience: { type: "role", role: "nobody-has-this" },
      title: "x",
      message: "y",
      channels: ["inapp"],
    });
    expect(empty.status).toBe(400);
    const noChannel = await send("post", "/notify", {
      audience: { type: "everyone" },
      title: "x",
      message: "y",
      channels: [],
    });
    expect(noChannel.status).toBe(400);
  });
});

describe("system", () => {
  it("reports health, migrations, tasks and large documents, and toggles a task with a log", async () => {
    await mongoose.connection
      .collection("migrations")
      .insertOne({ name: "1-test-migration", state: "up", createdAt: new Date(), updatedAt: new Date() });
    const task = await mongoose
      .model("ScheduledTask")
      .create({ task_type: "xenroutine:reminders", run_at: new Date(), anchor_date: new Date(), enabled: true });
    const res = await get("/system");
    const r = res.body.data.report;
    expect(r.health.database.connected).toBe(true);
    expect(r.migrations.some((m: any) => m.name === "1-test-migration" && m.state === "up")).toBe(true);
    expect(r.tasks.some((x: any) => x._id === String(task._id))).toBe(true);
    expect(Array.isArray(r.documents)).toBe(true);

    expect((await send("put", `/tasks/${task._id}`, { enabled: false })).status).toBe(200);
    expect((await mongoose.model("ScheduledTask").findById(task._id).lean<any>()).enabled).toBe(false);
    expect((await audit({ action: "task_toggle" }))[0].detail).toContain("Turned off");
  });

  it("deletes every chat only when DELETE is sent, and logs the counts", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = await mongoose.model("Conversation").create({
      rosterKey: [id(a), id(b)].sort().join(","),
      members: [
        { user_id: id(a), role: "owner" },
        { user_id: id(b), role: "member" },
      ],
      seq: 1,
    });
    await mongoose.model("Message").create({ conversationId: chat._id, seq: 1, from: id(a), body: "hi" });

    expect((await send("delete", "/chats", { confirm: "delete" })).status).toBe(400);
    expect(await mongoose.model("Conversation").countDocuments({})).toBeGreaterThan(0);
    const done = await send("delete", "/chats", { confirm: "DELETE" });
    expect(done.status).toBe(200);
    expect(await mongoose.model("Conversation").countDocuments({})).toBe(0);
    expect(await mongoose.model("Message").countDocuments({})).toBe(0);
    expect((await audit({ action: "chats_delete_all" }))[0].detail).toMatch(
      /Deleted \d+ conversations and \d+ messages/,
    );
  });
});

describe("audit log", () => {
  it("filters by category, text, person and age, newest first", async () => {
    const u = await createUser({ username: "audit_target" });
    await send("post", `/users/${id(u)}/give-item`, { itemKey: "golden-badge" });
    await send("post", `/users/${id(u)}/gems`, { amount: 10, reason: "Goodwill refund" });
    await send("put", `/users/${id(u)}`, { roles: ["user", "admin"] });

    const all = (await get("/audit")).body.data;
    expect(all.items.map((e: any) => e.action)).toEqual(["role_change", "gem_adjust", "item_give"]);
    expect(all.items[0].admin.username).toBe("boss");

    expect((await get("/audit?category=Gems")).body.data.items).toHaveLength(1);
    expect((await get("/audit?q=goodwill")).body.data.items[0].action).toBe("gem_adjust");
    expect((await get(`/audit?targetId=${id(u)}`)).body.data.total).toBe(3);
    expect((await get("/audit?days=1")).body.data.total).toBe(3);
    expect((await get("/audit?pageSize=2&page=2")).body.data.items).toHaveLength(1);
  });
});
