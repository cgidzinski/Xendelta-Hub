import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// The Home feed end to end: events recorded by the real XenSplit / XenNote routes reach the right people, merge
// into entries, respect membership and prefs, and "needs attention" survives a provider that fails or hangs.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([
    () => import("./xensplit.js"),
    () => import("./xennote/index.js"),
    () => import("./xenroutine.js"),
    () => import("./feed/index.js"),
  ]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
type Who = Awaited<ReturnType<typeof createUser>>;
const call = (method: "get" | "post" | "put", url: string, who: Who) =>
  request(t.app)[method](url).set(auth(who.token));
const id = (w: Who) => w.user._id.toString();

async function group(owner: Who, members: Who[]) {
  const res = await call("post", "/api/xensplit/groups", owner).send({
    name: "Trip",
    default_currency: "CAD",
    memberIds: members.map(id),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body.data.group ?? res.body.data)._id as string;
}
async function expense(who: Who, groupId: string, everyone: Who[], title: string, amount = 10) {
  const res = await call("post", `/api/xensplit/groups/${groupId}/expenses`, who).send({
    paid_by: id(who),
    amount,
    currency: "CAD",
    title,
    date: new Date().toISOString(),
    split_type: "equal",
    splits: everyone.map((w) => ({ user_id: id(w) })),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}
const feed = async (who: Who, query = "") => (await call("get", `/api/feed${query}`, who)).body.data;

describe("Home feed", () => {
  it("tells the rest of the group, merges a burst, and leaves the actor out", async () => {
    const [a, b, c] = await Promise.all([createUser(), createUser(), createUser()]);
    const g = await group(a, [b, c]);
    await expense(a, g, [a, b, c], "Dinner", 30);
    await expense(a, g, [a, b, c], "Fuel", 20);

    const forB = await feed(b);
    const entries = forB.entries.filter((e: any) => e.verb === "xensplit.expense_created");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ count: 2, space: { label: "Trip" }, actor: { username: a.user.username } });
    expect(entries[0].data.total).toBe(50);
    expect(entries[0].ids).toHaveLength(2);

    expect((await feed(a)).entries.filter((e: any) => e.verb === "xensplit.expense_created")).toHaveLength(0);
  });

  it("stops showing a space's events to someone who left it", async () => {
    const [a, b, c] = await Promise.all([createUser(), createUser(), createUser()]);
    const g = await group(a, [b, c]);
    await expense(a, g, [a, b, c], "Hotel", 100);
    expect((await feed(c)).entries.length).toBeGreaterThan(0);

    await mongoose.model("XenSplit").updateOne({ _id: g }, { $pull: { members: c.user._id } });
    expect((await feed(c)).entries.filter((e: any) => e.space?.id === g)).toHaveLength(0);
    // B is still in the group and still sees the expense (and being added to it).
    expect((await feed(b)).entries.filter((e: any) => e.verb === "xensplit.expense_created")).toHaveLength(1);
  });

  it("hides entries and mutes apps and spaces", async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const g = await group(a, [b]);
    await expense(a, g, [a, b], "Taxi");

    const expenses = async () => (await feed(b)).entries.filter((e: any) => e.verb === "xensplit.expense_created");
    const first = (await expenses())[0];
    expect(first).toBeTruthy();

    const mute = await call("put", "/api/feed/prefs", b).send({ mutedApps: [], mutedSpaces: [`xensplit:${g}`] });
    expect(mute.status).toBe(200);
    expect((await feed(b)).entries.filter((e: any) => e.space?.id === g)).toHaveLength(0);

    await call("put", "/api/feed/prefs", b).send({ mutedApps: ["xensplit"], mutedSpaces: [] });
    expect((await feed(b)).entries.filter((e: any) => e.app === "xensplit")).toHaveLength(0);

    await call("put", "/api/feed/prefs", b).send({ mutedApps: [], mutedSpaces: [] });
    const hide = await call("post", "/api/feed/hide", b).send({ ids: first.ids });
    expect(hide.status).toBe(200);
    expect(await expenses()).toHaveLength(0);
  });

  it("pages by cursor without repeating or skipping entries", async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const g = await group(a, [b]);
    const Activity = mongoose.model("Activity");
    const now = Date.now();
    // Five events, each more than the merge window apart, so each is its own entry.
    await Activity.insertMany(
      [0, 1, 2, 3, 4].map((i) => ({
        actor: id(a),
        app: "xensplit",
        verb: "xensplit.expense_created",
        object: { type: "expense", id: `x${i}`, label: `E${i}` },
        space: { app: "xensplit", id: g, label: "Trip" },
        audienceIds: [id(b)],
        data: { amount: 1, currency: "CAD" },
        groupKey: `xensplit.expense_created:xensplit:${g}`,
        createdAt: new Date(now - i * 3 * 60 * 60 * 1000),
      })),
    );

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page: any = await feed(b, `?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...page.entries.map((e: any) => e.object.label));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen.filter((l) => /^E\d$/.test(l))).toEqual(["E0", "E1", "E2", "E3", "E4"]);
  });

  it("tells people they were added to a notebook, and shows new notes to its members", async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const nb = await call("post", "/api/xennote/notebooks", a).send({ name: "Cabin" });
    const notebookId = (nb.body.data.notebook ?? nb.body.data)._id;
    await call("post", `/api/xennote/notebooks/${notebookId}/members`, a).send({ userIds: [id(b)], role: "editor" });
    await call("post", "/api/xennote/notes", a).send({
      notebook_id: notebookId,
      type: "text",
      title: "Packing",
      body: "x",
    });

    const verbs = (await feed(b)).entries.map((e: any) => e.verb);
    expect(verbs).toContain("xennote.notebook_shared");
    expect(verbs).toContain("xennote.note_created");
  });

  it("validates the feed routes' input", async () => {
    const a = await createUser();
    expect((await call("get", "/api/feed?limit=999", a)).status).toBe(400);
    expect((await call("post", "/api/feed/hide", a).send({ ids: ["nope"] })).status).toBe(400);
    expect((await call("put", "/api/feed/prefs", a).send({ mutedApps: "x" })).status).toBe(400);
  });
});

describe("Needs attention", () => {
  it("reports overdue routines and sums them into the app's badge count", async () => {
    const a = await createUser();
    const res = await call("post", "/api/xenroutine/routines", a).send({
      name: "Replace filter",
      interval: { every: 3, unit: "months" },
      due_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    });
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    const out = (await call("get", "/api/feed/attention", a)).body.data;
    expect(out.cards.find((c: any) => c.key === "xenroutine:overdue")).toMatchObject({
      severity: "critical",
      count: 1,
    });
    expect(out.counts.xenroutine).toBe(1);
    // the quiet "how much is in the app" count is separate from the alert count
    expect(out.totals.xenroutine).toBe(1);
    expect(out.totals.xennote).toBe(0);
  });

  it("leaves out a provider that fails or hangs and still returns the rest", async () => {
    const { readAttention } = await import("../feed/attention.js");
    const ok = {
      key: "ok",
      fetch: async () => [{ key: "ok:1", app: "ok", severity: "info" as const, title: "Fine", link: "/", count: 2 }],
    };
    const boom = { key: "boom", fetch: async () => Promise.reject(new Error("nope")) };
    const hang = { key: "hang", fetch: () => new Promise<never>(() => undefined) };
    const out = await readAttention("u", [boom, hang, ok], 50);
    expect(out.cards.map((c) => c.key)).toEqual(["ok:1"]);
    expect(out.counts).toEqual({ ok: 2 });
  });

  it("puts the worst things first", async () => {
    const { readAttention } = await import("../feed/attention.js");
    const card = (key: string, severity: "critical" | "warning" | "info") => ({
      key,
      app: "x",
      severity,
      title: key,
      link: "/",
      count: 1,
    });
    const out = await readAttention(
      "u",
      [{ key: "p", fetch: async () => [card("i", "info"), card("c", "critical"), card("w", "warning")] }],
      50,
    );
    expect(out.cards.map((c) => c.key)).toEqual(["c", "w", "i"]);
  });
});
