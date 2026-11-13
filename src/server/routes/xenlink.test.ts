import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { randomToken } from "../utils/tokens";
import { XenLink, createXenLink } from "../models/xenlink";

vi.mock("../utils/tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/tokens")>();
  return { ...actual, randomToken: vi.fn(actual.randomToken) };
});

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp([() => import("./xenlink.js")]);
}, 180_000);

afterAll(async () => {
  await t?.stop();
}, 60_000);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("xenlink", () => {
  it("persists an edit to a link (editing used to save nothing)", async () => {
    const { token } = await createUser();
    await request(t.app).post("/api/xenlink").set(auth(token)).send({ name: "Docs", url: "https://example.com/a" });

    const before = await request(t.app).get("/api/xenlink/list").set(auth(token));
    const link = before.body.data.links[0];
    expect(link.name).toBe("Docs");

    const put = await request(t.app)
      .put("/api/xenlink")
      .set(auth(token))
      .send({ _id: link._id, name: "Docs v2", url: "https://example.com/b" });
    expect(put.body.status).toBe(true);

    const after = await request(t.app).get("/api/xenlink/list").set(auth(token));
    expect(after.body.data.links).toHaveLength(1);
    expect(after.body.data.links[0]).toMatchObject({ name: "Docs v2", url: "https://example.com/b" });
  });

  it("refuses to edit someone else's link", async () => {
    const owner = await createUser();
    const other = await createUser();
    await request(t.app)
      .post("/api/xenlink")
      .set(auth(owner.token))
      .send({ name: "Mine", url: "https://example.com/m" });
    const list = await request(t.app).get("/api/xenlink/list").set(auth(owner.token));
    const link = list.body.data.links[0];

    const put = await request(t.app)
      .put("/api/xenlink")
      .set(auth(other.token))
      .send({ _id: link._id, name: "Hijacked", url: "https://evil.example" });
    expect(put.status).toBe(404);

    const after = await request(t.app).get("/api/xenlink/list").set(auth(owner.token));
    expect(after.body.data.links[0].name).toBe("Mine");
  });

  it("lists only the caller's own links", async () => {
    const ann = await createUser();
    const bob = await createUser();
    await request(t.app).post("/api/xenlink").set(auth(ann.token)).send({ name: "Ann's", url: "https://a.example" });
    await request(t.app).post("/api/xenlink").set(auth(bob.token)).send({ name: "Bob's", url: "https://b.example" });

    const list = await request(t.app).get("/api/xenlink/list").set(auth(ann.token));
    expect(list.body.data.links.map((l: { name: string }) => l.name)).toEqual(["Ann's"]);
    expect(list.body.data.links[0].owner_id).toBeUndefined();
  });

  it("deletes your own link and refuses to delete someone else's", async () => {
    const owner = await createUser();
    const other = await createUser();
    await request(t.app).post("/api/xenlink").set(auth(owner.token)).send({ name: "Keep", url: "https://k.example" });
    const link = (await request(t.app).get("/api/xenlink/list").set(auth(owner.token))).body.data.links[0];

    const refused = await request(t.app).delete(`/api/xenlink/${link._id}`).set(auth(other.token));
    expect(refused.status).toBe(404);
    expect((await request(t.app).get("/api/xenlink/list").set(auth(owner.token))).body.data.links).toHaveLength(1);

    const ok = await request(t.app).delete(`/api/xenlink/${link._id}`).set(auth(owner.token));
    expect(ok.body.status).toBe(true);
    expect((await request(t.app).get("/api/xenlink/list").set(auth(owner.token))).body.data.links).toHaveLength(0);
    expect((await request(t.app).delete(`/api/xenlink/${link._id}`).set(auth(owner.token))).status).toBe(404);
  });

  it("redirects publicly without revealing the owner", async () => {
    const { token } = await createUser();
    await request(t.app).post("/api/xenlink").set(auth(token)).send({ name: "Go", url: "https://go.example" });
    const { slug } = (await request(t.app).get("/api/xenlink/list").set(auth(token))).body.data.links[0];

    const res = await request(t.app).get(`/api/xenlink/redirect/${slug}`);
    expect(res.body.data.link.url).toBe("https://go.example");
    expect(res.body.data.link.owner_id).toBeUndefined();
    expect((await request(t.app).get("/api/xenlink/redirect/nope")).status).toBe(404);
  });

  it("keeps creating links after one is deleted (slugs used to be count + 1 and collided)", async () => {
    const { token } = await createUser();
    for (const name of ["a", "b", "c"]) {
      await request(t.app)
        .post("/api/xenlink")
        .set(auth(token))
        .send({ name, url: `https://example.com/${name}` });
    }
    const list = await request(t.app).get("/api/xenlink/list").set(auth(token));
    const middle = list.body.data.links.find((l: { name: string }) => l.name === "b");
    const del = await request(t.app).delete(`/api/xenlink/${middle._id}`).set(auth(token));
    expect(del.body.status).toBe(true);

    const created = await request(t.app)
      .post("/api/xenlink")
      .set(auth(token))
      .send({ name: "d", url: "https://example.com/d" });
    expect(created.status).toBe(200);

    const after = await request(t.app).get("/api/xenlink/list").set(auth(token));
    const slugs = after.body.data.links.map((l: { slug: string }) => l.slug);
    expect(slugs).toHaveLength(3);
    expect(new Set(slugs).size).toBe(3);
  });

  it("resolves a link by its slug on the public redirect", async () => {
    const { token } = await createUser();
    await request(t.app).post("/api/xenlink").set(auth(token)).send({ name: "Go", url: "https://example.com/go" });
    const list = await request(t.app).get("/api/xenlink/list").set(auth(token));
    const { slug } = list.body.data.links[0];
    expect(slug).toMatch(/^[A-Za-z0-9_-]{8}$/);

    const res = await request(t.app).get(`/api/xenlink/redirect/${slug}`);
    expect(res.body.data.link.url).toBe("https://example.com/go");
  });

  it("retries with a new slug when the first one is taken", async () => {
    await XenLink.create({ name: "Existing", url: "https://example.com/e", slug: "taken-01" });
    vi.mocked(randomToken).mockReturnValueOnce("taken-01");

    const link = await createXenLink({ name: "New", url: "https://example.com/n" });
    expect(link.slug).not.toBe("taken-01");
    expect(await XenLink.countDocuments({ slug: link.slug })).toBe(1);
  });
});

