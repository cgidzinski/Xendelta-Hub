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
