import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { XenDriveFile } from "../models/xendriveFile";
import { purgeExpiredFiles } from "../utils/xendriveTrash";
import { TRASH_MS } from "../utils/softDelete";

// Deleting a file moves it to the Trash for 30 days, where it can be restored. Only storage is faked.
const removed: string[] = [];
vi.mock("../utils/storageUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  deleteFromStorage: vi.fn(async (path: string) => void removed.push(path)),
  generateSignedUrl: vi.fn(async (path: string) => `https://example.test/signed/${path}`),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xendrive.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);
beforeEach(() => {
  removed.length = 0;
});

type U = Awaited<ReturnType<typeof createUser>>;
const api = (who: U) => {
  const auth = { Authorization: `Bearer ${who.token}` };
  return {
    get: (url: string) => request(t.app).get(`/api/xendrive${url}`).set(auth),
    post: (url: string, body?: object) => request(t.app).post(`/api/xendrive${url}`).set(auth).send(body),
    put: (url: string, body: object) => request(t.app).put(`/api/xendrive${url}`).set(auth).send(body),
    del: (url: string) => request(t.app).delete(`/api/xendrive${url}`).set(auth),
  };
};
const addFile = async (who: U, name: string, folderId: string | null = null) => {
  const { createDriveFile } = await import("../testing/files.js");
  const { privateStore } = await import("../storage/index.js");
  await privateStore.put(`xendrive/${who.user._id}/${name}-stored`, Buffer.alloc(10, "x"), {
    contentType: "text/plain",
  });
  return createDriveFile({
    owner_id: who.user._id,
    folder_id: folderId,
    name,
    storage_path: `xendrive/${who.user._id}/${name}-stored`,
    mimeType: "text/plain",
    size: 10,
  });
};
const trash = async (who: U) => (await api(who).get("/trash")).body.data.files as any[];
const browseNames = async (who: U, query = "") =>
  (await api(who).get(`/browse${query}`)).body.data.files.map((f: any) => f.name);

describe("the XenDrive Trash", () => {
  it("hides a deleted file everywhere, and restoring puts it back in its folder", async () => {
    const me = await createUser();
    const folder = (await api(me).post("/folders", { name: "Taxes" })).body.data.folder;
    const file = await addFile(me, "return.txt", folder._id);
    expect(await browseNames(me, `?folder=${folder._id}`)).toEqual(["return.txt"]);

    expect((await api(me).del(`/files/${file.id}`)).status).toBe(200);
    expect(await browseNames(me, `?folder=${folder._id}`)).toEqual([]);
    expect(await browseNames(me, "?search=return")).toEqual([]);
    expect((await api(me).get("/browse?view=recent")).body.data.files).toEqual([]);
    const listed = await trash(me);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ _id: file.id, name: "return.txt", size: 10 });
    expect(new Date(listed[0].purge_at).getTime() - new Date(listed[0].deleted_at).getTime()).toBe(TRASH_MS);

    expect((await api(me).post(`/trash/${file.id}/restore`)).status).toBe(200);
    expect(await browseNames(me, `?folder=${folder._id}`)).toEqual(["return.txt"]);
    expect(await trash(me)).toEqual([]);
    expect(removed).toEqual([]);
  });

  it("stops the file's public link working while it is in the Trash", async () => {
    const me = await createUser();
    const file = await addFile(me, "share.txt");
    const set = await api(me).put(`/files/${file.id}/settings`, { shareEnabled: true });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    const token = (await api(me).get(`/files/${file.id}`)).body.data.file.shareToken;
    expect((await request(t.app).get(`/api/xendrive/info/${token}`)).status).toBe(200);

    await api(me).del(`/files/${file.id}`);
    expect((await request(t.app).get(`/api/xendrive/info/${token}`)).status).toBe(404);
    await api(me).post(`/trash/${file.id}/restore`);
    expect((await request(t.app).get(`/api/xendrive/info/${token}`)).status).toBe(200);
  });

  it("is private to its owner", async () => {
    const me = await createUser();
    const other = await createUser();
    const file = await addFile(me, "mine.txt");
    await api(me).del(`/files/${file.id}`);
    expect(await trash(other)).toEqual([]);
    expect((await api(other).post(`/trash/${file.id}/restore`)).status).toBe(404);
    expect((await api(other).del(`/trash/${file.id}`)).status).toBe(404);
  });

  it("deletes one file, or empties the Trash, for good, along with the stored bytes", async () => {
    const me = await createUser();
    const a = await addFile(me, "a.txt");
    const b = await addFile(me, "b.txt");
    const c = await addFile(me, "c.txt");
    for (const f of [a, b, c]) await api(me).del(`/files/${f.id}`);

    expect((await api(me).del(`/trash/${a.id}`)).status).toBe(200);
    expect(removed).toEqual([`xendrive/${me.user._id}/a.txt-stored`]);
    expect((await api(me).post(`/trash/${a.id}/restore`)).status).toBe(404);

    const emptied = await api(me).del("/trash");
    expect(emptied.body.data.removed).toBe(2);
    expect(await trash(me)).toEqual([]);
    expect(removed).toHaveLength(3);
  });

  it("removes files after 30 days, and keeps newer ones", async () => {
    const me = await createUser();
    const old = await addFile(me, "old.txt");
    const recent = await addFile(me, "recent.txt");
    await api(me).del(`/files/${old.id}`);
    await api(me).del(`/files/${recent.id}`);
    await XenDriveFile.updateOne({ _id: old.id }, { deleted_at: new Date(Date.now() - TRASH_MS - 60_000) }).setOptions({
      includeDeleted: true,
    });

    expect(await purgeExpiredFiles()).toBeGreaterThanOrEqual(1);
    expect((await trash(me)).map((f) => f.name)).toEqual(["recent.txt"]);
    expect(removed).toContain(`xendrive/${me.user._id}/old.txt-stored`);
  });

  it("deleting a folder also removes the files of it that are in the Trash", async () => {
    const me = await createUser();
    const folder = (await api(me).post("/folders", { name: "Old stuff" })).body.data.folder;
    const file = await addFile(me, "inside.txt", folder._id);
    await api(me).del(`/files/${file.id}`);

    expect((await api(me).del(`/folders/${folder._id}`)).status).toBe(200);
    expect(removed).toContain(`xendrive/${me.user._id}/inside.txt-stored`);
    expect(await trash(me)).toEqual([]);
  });
});