// ---- #257: clicks, custom short names, expiry ----

const create = async (who: { token: string }, body: object) => {
  const res = await request(t.app).post("/api/xenlink").set(auth(who.token)).send(body);
  return res;
};
const mine = async (who: { token: string }) =>
  (await request(t.app).get("/api/xenlink/list").set(auth(who.token))).body.data.links as any[];
const click = (slug: string) => request(t.app).post(`/api/xenlink/click/${slug}`);
const stats = (who: { token: string }, id: string) =>
  request(t.app).get(`/api/xenlink/${id}/stats`).set(auth(who.token));

describe("what a link opens", () => {
  it("fills in https:// when it is missing, and keeps a full address as written", async () => {
    const me = await createUser();
    await create(me, { name: "Bare", url: "example.com/menu" });
    await create(me, { name: "Full", url: "http://example.com/a?b=1" });
    const links = await mine(me);
    expect(links.map((l) => l.url)).toEqual(["https://example.com/menu", "http://example.com/a?b=1"]);
  });

  it("refuses an address that isn't a web address, on create and on edit", async () => {
    const me = await createUser();
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "mailto:a@b.example",
      "has space.com",
    ]) {
      const res = await create(me, { name: "Bad", url: bad });
      expect(res.status, bad).toBe(400);
    }
    await create(me, { name: "Fine", url: "https://example.com" });
    const [link] = await mine(me);
    const edit = await request(t.app)
      .put("/api/xenlink")
      .set(auth(me.token))
      .send({ _id: link._id, name: "Fine", url: "javascript:alert(1)" });
    expect(edit.status).toBe(400);
    expect((await mine(me))[0].url).toBe("https://example.com");
  });
});

