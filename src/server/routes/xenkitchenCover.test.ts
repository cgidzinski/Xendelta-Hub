import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { bucketView } from "../testing/storage";
import { memoryStores } from "../storage";
import { FileRecord } from "../models/fileRecord";
import { XenKitchenBook } from "../models/xenKitchen";

// A recipe book's cover: a private XenDrive file in its own folder, cropped to square, changed by editors, shown through a
// signed link on the books list and on a shared book, and removed with the book. Real routes, models and Mongo.
const priv = bucketView("private");
vi.mock("../utils/storageUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  generateSignedUrl: vi.fn(async (path: string) => `https://example.test/signed/${path}`),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([
    () => import("./xenkitchen.js"),
    () => import("./xendrive.js"),
    () => import("./storage.js"),
  ]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => priv.clear());

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const picture = (width = 900, height = 500) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } } })
    .png()
    .toBuffer();

async function setup() {
  const owner = await createUser();
  const bookId = (await request(t.app).get("/api/xenkitchen/books").set(as(owner))).body.data.books[0]._id as string;
  const addMember = async (role: "editor" | "viewer") => {
    const person = await createUser();
    const added = await request(t.app)
      .post(`/api/xenkitchen/books/${bookId}/members`)
      .set(as(owner))
      .send({ userIds: [person.user._id.toString()], role });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    return person;
  };
  const putCover = async (who: U, id = bookId, body?: Buffer) =>
    request(t.app)
      .put(`/api/xenkitchen/books/${id}/cover`)
      .set(as(who))
      .attach("image", body ?? (await picture()), { filename: "cover.png", contentType: "image/png" });
  const books = async (who: U) => (await request(t.app).get("/api/xenkitchen/books").set(as(who))).body.data.books;
  return { owner, bookId, addMember, putCover, books };
}

describe("XenKitchen book covers", () => {
  it("starts without a cover", async () => {
    const { owner, books } = await setup();
    expect((await books(owner))[0].cover_url).toBeNull();
  });

  it("stores a square cover in the book's own folder, shown by signed link", async () => {
    const { owner, bookId, putCover, books } = await setup();
    const res = await putCover(owner);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.book.cover_url).toMatch(
      new RegExp(`^https://example\\.test/signed/xenkitchen-book/${bookId}/`),
    );
    expect((await books(owner))[0].cover_url).toBe(res.body.data.book.cover_url);

    const files = await FileRecord.find({ "space.app": "xenkitchen-book", "space.ref": bookId });
    expect(files).toHaveLength(1);
    expect(files[0].space?.ref).toBe(bookId);
    const stored = memoryStores().privateStore.objects.get(files[0].key)!.body as Buffer;
    const meta = await sharp(stored).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([600, 600, "webp"]);
  });

  it("replaces the cover and removes the old file", async () => {
    const { owner, bookId, putCover } = await setup();
    await putCover(owner);
    const second = await putCover(owner);
    expect(second.status).toBe(200);
    expect(await FileRecord.countDocuments({ "space.app": "xenkitchen-book", "space.ref": bookId })).toBe(1);
    expect(priv.size).toBe(1);
  });

  it("lets an editor change it but not a viewer or a stranger", async () => {
    const { bookId, addMember, putCover, books, owner } = await setup();
    const editor = await addMember("editor");
    const viewer = await addMember("viewer");
    const stranger = await createUser();

    expect((await putCover(editor)).status).toBe(200);
    expect((await putCover(viewer)).status).toBe(403);
    expect((await putCover(stranger)).status).toBe(404);
    // Viewers still see it.
    expect((await books(viewer))[0].cover_url).toMatch(/xenkitchen-book/);

    const removed = await request(t.app).delete(`/api/xenkitchen/books/${bookId}/cover`).set(as(viewer));
    expect(removed.status).toBe(403);
    expect((await books(owner))[0].cover_url).not.toBeNull();
  });

  it("removes the cover and its file", async () => {
    const { owner, bookId, putCover, books } = await setup();
    await putCover(owner);
    const res = await request(t.app).delete(`/api/xenkitchen/books/${bookId}/cover`).set(as(owner));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.book.cover_url).toBeNull();
    expect((await books(owner))[0].cover_url).toBeNull();
    expect(priv.size).toBe(0);
    expect(await FileRecord.countDocuments({ "space.app": "xenkitchen-book", "space.ref": bookId })).toBe(0);
  });

  it("refuses a missing or unreadable image", async () => {
    const { owner, bookId, putCover } = await setup();
    const none = await request(t.app).put(`/api/xenkitchen/books/${bookId}/cover`).set(as(owner));
    expect(none.status).toBe(400);
    const junk = await putCover(owner, bookId, Buffer.from("not an image"));
    expect(junk.status).toBe(400);
    expect(priv.size).toBe(0);
  });

  it("rejects a malformed book id", async () => {
    const { owner, putCover } = await setup();
    expect((await putCover(owner, "nope")).status).toBe(400);
  });

  it("is on the shared book page", async () => {
    const { owner, bookId, putCover } = await setup();
    await putCover(owner);
    const shared = await request(t.app).post(`/api/xenkitchen/books/${bookId}/share`).set(as(owner));
    expect(shared.status, JSON.stringify(shared.body)).toBe(200);
    const token = shared.body.data.book.share.token;
    const page = await request(t.app).get(`/api/xenkitchen/public/book/${token}`);
    expect(page.status).toBe(200);
    expect(page.body.data.book.cover_url).toMatch(/xenkitchen-book/);
  });

  it("is deleted with the book", async () => {
    const { owner, bookId, putCover } = await setup();
    // A second book, so the first can be deleted.
    await request(t.app).post("/api/xenkitchen/books").set(as(owner)).send({ name: "Spare" });
    await putCover(owner);
    const gone = await request(t.app).delete(`/api/xenkitchen/books/${bookId}`).set(as(owner));
    expect(gone.status, JSON.stringify(gone.body)).toBe(200);
    expect(priv.size).toBe(0);
    expect(await FileRecord.countDocuments({ "space.app": "xenkitchen-book", "space.ref": bookId })).toBe(0);
    expect(await XenKitchenBook.findById(bookId)).toBeNull();
  });
});
