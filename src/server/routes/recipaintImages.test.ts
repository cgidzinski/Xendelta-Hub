import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { bucketView } from "../testing/storage";
import { publicUrlFor } from "../storage";

// Recipaint images and their thumbnails: the server deletes what an edit or a delete lets go of, unless another recipe
// still uses it, and a clone gets its own copies. Real routes and Mongo; the public bucket is in memory.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./recipaint.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const pub = bucketView("public");
beforeEach(() => pub.clear());

type U = Awaited<ReturnType<typeof createUser>>;
const as = (u: U) => ({ Authorization: `Bearer ${u.token}` });

/** An uploaded image: the original and its thumbnail in the bucket, and its public URL. */
const image = (name: string) => {
  pub.add(`recipaint-assets/${name}.jpg`);
  pub.add(`recipaint-assets/thumbs/${name}.webp`);
  return publicUrlFor(`recipaint-assets/${name}.jpg`);
};
const stored = (name: string) =>
  pub.has(`recipaint-assets/${name}.jpg`) && pub.has(`recipaint-assets/thumbs/${name}.webp`);
const gone = (name: string) =>
  !pub.has(`recipaint-assets/${name}.jpg`) && !pub.has(`recipaint-assets/thumbs/${name}.webp`);

const create = async (who: U, body: object) => {
  const res = await request(t.app)
    .post("/api/recipaint")
    .set(as(who))
    .send({ title: "Mini", isPublic: true, ...body });
  expect(res.status).toBe(200);
  return (res.body.data.recipe ?? res.body.data)._id as string;
};
const step = (index: number, images: string[]) => ({ index, stepName: `Step ${index}`, images, paints: [] });

describe("Recipaint images", () => {
  it("deletes images an edit removes, including a whole deleted step's", async () => {
    const me = await createUser();
    const [cover, a, b, keep] = [image("cover"), image("a"), image("b"), image("keep")];
    const id = await create(me, { showcase: [cover], steps: [step(0, [a, b]), step(1, [keep])] });

    const res = await request(t.app)
      .put(`/api/recipaint/${id}`)
      .set(as(me))
      .send({ showcase: [], steps: [step(0, [keep])] });
    expect(res.status).toBe(200);
    expect(gone("cover") && gone("a") && gone("b")).toBe(true);
    expect(stored("keep")).toBe(true);
  });

  it("gives a clone its own copies, so deleting either recipe leaves the other's images", async () => {
    const [me, you] = [await createUser(), await createUser()];
    const id = await create(me, { showcase: [image("orig")], steps: [] });

    const cloned = await request(t.app).post(`/api/recipaint/${id}/clone`).set(as(you));
    expect(cloned.status).toBe(200);
    const clone = cloned.body.data.recipe;
    expect(clone.showcase).toHaveLength(1);
    expect(clone.showcase[0]).not.toBe(publicUrlFor("recipaint-assets/orig.jpg"));
    const copyName = clone.showcase[0]
      .split("/")
      .pop()
      .replace(/\.jpg$/, "");
    expect(stored(copyName)).toBe(true);

    expect((await request(t.app).delete(`/api/recipaint/${clone._id}`).set(as(you))).status).toBe(200);
    expect(gone(copyName)).toBe(true);
    expect(stored("orig")).toBe(true);
  });

  it("keeps an image another recipe still uses (recipes cloned before clones got copies)", async () => {
    const me = await createUser();
    const shared = image("shared");
    const first = await create(me, { showcase: [shared] });
    await create(me, { title: "Old clone", showcase: [shared] });

    expect((await request(t.app).delete(`/api/recipaint/${first}`).set(as(me))).status).toBe(200);
    expect(stored("shared")).toBe(true);
  });

  it("no longer lets anyone delete an image by its URL", async () => {
    const me = await createUser();
    const url = image("victim");
    const res = await request(t.app)
      .delete(`/api/recipaint/asset?assetUrl=${encodeURIComponent(url)}`)
      .set(as(me));
    expect(res.status).not.toBe(200);
    expect(stored("victim")).toBe(true);
  });
});