describe("custom short names", () => {
  it("can be chosen when a link is made, then work as the link's address", async () => {
    const me = await createUser();
    const made = await create(me, { name: "Menu", url: "https://example.com/menu", slug: "My-Menu" });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const [link] = await mine(me);
    expect(link.slug).toBe("my-menu"); // lower-cased
    const page = await request(t.app).get("/api/xenlink/redirect/my-menu");
    expect(page.body.data.link.url).toBe("https://example.com/menu");
  });

  it("is refused when it is taken, or isn't a readable name", async () => {
    const [ann, bob] = await Promise.all([createUser(), createUser()]);
    expect((await create(ann, { name: "A", url: "https://a.example", slug: "taken-name" })).status).toBe(200);
    const clash = await create(bob, { name: "B", url: "https://b.example", slug: "taken-name" });
    expect(clash.status).toBe(409);
    expect(clash.body.message).toBe("That short name is already taken");
    expect(await mine(bob)).toHaveLength(0);
    for (const bad of ["ab", "has space", "a/b", "-start", "x".repeat(41)]) {
      expect((await create(bob, { name: "B", url: "https://b.example", slug: bad })).status, bad).toBe(400);
    }
  });

  it("can be changed later, which stops the old one working", async () => {
    const me = await createUser();
    await create(me, { name: "Menu", url: "https://example.com", slug: "old-name" });
    const [link] = await mine(me);
    const edit = await request(t.app)
      .put("/api/xenlink")
      .set(auth(me.token))
      .send({ _id: link._id, name: "Menu", url: "https://example.com", slug: "new-name" });
    expect(edit.status).toBe(200);
    expect((await request(t.app).get("/api/xenlink/redirect/new-name")).status).toBe(200);
    expect((await request(t.app).get("/api/xenlink/redirect/old-name")).status).toBe(404);

    // leaving the name out keeps it; taking one that exists is refused and changes nothing
    await request(t.app)
      .put("/api/xenlink")
      .set(auth(me.token))
      .send({ _id: link._id, name: "Renamed", url: "https://example.com" });
    expect((await mine(me))[0]).toMatchObject({ slug: "new-name", name: "Renamed" });
    const other = await createUser();
    await create(other, { name: "O", url: "https://o.example", slug: "someone-elses" });
    const steal = await request(t.app)
      .put("/api/xenlink")
      .set(auth(me.token))
      .send({ _id: link._id, name: "Renamed", url: "https://example.com", slug: "someone-elses" });
    expect(steal.status).toBe(409);
    expect((await mine(me))[0].slug).toBe("new-name");
  });
});

describe("expiry", () => {
  it("stops a link working once its time has passed, and can be removed again", async () => {
    const me = await createUser();
    const past = new Date(Date.now() - 60_000).toISOString();
    await create(me, { name: "Gone", url: "https://example.com", slug: "short-lived", expiresAt: past });
    const [link] = await mine(me);
    expect(link.expires_at).toBe(past);

    const page = await request(t.app).get("/api/xenlink/redirect/short-lived");
    expect(page.status).toBe(410);
    expect(page.body.message).toBe("This link has expired");
    const go = await click("short-lived");
    expect(go.status).toBe(410);
    expect((await mine(me))[0].clicks).toBe(0); // not counted

    const future = new Date(Date.now() + 3_600_000).toISOString();
    await request(t.app)
      .put("/api/xenlink")
      .set(auth(me.token))
      .send({ _id: link._id, name: "Gone", url: "https://example.com", expiresAt: future });
    expect((await click("short-lived")).status).toBe(200);

    await request(t.app)
      .put("/api/xenlink")
      .set(auth(me.token))
      .send({ _id: link._id, name: "Gone", url: "https://example.com", expiresAt: null });
    expect((await mine(me))[0].expires_at).toBeUndefined();
    expect((await request(t.app).get("/api/xenlink/redirect/short-lived")).status).toBe(200);
  });

  it("is left alone by an edit that doesn't mention it, and a bad date is refused", async () => {
    const me = await createUser();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await create(me, { name: "Keep", url: "https://example.com", expiresAt: future });
    const [link] = await mine(me);
    await request(t.app)
      .put("/api/xenlink")
      .set(auth(me.token))
      .send({ _id: link._id, name: "Keep 2", url: "https://example.com" });
    expect((await mine(me))[0].expires_at).toBe(future);
    expect((await create(me, { name: "x", url: "https://example.com", expiresAt: "next tuesday-ish" })).status).toBe(
      400,
    );
  });
});

