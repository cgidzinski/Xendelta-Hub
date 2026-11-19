import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Moving files and folders between folders, through the real routes and models.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xendrive.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const api = (who: U) => {
  const auth = { Authorization: `Bearer ${who.token}` };
  return {
    get: (url: string) => request(t.app).get(`/api/xendrive${url}`).set(auth),
    post: (url: string, body?: object) => request(t.app).post(`/api/xendrive${url}`).set(auth).send(body),
  };
};
const folder = async (who: U, name: string, parentId?: string) => {
  const r = await api(who).post("/folders", { name, parentId });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.folder as { _id: string };
};
const addFile = async (who: U, name: string, folderId: string | null = null) => {
  const { createDriveFile } = await import("../testing/files.js");
  return createDriveFile({
    owner_id: who.user._id,
    folder_id: folderId,
    name,
    storage_path: `xendrive/${who.user._id}/${name}`,
    mimeType: "text/plain",
    size: 3,
  });
};
const names = async (who: U, folderId?: string) => {
  const d = (await api(who).get(`/browse${folderId ? `?folder=${folderId}` : ""}`)).body.data;
  return { files: d.files.map((f: any) => f.name).sort(), folders: d.folders.map((f: any) => f.name).sort() };
};
const move = (who: U, body: object) => api(who).post("/move", body);

describe("moving files and folders", () => {
  it("moves files and folders into a folder, and back to the top level", async () => {
    const me = await createUser();
    const target = await folder(me, "Archive");
    const sub = await folder(me, "Receipts");
    const a = await addFile(me, "a.txt");
    const b = await addFile(me, "b.txt");

    const res = await move(me, { fileIds: [a.id], folderIds: [sub._id], targetFolderId: target._id });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ files: 1, folders: 1 });
    expect(await names(me, target._id)).toEqual({ files: ["a.txt"], folders: ["Receipts"] });
    expect(await names(me)).toEqual({ files: ["b.txt"], folders: ["Archive"] });

    await move(me, { fileIds: [a.id, b.id], targetFolderId: null });
    expect((await names(me)).files).toEqual(["a.txt", "b.txt"]);
  });

  it("moving something where it already is changes nothing", async () => {
    const me = await createUser();
    const f = await folder(me, "Here");
    const a = await addFile(me, "a.txt", f._id);
    const res = await move(me, { fileIds: [a.id], targetFolderId: f._id });
    expect(res.body.data).toEqual({ files: 0, folders: 0 });
  });

  it("won't put a folder into itself or a folder inside it", async () => {
    const me = await createUser();
    const outer = await folder(me, "Outer");
    const inner = await folder(me, "Inner", outer._id);
    expect((await move(me, { folderIds: [outer._id], targetFolderId: outer._id })).status).toBe(400);
    expect((await move(me, { folderIds: [outer._id], targetFolderId: inner._id })).status).toBe(400);
    expect(await names(me)).toEqual({ files: [], folders: ["Outer"] });
  });

  it("refuses a folder name that is taken there, or two folders with the same name, moving nothing", async () => {
    const me = await createUser();
    const dest = await folder(me, "Dest");
    await folder(me, "Photos", dest._id);
    const photos = await folder(me, "photos");
    const a = await addFile(me, "a.txt");
    const clash = await move(me, { fileIds: [a.id], folderIds: [photos._id], targetFolderId: dest._id });
    expect(clash.status).toBe(409);
    // The file wasn't moved either.
    expect((await names(me)).files).toEqual(["a.txt"]);

    const one = await folder(me, "A");
    const x1 = await folder(me, "Same", one._id);
    const two = await folder(me, "B");
    const x2 = await folder(me, "same", two._id);
    const third = await folder(me, "C");
    expect((await move(me, { folderIds: [x1._id, x2._id], targetFolderId: third._id })).status).toBe(409);
  });

  it("keeps folders within the depth limit", async () => {
    const me = await createUser();
    let parent: string | undefined;
    for (let i = 0; i < 19; i++) parent = (await folder(me, `L${i}`, parent))._id;
    const loose = await folder(me, "Loose");
    await folder(me, "LooseChild", loose._id);
    // 19 deep + a folder that is 2 levels tall would be 21.
    expect((await move(me, { folderIds: [loose._id], targetFolderId: parent })).status).toBe(400);
  });

  it("only moves the caller's things, into the caller's folders, and refuses an empty request", async () => {
    const me = await createUser();
    const other = await createUser();
    const mine = await folder(me, "Mine");
    const theirs = await folder(other, "Theirs");
    const theirFile = await addFile(other, "theirs.txt");
    expect((await move(me, { fileIds: [theirFile.id], targetFolderId: mine._id })).body.data.files).toBe(0);
    expect((await names(other)).files).toEqual(["theirs.txt"]);
    expect((await move(me, { folderIds: [mine._id], targetFolderId: theirs._id })).status).toBe(404);
    expect((await move(me, { targetFolderId: mine._id })).status).toBe(400);
    expect((await move(me, { fileIds: ["nope"], targetFolderId: null })).status).toBe(400);
  });
});
