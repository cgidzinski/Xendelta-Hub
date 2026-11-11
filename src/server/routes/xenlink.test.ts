import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

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
});