describe("clicks", () => {
  it("counts each click and answers with where to go", async () => {
    const me = await createUser();
    await create(me, { name: "Docs", url: "docs.example.com/start", slug: "docs-link" });
    const [link] = await mine(me);
    expect(link).toMatchObject({ clicks: 0 });

    const first = await click("docs-link");
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data.url).toBe("https://docs.example.com/start");
    await click("docs-link");
    await click("docs-link");

    const after = (await mine(me))[0];
    expect(after.clicks).toBe(3);
    expect(new Date(after.last_clicked_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("is not counted by just looking at the link's page, nor for a link that doesn't exist", async () => {
    const me = await createUser();
    await create(me, { name: "Look", url: "https://example.com", slug: "look-only" });
    await request(t.app).get("/api/xenlink/redirect/look-only");
    await request(t.app).get("/api/xenlink/redirect/look-only");
    expect((await mine(me))[0].clicks).toBe(0);
    expect((await click("no-such-link")).status).toBe(404);
  });

  it("won't send anyone to a stored address that isn't a web address, and doesn't count it", async () => {
    const me = await createUser();
    // Saved before addresses were checked: written straight to the database.
    const { XenLink } = await import("../models/xenlink.js");
    await XenLink.create({ name: "Old", url: "javascript:alert(1)", slug: "old-bad", owner_id: String(me.user._id) });
    const res = await click("old-bad");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("This link can't be opened");
    expect((await mine(me))[0].clicks).toBe(0);
  });

  it("shows the owner the total, the last click and a 30-day chart, and nobody else", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    await create(me, { name: "Chart", url: "https://example.com", slug: "chart-link" });
    const [link] = await mine(me);
    await Promise.all([click("chart-link"), click("chart-link"), click("chart-link")]); // at once: none lost

    const res = await stats(me, link._id);
    expect(res.status).toBe(200);
    expect(res.body.data.clicks).toBe(3);
    expect(res.body.data.lastClickedAt).toBeTruthy();
    expect(res.body.data.days).toHaveLength(30);
    expect(res.body.data.days.at(-1)).toEqual({ day: new Date().toISOString().slice(0, 10), n: 3 });
    expect(res.body.data.days.slice(0, -1).every((d: { n: number }) => d.n === 0)).toBe(true);
    const days = res.body.data.days.map((d: { day: string }) => d.day);
    expect([...days].sort()).toEqual(days); // oldest first

    expect((await stats(other, link._id)).status).toBe(404);
    expect((await request(t.app).get(`/api/xenlink/${link._id}/stats`)).status).toBe(401);
    expect((await stats(me, "not-an-id")).status).toBe(400);
  });

  it("keeps the counts private: the public page shows neither them nor the owner", async () => {
    const me = await createUser();
    await create(me, { name: "Private stats", url: "https://example.com", slug: "private-stats" });
    await click("private-stats");
    const page = (await request(t.app).get("/api/xenlink/redirect/private-stats")).body.data.link;
    expect(page).not.toHaveProperty("clicks");
    expect(page).not.toHaveProperty("owner_id");
    expect(page).not.toHaveProperty("last_clicked_at");
    expect(page).not.toHaveProperty("expires_at");
  });

  it("goes with the link when it is deleted", async () => {
    const me = await createUser();
    await create(me, { name: "Bye", url: "https://example.com", slug: "bye-link" });
    const [link] = await mine(me);
    await click("bye-link");
    await request(t.app).delete(`/api/xenlink/${link._id}`).set(auth(me.token));
    const { XenLinkDay } = await import("../models/xenlink.js");
    expect(await XenLinkDay.countDocuments({ link_id: link._id })).toBe(0);
  });
});

describe("click limit", () => {
  it("slows down a visitor who keeps clicking, without counting the refused ones", async () => {
    const me = await createUser();
    await create(me, { name: "Busy", url: "https://example.com", slug: "busy-link" });
    const codes: number[] = [];
    for (let i = 0; i < 70; i++) codes.push((await click("busy-link")).status);
    expect(codes).toContain(429);
    const counted = (await mine(me))[0].clicks;
    expect(counted).toBe(codes.filter((c) => c === 200).length);
    expect(counted).toBeLessThan(70);
  });
});
