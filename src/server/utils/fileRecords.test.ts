import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { bucketView } from "../testing/storage";
import { FileRecord } from "../models/fileRecord";
import { XenDriveFile } from "../models/xendriveFile";
import { XenDriveFolder } from "../models/xendriveFolder";
import { uploadToStorage, deleteFromStorage } from "./storageUtils";
import { uploadAvatarFile } from "./mediaUtils";
import { finalizeChunkedUpload, initiateChunkedUpload, uploadChunk } from "./xendriveUtils";
import { deleteFolderTree } from "./xendriveFolders";
import { removeAccountFiles } from "./accountFiles";
import { forgetFileRecords, saveFileRecord } from "./fileRecords";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([]);
  await FileRecord.init();
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("file records", () => {
  it("keeps one record per bucket and key, and updates it in place", async () => {
    const payer = { type: "house" } as const;
    await saveFileRecord({ bucket: "public", key: "blog-assets/x.png", size: 1, payer, space: { app: "blog-assets" } });
    await saveFileRecord({ bucket: "public", key: "blog-assets/x.png", size: 2, payer, space: { app: "blog-assets" } });
    // The same key in the other bucket is a different object.
    await saveFileRecord({
      bucket: "private",
      key: "blog-assets/x.png",
      size: 3,
      payer,
      space: { app: "blog-assets" },
    });
    expect(await FileRecord.countDocuments({ key: "blog-assets/x.png" })).toBe(2);
    expect((await FileRecord.findOne({ bucket: "public", key: "blog-assets/x.png" }))?.size).toBe(2);
    await forgetFileRecords([]);
  });

  it("a XenDrive upload makes a record with the file's id and the file points at it; a chat attachment has no link", async () => {
    const me = await createUser();
    const uid = String(me.user._id);
    const upload = async (source?: { app: string; ref: string }) => {
      const id = await initiateChunkedUpload(uid, "notes.txt", 1, null, source);
      await uploadChunk(id, uid, 0, Buffer.from("abc"));
      return finalizeChunkedUpload(id, uid);
    };

    const direct = await upload();
    const record = await FileRecord.findById(direct._id).lean();
    expect(record).toMatchObject({
      bucket: "private",
      size: 3,
      name: "notes.txt",
      payer: { type: "user", id: uid },
      space: { app: "xendrive", ref: uid },
    });
    expect(String((await XenDriveFile.findById(direct._id).lean())?.file)).toBe(direct._id);
    // Found from the item in one indexed query; the record doesn't link back.
    expect(await XenDriveFile.countDocuments({ file: record!._id })).toBe(1);

    const chat = await upload({ app: "chat", ref: "c1" });
    expect((await FileRecord.findById(chat._id).lean())?.space).toEqual({ app: "chat", ref: "c1" });
    expect((await XenDriveFile.findById(chat._id).lean())?.file).toBeUndefined();
  });

  it("deleting a file, a folder tree or an account removes the records", async () => {
    const me = await createUser();
    const uid = String(me.user._id);
    const make = async (folderId: string | null) => {
      const id = await initiateChunkedUpload(uid, "a.txt", 1, folderId);
      await uploadChunk(id, uid, 0, Buffer.from("abc"));
      return (await finalizeChunkedUpload(id, uid))._id;
    };

    const one = await make(null);
    await XenDriveFile.findByIdAndDelete(one);
    expect(await FileRecord.exists({ _id: one })).toBeNull();

    const folder = await XenDriveFolder.create({ owner_id: uid, name: "F" });
    const inside = await make(folder.id);
    await deleteFolderTree(folder.id);
    expect(await FileRecord.exists({ _id: inside })).toBeNull();

    const kept = await make(null);
    expect(await FileRecord.exists({ _id: kept })).not.toBeNull();
    await removeAccountFiles(uid);
    expect(await FileRecord.countDocuments({ uploadedBy: uid })).toBe(0);
  });

  it("a public upload and delete create and remove its record", async () => {
    const pub = bucketView("public");
    const me = await createUser();
    const uid = String(me.user._id);
    await uploadToStorage(PNG, "emoji/s1/e.png", "image/png", false, undefined, {
      name: "e.png",
      uploadedBy: uid,
      payer: { type: "user", id: uid },
      space: { app: "emoji", ref: "s1" },
    });
    expect(pub.has("emoji/s1/e.png")).toBe(true);
    expect(await FileRecord.findOne({ bucket: "public", key: "emoji/s1/e.png" }).lean()).toMatchObject({
      size: PNG.length,
      mimeType: "image/png",
      payer: { type: "user", id: uid },
    });
    await deleteFromStorage("emoji/s1/e.png");
    expect(await FileRecord.exists({ bucket: "public", key: "emoji/s1/e.png" })).toBeNull();
  });

  it("an avatar is a house file", async () => {
    const me = await createUser();
    const uid = String(me.user._id);
    await uploadAvatarFile({ buffer: PNG, mimetype: "image/png", originalname: "me.png" } as Express.Multer.File, uid);
    const record = await FileRecord.findOne({ bucket: "public", key: `avatar/${uid}.png` }).lean();
    expect(record).toMatchObject({ payer: { type: "house" }, space: { app: "avatar" } });
    expect(String(record?.uploadedBy)).toBe(uid);
    expect(mongoose.connection.readyState).toBe(1);
  });
});
