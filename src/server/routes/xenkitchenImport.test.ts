import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { AppError } from "../utils/http";
import { XenDriveFile } from "../models/xendriveFile";

// Importing a recipe from a web address: the routes, the item's source link and the photo copied from the page. The
// fetching itself (which addresses are allowed) is tested in utils/safeFetch.test.ts; here it is replaced by canned pages.
const { pages, images } = vi.hoisted(() => ({
  pages: new Map<string, { url?: string; html: string } | Error>(),
  images: new Map<string, { body: Buffer; contentType: string } | Error>(),
}));
vi.mock("../utils/safeFetch", () => ({
  fetchPublicPage: async (url: string) => {
    const page = pages.get(url);
    if (!page) throw new AppError(400, "Couldn't reach that address");
    if (page instanceof Error) throw page;
    return { url: page.url ?? url, body: Buffer.from(page.html), contentType: "text/html" };
  },
  fetchPublicImage: async (url: string) => {
    const image = images.get(url);
    if (!image) throw new AppError(400, "Couldn't reach that address");
    if (image instanceof Error) throw image;
    return { url, ...image };
  },
}));

const { priv } = vi.hoisted(() => ({ priv: new Set<string>() }));
vi.mock("../config/gcs", () => {
  const bucket = (name: string, set: Set<string>) => ({
    name,
    file: (path: string) => ({ path, set, getMetadata: async () => [{ size: "42", contentType: "image/webp" }] }),
  });
  return { privateBucket: bucket("private", priv), publicBucket: bucket("public", new Set()) };
});
vi.mock("../utils/gcsUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  uploadToGCS: vi.fn(async (_b: Buffer, path: string) => void priv.add(path)),
  deleteFromGCS: vi.fn(async (path: string) => void priv.delete(path)),
  generateSignedUrl: vi.fn(async (path: string) => `https://example.test/signed/${path}`),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xenkitchen.js"), () => import("./xendrive.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  pages.clear();
  images.clear();
  priv.clear();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const recipePage = (extra: object = {}) =>
  `<html><script type="application/ld+json">${JSON.stringify({
    "@type": "Recipe",
    name: "Pancakes",
    recipeYield: "4",
    prepTime: "PT10M",
    cookTime: "PT15M",
    recipeIngredient: ["1 1/2 cups flour", "2 eggs"],
    recipeInstructions: ["Mix.", "Fry."],
    image: "https://img.example.com/pancakes.png",
    ...extra,
  })}</script></html>`;

const importUrl = (who: { token: string }, url: string) =>
  request(t.app).post("/api/xenkitchen/import-url").set(auth(who.token)).send({ url });
const bookFor = async (who: { token: string }) =>
  (await request(t.app).get("/api/xenkitchen/books").set(auth(who.token))).body.data.books[0]._id as string;

describe("importing a recipe from a web address", () => {
  it("returns the recipe for review, and saves nothing", async () => {
    const me = await createUser();
    pages.set("https://food.example.com/pancakes", { html: recipePage() });
    const res = await importUrl(me, "https://food.example.com/pancakes");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.recipe).toMatchObject({
      title: "Pancakes",
      servings: 4,
      prep_minutes: 10,
      cook_minutes: 15,
      source_url: "https://food.example.com/pancakes",
      image_url: "https://img.example.com/pancakes.png",
    });
    expect(res.body.data.recipe.ingredients[0]).toMatchObject({ quantity: "1 1/2", unit: "cups", name: "flour" });
    expect(res.body.data.recipe.steps.map((s: any) => s.text)).toEqual(["Mix.", "Fry."]);
    const items = await request(t.app).get("/api/xenkitchen/items").set(auth(me.token));
    expect(items.body.data.items).toHaveLength(0);
  });

  it("uses the address the page ended up at (after redirects) as the source", async () => {
    const me = await createUser();
    pages.set("https://short.example.com/x", { url: "https://food.example.com/real/pancakes", html: recipePage() });
    const res = await importUrl(me, "https://short.example.com/x");
    expect(res.body.data.recipe.source_url).toBe("https://food.example.com/real/pancakes");
  });

  it("says so when the page has no recipe (422), and passes on why a page couldn't be fetched", async () => {
    const me = await createUser();
    pages.set("https://blog.example.com/post", { html: "<html><body>Just a post</body></html>" });
    const none = await importUrl(me, "https://blog.example.com/post");
    expect(none.status).toBe(422);
    expect(none.body.message).toMatch(/Couldn't find a recipe/);

    pages.set("https://internal.example.com/", new AppError(400, "That address isn't allowed"));
    const blocked = await importUrl(me, "https://internal.example.com/");
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toBe("That address isn't allowed");
    expect((await importUrl(me, "https://nowhere.example.com/")).body.message).toBe("Couldn't reach that address");
  });

  it("needs sign-in and a web address", async () => {
    const me = await createUser();
    expect((await request(t.app).post("/api/xenkitchen/import-url").send({ url: "https://a.example" })).status).toBe(
      401,
    );
    expect((await request(t.app).post("/api/xenkitchen/import-url").set(auth(me.token)).send({})).status).toBe(400);
    expect((await importUrl(me, "")).status).toBe(400);
    expect((await importUrl(me, "x".repeat(3000))).status).toBe(400);
  });

  it("is limited per person", async () => {
    const [busy, other] = await Promise.all([createUser(), createUser()]);
    pages.set("https://food.example.com/p", { html: recipePage() });
    const codes: number[] = [];
    for (let i = 0; i < 14; i++) codes.push((await importUrl(busy, "https://food.example.com/p")).status);
    expect(codes.slice(0, 12).every((c) => c === 200)).toBe(true);
    expect(codes.slice(12)).toEqual([429, 429]);
    // someone else is not held back by it
    expect((await importUrl(other, "https://food.example.com/p")).status).toBe(200);
  });
});

describe("the source link on an item", () => {
  it("is saved with the item, shown on it and on a shared page, and copied with a duplicate", async () => {
    const me = await createUser();
    const book = await bookFor(me);
    const created = await request(t.app)
      .post("/api/xenkitchen/items")
      .set(auth(me.token))
      .send({ book_id: book, title: "Pancakes", source_url: "https://food.example.com/pancakes" });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const id = created.body.data.item._id;
    expect(created.body.data.item.source_url).toBe("https://food.example.com/pancakes");

    const shared = await request(t.app).post(`/api/xenkitchen/items/${id}/share`).set(auth(me.token));
    const token = shared.body.data.item.share.token;
    const pub = await request(t.app).get(`/api/xenkitchen/public/${token}`);
    expect(pub.body.data.item.source_url).toBe("https://food.example.com/pancakes");
  });

  it("only takes a web address (or nothing)", async () => {
    const me = await createUser();
    const book = await bookFor(me);
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "ftp://x.example/y", "not a url"]) {
      const res = await request(t.app)
        .post("/api/xenkitchen/items")
        .set(auth(me.token))
        .send({ book_id: book, title: "x", source_url: bad });
      expect(res.status, bad).toBe(400);
    }
    const none = await request(t.app)
      .post("/api/xenkitchen/items")
      .set(auth(me.token))
      .send({ book_id: book, title: "y", source_url: "" });
    expect(none.status).toBe(200);
    expect(none.body.data.item.source_url).toBe("");
    // and it can be removed again
    const cleared = await request(t.app)
      .put(`/api/xenkitchen/items/${none.body.data.item._id}`)
      .set(auth(me.token))
      .send({ source_url: "" });
    expect(cleared.status).toBe(200);
  });
});

