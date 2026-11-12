import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";

// Chat attachments are XenDrive files tagged with where they came from. Real routes, models and Mongo; only storage
// and the network are faked.
const deleted: string[] = [];
vi.mock("../../config/gcs", () => ({
  privateBucket: {
    file: (path: string) => ({
      createResumableUpload: async () => ["https://storage.example.test/upload?id=1"],
      getMetadata: async () => [{ size: "6", contentType: "text/plain" }],
      exists: async () => [true],
      delete: async () => void deleted.push(path),
    }),
  },
}));
vi.mock("https", () => {
  const request = (_opts: unknown, cb: (res: { statusCode: number }) => void) => ({
    on: () => undefined,
    write: () => undefined,
    end: () => cb({ statusCode: 308 }),
  });
  return { default: { request }, request };
});
vi.mock("../../utils/gcsUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  deleteFromGCS: vi.fn(async (path: string) => void deleted.push(path)),
  generateSignedUrl: vi.fn(
    async (path: string, _m?: number, opts?: { downloadName?: string }) =>
      `https://example.test/signed/${path}?name=${encodeURIComponent(opts?.downloadName ?? "")}`,
  ),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("../xendrive.js"), () => import("./index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  deleted.length = 0;
});

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
type U = Awaited<ReturnType<typeof createUser>>;
const id = (u: U) => String(u.user._id);

const openChat = async (me: U, others: U[], name?: string) =>
  (
    await request(t.app)
      .post("/api/chat/conversations")
      .set(as(me.token))
      .send({ userIds: others.map(id), name })
  ).body.data.conversation._id as string;

/** The whole upload flow, as the client does it, tagged for a chat. Returns the stored file id. */
async function uploadForChat(me: U, conversationId: string, name = "plan.pdf") {
  const start = await request(t.app)
    .post("/api/xendrive/initiate")
    .set(as(me.token))
    .send({ filename: name, totalChunks: 1, fileSize: 6, source: { app: "chat", ref: conversationId } });
  expect(start.status, JSON.stringify(start.body)).toBe(200);
  const uploadId = start.body.data.uploadId;
  await request(t.app)
    .post("/api/xendrive/chunk")
    .set(as(me.token))
    .send({ uploadId, chunkIndex: 0, chunkData: Buffer.from("abcdef").toString("base64") });
  const done = await request(t.app).post("/api/xendrive/finalize").set(as(me.token)).send({ uploadId });
  expect(done.status, JSON.stringify(done.body)).toBe(200);
  return done.body.data._id as string;
}

