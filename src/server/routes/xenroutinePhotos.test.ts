import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { XenDriveFile } from "../models/xendriveFile";
import { XenRoutine } from "../models/xenRoutine";

// Photos and notes when a routine is marked done: private XenDrive files tagged to the routine, shown through signed
// links, shared with everyone on the routine, and removed with the photo, the routine, or the history entry they were on.
// Real routes, models and Mongo; only storage is faked, as an in-memory bucket.
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
  t = await startTestApp([() => import("./xenroutine.js"), () => import("./xendrive.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => priv.clear());

type U = Awaited<ReturnType<typeof createUser>>;
const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const make = async (who: U, extra: object = {}) => {
  const res = await request(t.app)
    .post("/api/xenroutine/routines")
    .set(as(who))
    .send({ name: "Replace water filter", interval: { every: 6, unit: "months" }, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.routine as { _id: string; due_at: string };
};
/** Mark done as a form, so it can carry photos. */
const doneWith = (
  who: U,
  id: string,
  opts: { note?: string; photos?: number; extra?: Record<string, string> } = {},
) => {
  let req = request(t.app).post(`/api/xenroutine/routines/${id}/complete`).set(as(who));
  if (opts.note !== undefined) req = req.field("note", opts.note);
  for (const [k, v] of Object.entries(opts.extra ?? {})) req = req.field(k, v);
  for (let i = 0; i < (opts.photos ?? 0); i++)
    req = req.attach("images", PNG, { filename: `p${i}.png`, contentType: "image/png" });
  // Nothing to put in a form: send the plain JSON the app sends.
  if (opts.note === undefined && !opts.photos && !Object.keys(opts.extra ?? {}).length) req = req.send({});
  return req;
};
const mine = async (who: U, id: string) =>
  (await request(t.app).get("/api/xenroutine/routines").set(as(who))).body.data.routines.find((r: any) => r._id === id);

describe("marking a routine done with a note and photos", () => {
  it("keeps the note and the photos on the history entry, shown by signed link", async () => {
    const me = await createUser();
    const r = await make(me);
    const res = await doneWith(me, r._id, { note: "Changed the cartridge", photos: 2 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const entry = res.body.data.routine.history[0];
    expect(entry).toMatchObject({ action: "done", note: "Changed the cartridge" });
    expect(entry.images).toHaveLength(2);
    expect(entry.images[0].url).toMatch(/^https:\/\/example\.test\/signed\/xendrive\//);
    expect(priv.size).toBe(2);

    // private XenDrive files owned by the person, tagged to the routine, not counted toward storage
    const files = await XenDriveFile.find({ owner_id: me.user._id, "source.app": "xenroutine" });
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.source?.ref === r._id && f.counted === false && f.mimeType === "image/webp")).toBe(
      true,
    );
    expect((await mine(me, r._id)).history[0].images).toHaveLength(2);
  });

  it("still takes a plain JSON 'done', and a form with only a note", async () => {
    const me = await createUser();
    const a = await make(me);
    const json = await request(t.app)
      .post(`/api/xenroutine/routines/${a._id}/complete`)
      .set(as(me))
      .send({ note: "json note", expected_due_at: a.due_at });
    expect(json.status).toBe(200);
    expect(json.body.data.routine.history[0]).toMatchObject({ note: "json note" });
    expect(json.body.data.routine.history[0]).not.toHaveProperty("images");

    const b = await make(me, { name: "Other" });
    const form = await doneWith(me, b._id, { note: "form note", extra: { expected_due_at: b.due_at } });
    expect(form.status, JSON.stringify(form.body)).toBe(200);
    expect(form.body.data.routine.history[0]).toMatchObject({ note: "form note" });
    expect(priv.size).toBe(0);
  });

  it("reads a form's text fields as the right types (occurrence is a number)", async () => {
    const me = await createUser();
    const r = await make(me);
    const ahead = await doneWith(me, r._id, { photos: 1, extra: { occurrence: "2", expected_due_at: r.due_at } });
    expect(ahead.status, JSON.stringify(ahead.body)).toBe(200);
    const routine = ahead.body.data.routine;
    expect(routine.due_at).toBe(r.due_at); // a later occurrence: this one stays due
    expect(routine.history[0].images).toHaveLength(1);
    expect(routine.history[0].occurrence_at).toBeTruthy();
    expect((await doneWith(me, r._id, { extra: { occurrence: "zero" } })).status).toBe(400);
  });

  it("is shared with everyone on the routine, and a stranger can't add to it", async () => {
    const [owner, friend, stranger] = await Promise.all([createUser(), createUser(), createUser()]);
    const r = await make(owner);
    const share = await request(t.app)
      .post(`/api/xenroutine/routines/${r._id}/share`)
      .set(as(owner))
      .send({ userIds: [String(friend.user._id)] });
    expect(share.status, JSON.stringify(share.body)).toBe(200);

    expect((await doneWith(friend, r._id, { note: "friend did it", photos: 1 })).status).toBe(200);
    expect((await mine(owner, r._id)).history[0].images).toHaveLength(1); // the owner sees the friend's photo
    // the friend owns the file they uploaded
    expect(await XenDriveFile.countDocuments({ owner_id: friend.user._id, "source.app": "xenroutine" })).toBe(1);

    const before = priv.size;
    expect((await doneWith(stranger, r._id, { photos: 1 })).status).toBe(404);
    expect(priv.size).toBe(before);
  });

  it("refuses a photo it can't read, storing nothing and leaving the routine as it was", async () => {
    const me = await createUser();
    const r = await make(me);
    const res = await request(t.app)
      .post(`/api/xenroutine/routines/${r._id}/complete`)
      .set(as(me))
      .field("note", "x")
      .attach("images", Buffer.from("this is not an image"), { filename: "bad.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Couldn't read "bad.png"/);
    expect(priv.size).toBe(0);
    const after = await mine(me, r._id);
    expect(after.history).toHaveLength(0);
    expect(after.due_at).toBe(r._id && r.due_at);
  });

  it("refuses something that isn't an image, and more than five photos, storing nothing", async () => {
    const me = await createUser();
    const r = await make(me);
    const notImage = await request(t.app)
      .post(`/api/xenroutine/routines/${r._id}/complete`)
      .set(as(me))
      .attach("images", Buffer.from("hello"), { filename: "a.txt", contentType: "text/plain" });
    expect(notImage.status).toBeGreaterThanOrEqual(400);
    const tooMany = await doneWith(me, r._id, { photos: 6 });
    expect(tooMany.status).toBeGreaterThanOrEqual(400);
    expect(priv.size).toBe(0);
    expect((await mine(me, r._id)).history).toHaveLength(0);
    expect((await doneWith(me, r._id, { photos: 5 })).status).toBe(200);
    expect(priv.size).toBe(5);
  });

  it("needs sign-in", async () => {
    const me = await createUser();
    const r = await make(me);
    const res = await request(t.app)
      .post(`/api/xenroutine/routines/${r._id}/complete`)
      .attach("images", PNG, { filename: "p.png", contentType: "image/png" });
    expect(res.status).toBe(401);
    expect(priv.size).toBe(0);
  });
});

describe("what happens to the photos later", () => {
  it("XenDrive will not delete a photo that belongs to the history", async () => {
    const me = await createUser();
    const r = await make(me);
    await doneWith(me, r._id, { photos: 2 });
    const [first] = await XenDriveFile.find({ owner_id: me.user._id, "source.app": "xenroutine" }).sort({ _id: 1 });
    const del = await request(t.app).delete(`/api/xendrive/files/${first.id}`).set(as(me));
    expect(del.status, JSON.stringify(del.body)).toBe(400);
    expect((await mine(me, r._id)).history[0].images).toHaveLength(2);
  });

  it("deleting the routine deletes its photos", async () => {
    const me = await createUser();
    const r = await make(me);
    await doneWith(me, r._id, { photos: 2 });
    await doneWith(me, r._id, { photos: 1 });
    expect(priv.size).toBe(3);
    const del = await request(t.app).delete(`/api/xenroutine/routines/${r._id}`).set(as(me));
    expect(del.status).toBe(200);
    expect(priv.size).toBe(0);
    expect(await XenDriveFile.countDocuments({ "source.ref": r._id })).toBe(0);
  });

  it("history keeps the latest 50 entries, and the photos on one that ages out go with it", async () => {
    const me = await createUser();
    const r = await make(me);
    await doneWith(me, r._id, { photos: 1 }); // the oldest entry, with a photo
    expect(priv.size).toBe(1);
    for (let i = 0; i < 49; i++) {
      const res = await doneWith(me, r._id, {}); // 50 entries now: nothing dropped yet
      expect(res.status, `completion ${i + 2}: ${JSON.stringify(res.body)}`).toBe(200);
    }
    expect(priv.size).toBe(1);
    expect((await XenRoutine.findById(r._id))!.history).toHaveLength(50);
    await doneWith(me, r._id, {}); // the 51st pushes the first out
    expect((await XenRoutine.findById(r._id))!.history).toHaveLength(50);
    expect(priv.size).toBe(0);
    expect(await XenDriveFile.countDocuments({ "source.ref": r._id })).toBe(0);
  }, 60_000);

  it("is listed under XenDrive > From apps with the routine's name", async () => {
    const me = await createUser();
    const r = await make(me);
    await doneWith(me, r._id, { photos: 1 });
    const apps = await request(t.app).get("/api/xendrive/app-files").set(as(me));
    expect(apps.status, JSON.stringify(apps.body)).toBe(200);
    const app = apps.body.data.apps.find((a: any) => a.app === "xenroutine");
    expect(app).toMatchObject({ label: "XenRoutine", count: 1 });
    expect(app.groups[0]).toMatchObject({ ref: r._id, label: "Replace water filter", count: 1 });
  });
});