describe("adding the page's photo to an item", () => {
  const makeItem = async (me: { token: string }) => {
    const book = await bookFor(me);
    const made = await request(t.app)
      .post("/api/xenkitchen/items")
      .set(auth(me.token))
      .send({ book_id: book, title: "Pancakes" });
    return made.body.data.item._id as string;
  };
  const addFrom = (who: { token: string }, id: string, url: string) =>
    request(t.app).post(`/api/xenkitchen/items/${id}/images/from-url`).set(auth(who.token)).send({ url });

  it("fetches it, stores it privately as the item's photo, and shows it", async () => {
    const me = await createUser();
    const id = await makeItem(me);
    images.set("https://img.example.com/pancakes.png", { body: PNG, contentType: "image/png" });

    const res = await addFrom(me, id, "https://img.example.com/pancakes.png");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.item.images).toHaveLength(1);
    expect(res.body.data.item.images[0].url).toMatch(/^https:\/\/example\.test\/signed\/xendrive\//);
    expect(priv.size).toBe(1);
    const files = await XenDriveFile.find({ "source.app": "xenkitchen", "source.ref": id });
    expect(files).toHaveLength(1);
    expect(files[0].counted).toBe(false);
    expect(files[0].name).toBe("pancakes.webp");
  });

  it("refuses what isn't a picture, and surfaces why a fetch failed", async () => {
    const me = await createUser();
    const id = await makeItem(me);
    images.set("https://img.example.com/broken.png", { body: Buffer.from("not an image"), contentType: "image/png" });
    const broken = await addFrom(me, id, "https://img.example.com/broken.png");
    expect(broken.status).toBe(400);
    expect(broken.body.message).toBe("Couldn't read that picture");

    images.set("https://img.example.com/blocked.png", new AppError(400, "That address isn't allowed"));
    expect((await addFrom(me, id, "https://img.example.com/blocked.png")).body.message).toBe(
      "That address isn't allowed",
    );
    expect(priv.size).toBe(0);
    const item = await request(t.app).get(`/api/xenkitchen/items/${id}`).set(auth(me.token));
    expect(item.body.data.item.images).toHaveLength(0);
  });

  it("is only for someone who can edit the item", async () => {
    const [me, stranger] = await Promise.all([createUser(), createUser()]);
    const id = await makeItem(me);
    images.set("https://img.example.com/pancakes.png", { body: PNG, contentType: "image/png" });
    expect((await addFrom(stranger, id, "https://img.example.com/pancakes.png")).status).toBe(404);
    expect(priv.size).toBe(0);
  });
});