describe("chat uploads", () => {
  it("stores a tagged XenDrive file that doesn't count toward the quota and shows in the drive for now", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chatId = await openChat(a, [b]);
    const fileId = await uploadForChat(a, chatId);

    const stored = await mongoose.model("XenDriveFile").findById(fileId).lean<any>();
    expect(stored.source).toEqual({ app: "chat", ref: chatId });
    expect(stored.folder_id).toBeNull();
    expect(stored.counted).toBe(false);

    // While SHOW_APP_FILES_IN_DRIVE is on it is in My Drive, search and recent too (marked as an app's file)...
    const root = await request(t.app).get("/api/xendrive/browse").set(as(a.token));
    expect(root.body.data.files).toHaveLength(1);
    expect(root.body.data.files[0]).toMatchObject({ _id: fileId, counted: false, source: { app: "chat" } });
    expect(
      (await request(t.app).get("/api/xendrive/browse?search=plan").set(as(a.token))).body.data.files,
    ).toHaveLength(1);

    // ...but it doesn't use their storage, and the overview says how much apps hold.
    const overview = (await request(t.app).get("/api/xendrive/recent").set(as(a.token))).body.data;
    expect(overview.fileCount).toBe(0);
    expect(overview.spaceUsed).toBe(0);
    expect(overview.appFiles).toEqual({ count: 1, size: 6 });

    // And it is listed under From apps, grouped by chat, named for the reader.
    const apps = (await request(t.app).get("/api/xendrive/app-files").set(as(a.token))).body.data;
    expect(apps.count).toBe(1);
    expect(apps.apps[0]).toMatchObject({ app: "chat", label: "Chat", count: 1, size: 6 });
    expect(apps.apps[0].groups[0]).toMatchObject({ ref: chatId, count: 1 });
    expect(apps.apps[0].groups[0].files[0]._id).toBe(fileId);

    // Only the uploader sees it.
    expect((await request(t.app).get("/api/xendrive/app-files").set(as(b.token))).body.data.count).toBe(0);
  });

  it("lets a chat attachment start even when it is bigger than the person's whole storage, because it doesn't count", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chatId = await openChat(a, [b]);
    const huge = 5 * 1024 * 1024 * 1024;
    const body = { filename: "big.bin", totalChunks: 1, fileSize: huge };
    const asChat = await request(t.app)
      .post("/api/xendrive/initiate")
      .set(as(a.token))
      .send({ ...body, source: { app: "chat", ref: chatId } });
    expect(asChat.status, JSON.stringify(asChat.body)).toBe(200);
    // an ordinary upload of the same size is still refused
    const plain = await request(t.app).post("/api/xendrive/initiate").set(as(a.token)).send(body);
    expect(plain.status).toBe(403);
  });

  it("only lets a member of the chat upload for it, and never into a folder", async () => {
    const [a, b, outsider] = [await createUser(), await createUser(), await createUser()];
    const chatId = await openChat(a, [b]);
    const body = { filename: "x.txt", totalChunks: 1, fileSize: 6 };
    const asOutsider = await request(t.app)
      .post("/api/xendrive/initiate")
      .set(as(outsider.token))
      .send({ ...body, source: { app: "chat", ref: chatId } });
    expect(asOutsider.status).toBe(404);
    const unknown = await request(t.app)
      .post("/api/xendrive/initiate")
      .set(as(a.token))
      .send({ ...body, source: { app: "nope", ref: chatId } });
    expect(unknown.status).toBe(400);
    const withFolder = await request(t.app)
      .post("/api/xendrive/initiate")
      .set(as(a.token))
      .send({ ...body, folderId: String(new mongoose.Types.ObjectId()), source: { app: "chat", ref: chatId } });
    expect(withFolder.status).toBe(400);
  });

  it("keeps a tagged file private: no renaming or public link from XenDrive, but it can be deleted", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chatId = await openChat(a, [b]);
    const fileId = await uploadForChat(a, chatId);

    const share = await request(t.app)
      .put(`/api/xendrive/files/${fileId}/settings`)
      .set(as(a.token))
      .send({ shareEnabled: true });
    expect(share.status).toBe(400);
    expect((await request(t.app).post(`/api/xendrive/files/${fileId}/share/rotate`).set(as(a.token))).status).toBe(400);

    const del = await request(t.app).delete(`/api/xendrive/files/${fileId}`).set(as(a.token));
    expect(del.status).toBe(200);
    expect(await mongoose.model("XenDriveFile").countDocuments({ _id: fileId })).toBe(0);
    expect(deleted.length).toBeGreaterThan(0); // the bytes went too
  });
});

describe("downloading an attachment", () => {
  const send = (me: U, chatId: string, attachmentIds: string[]) =>
    request(t.app)
      .post(`/api/chat/conversations/${chatId}/messages`)
      .set(as(me.token))
      .send({ body: "see attached", attachmentIds });

  it("gives any member a signed link, and no one else", async () => {
    const [a, b, outsider] = [await createUser(), await createUser(), await createUser()];
    const chatId = await openChat(a, [b]);
    const fileId = await uploadForChat(a, chatId, "plan.pdf");
    const msg = (await send(a, chatId, [fileId])).body.data.message;
    const url = `/api/chat/conversations/${chatId}/messages/${msg.seq}/attachments/${fileId}`;

    const asMember = await request(t.app).get(url).set(as(b.token));
    expect(asMember.status).toBe(200);
    expect(asMember.body.data.url).toContain("name=plan.pdf");
    expect((await request(t.app).get(url).set(as(outsider.token))).status).toBe(404);

    // A file that isn't on that message can't be fetched through it.
    const other = await uploadForChat(a, chatId, "other.pdf");
    const wrong = await request(t.app)
      .get(`/api/chat/conversations/${chatId}/messages/${msg.seq}/attachments/${other}`)
      .set(as(b.token));
    expect(wrong.status).toBe(404);
  });

  it("says so when the file was deleted from XenDrive", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chatId = await openChat(a, [b]);
    const fileId = await uploadForChat(a, chatId);
    const msg = (await send(a, chatId, [fileId])).body.data.message;
    await request(t.app).delete(`/api/xendrive/files/${fileId}`).set(as(a.token));

    const gone = await request(t.app)
      .get(`/api/chat/conversations/${chatId}/messages/${msg.seq}/attachments/${fileId}`)
      .set(as(b.token));
    expect(gone.status).toBe(404);
    const history = await request(t.app).get(`/api/chat/conversations/${chatId}/messages`).set(as(b.token));
    expect(history.body.data.messages[0].attachments[0].removed).toBe(true);
  });
});
