import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../../testing/testApp";
import { memoryStores } from "../../storage";
import { FileRecord } from "../../models/fileRecord";
import { usageFor } from "../../utils/xendriveUtils";
import { storageUsedBy } from "../../utils/fileRecords";
import * as migration from "../../../../migrations/1795800000000-channel-files-to-community";

// Files stored in a community's channels are the community's cost: payer = community, not the uploader's storage.
// Real routes, models and Mongo; storage is the in-memory bucket.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([
    () => import("../xendrive.js"),
    () => import("../storage.js"),
    () => import("./index.js"),
    () => import("../communities/index.js"),
    () => import("../emoji.js"),
  ]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
type U = Awaited<ReturnType<typeof createUser>>;
const id = (u: U) => String(u.user._id);

async function community(me: U) {
  const made = (await request(t.app).post("/api/communities").set(as(me.token)).send({ name: "Crew" })).body.data
    .community;
  const channels = (await request(t.app).get(`/api/communities/${made._id}/channels`).set(as(me.token))).body.data
    .channels;
  return { communityId: String(made._id), channelId: String(channels[0]._id) };
}

async function upload(me: U, conversationId: string, name = "plan.pdf") {
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
const post = (me: U, chatId: string, attachmentIds: string[]) =>
  request(t.app).post(`/api/chat/conversations/${chatId}/messages`).set(as(me.token)).send({ body: "", attachmentIds });

describe("community channel files", () => {
  it("are paid by the community: the uploader's usage doesn't change, the community's sum includes them", async () => {
    const me = await createUser();
    const { communityId, channelId } = await community(me);
    const fileId = await upload(me, channelId);

    const record = await FileRecord.findById(fileId).lean();
    expect(record?.payer).toEqual({ type: "community", id: communityId });
    expect(String(record?.uploadedBy)).toBe(id(me));
    expect(await usageFor(id(me))).toEqual({ fileCount: 0, spaceUsed: 0 });
    expect(await storageUsedBy({ type: "community", id: communityId })).toEqual({ files: 1, bytes: 6 });
    expect(await storageUsedBy({ type: "user", id: id(me) })).toEqual({ files: 0, bytes: 0 });

    // The uploader still sees and can delete their own channel file in the storage viewer.
    const viewer = await request(t.app).get("/api/storage/app-files").set(as(me.token));
    expect(viewer.body.data.count).toBe(1);
    const del = await request(t.app).delete(`/api/storage/files/${fileId}`).set(as(me.token));
    expect(del.status).toBe(200);
    expect(await FileRecord.exists({ _id: fileId })).toBeNull();
  });

  it("stay the sender's cost in a group chat", async () => {
    const [a, b] = [await createUser(), await createUser()];
    const chat = (
      await request(t.app)
        .post("/api/chat/conversations")
        .set(as(a.token))
        .send({ userIds: [id(b)], name: "Pair" })
    ).body.data.conversation._id as string;
    const fileId = await upload(a, chat);
    expect((await FileRecord.findById(fileId).lean())?.payer).toEqual({ type: "user", id: id(a) });
    expect(await usageFor(id(a))).toEqual({ fileCount: 1, spaceUsed: 6 });
  });

  it("go with their last message, not while another message still shows them, and with the community", async () => {
    const me = await createUser();
    const { communityId, channelId } = await community(me);
    const fileId = await upload(me, channelId);
    const first = (await post(me, channelId, [fileId])).body.data.message;
    const second = (await post(me, channelId, [fileId])).body.data.message;

    const remove = (seq: number) =>
      request(t.app).delete(`/api/chat/conversations/${channelId}/messages/${seq}`).set(as(me.token));
    expect((await remove(first.seq)).status).toBe(200);
    expect(await FileRecord.exists({ _id: fileId })).not.toBeNull(); // the second message still shows it
    expect((await remove(second.seq)).status).toBe(200);
    expect(await FileRecord.exists({ _id: fileId })).toBeNull();

    // Deleting the community deletes the files left in its channels.
    const kept = await upload(me, channelId, "again.pdf");
    expect(memoryStores().privateStore.objects.size).toBeGreaterThan(0);
    const del = await request(t.app)
      .delete(`/api/communities/${communityId}`)
      .set(as(me.token))
      .send({ confirm: "Crew" });
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    expect(await FileRecord.exists({ _id: kept })).toBeNull();
  });

  it("a community's custom emoji are on the community's bill", async () => {
    const me = await createUser();
    const { communityId } = await community(me);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const res = await request(t.app)
      .post("/api/emoji")
      .set(as(me.token))
      .field("name", "party")
      .field("scopeType", "community")
      .field("scopeId", communityId)
      .attach("file", png, { filename: "e.png", contentType: "image/png" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const record = await FileRecord.findOne({
      bucket: "public",
      "space.app": "emoji",
      "space.ref": communityId,
    }).lean();
    expect(record?.payer).toEqual({ type: "community", id: communityId });
  });
});

describe("the channel files migration", () => {
  it("sets the community as payer, is idempotent and reversible", async () => {
    const db = mongoose.connection;
    const uploader = new mongoose.Types.ObjectId();
    const channel = new mongoose.Types.ObjectId();
    const dm = new mongoose.Types.ObjectId();
    await db.collection("conversations").insertMany([{ _id: channel, communityId: "com1" }, { _id: dm }]);
    const base = {
      bucket: "private",
      uploadedBy: uploader,
      payer: { type: "user", id: String(uploader) },
      counted: true,
    };
    const { insertedIds } = await db.collection("filerecords").insertMany([
      { ...base, key: "chat/a/1.pdf", space: { app: "chat", ref: String(channel) } },
      { ...base, key: "chat/b/2.pdf", space: { app: "chat", ref: String(dm) } },
    ]);

    await migration.up(db);
    await migration.up(db);
    const [inChannel, inDm] = await Promise.all(
      [0, 1].map((i) => db.collection("filerecords").findOne({ _id: insertedIds[i] })),
    );
    expect(inChannel).toMatchObject({ payer: { type: "community", id: "com1" }, counted: false });
    expect(inDm).toMatchObject({ payer: { type: "user", id: String(uploader) }, counted: true });

    await migration.down(db);
    expect(await db.collection("filerecords").findOne({ _id: insertedIds[0] })).toMatchObject({
      payer: { type: "user", id: String(uploader) },
      counted: true,
    });
  });
});
