import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { Readable } from "stream";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Folders, browsing, the public folder link and recursive delete, through the real routes and models.
// Only storage is faked.

const removed: string[] = [];
vi.mock("../config/gcs", () => ({
  privateBucket: {
    file: (path: string) => ({
      exists: async () => [true],
      createReadStream: () => Readable.from([Buffer.alloc(10, "x")]), // matches the 10-byte size of the test files
      delete: async () => void removed.push(path),
    }),
  },
}));
vi.mock("../utils/gcsUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  deleteFromGCS: vi.fn(async (path: string) => void removed.push(path)),
  generateSignedUrl: vi.fn(async () => "https://example.test/signed"),
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

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
type U = Awaited<ReturnType<typeof createUser>>;
const api = (who: U) => ({
  get: (url: string) => request(t.app).get(`/api/xendrive${url}`).set(auth(who.token)),
  post: (url: string, body?: object) => request(t.app).post(`/api/xendrive${url}`).set(auth(who.token)).send(body),
  put: (url: string, body: object) => request(t.app).put(`/api/xendrive${url}`).set(auth(who.token)).send(body),
  del: (url: string) => request(t.app).delete(`/api/xendrive${url}`).set(auth(who.token)),
});
const folder = async (who: U, name: string, parentId?: string) => {
  const r = await api(who).post("/folders", { name, parentId });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.folder as { _id: string; name: string };
};
/** A stored file, made directly (uploads are covered in xendriveSessions.test.ts). */
const addFile = async (who: U, name: string, folderId: string | null, extra: object = {}) => {
  const { XenDriveFile } = await import("../models/xendriveFile.js");
  return XenDriveFile.create({
    owner_id: who.user._id,
    folder_id: folderId,
    name,
    storage_path: `xendrive/${who.user._id}/${name}-stored`,
    mimeType: "text/plain",
    size: 10,
    ...extra,
  });
};

describe("folders and browsing", () => {
  it("nests folders, shows a breadcrumb, lists a level at a time, and finds files by search", async () => {
    const me = await createUser();
    const docs = await folder(me, "Docs");
    const tax = await folder(me, "Tax", docs._id);
    await addFile(me, "root.txt", null);
    await addFile(me, "receipt.txt", tax._id);

    const top = (await api(me).get("/browse")).body.data;
    expect(top.folder).toBeNull();
    expect(top.folders.map((f: any) => f.name)).toEqual(["Docs"]);
    expect(top.files.map((f: any) => f.name)).toEqual(["root.txt"]);

    const inTax = (await api(me).get(`/browse?folder=${tax._id}`)).body.data;
    expect(inTax.breadcrumb.map((c: any) => c.name)).toEqual(["Docs", "Tax"]);
    expect(inTax.files.map((f: any) => f.name)).toEqual(["receipt.txt"]);

    const found = (await api(me).get("/browse?search=RECEIPT")).body.data;
    expect(found.searching).toBe(true);
    expect(found.files.map((f: any) => f.name)).toEqual(["receipt.txt"]);
  });

  it("refuses two folders with the same name side by side, but allows it in different folders", async () => {
    const me = await createUser();
    const a = await folder(me, "Photos");
    expect((await api(me).post("/folders", { name: "photos" })).status).toBe(409);
    await folder(me, "Photos", a._id); // a different parent is fine
  });

  it("renames a folder, and refuses a name that is taken", async () => {
    const me = await createUser();
    const a = await folder(me, "A");
    await folder(me, "B");
    expect((await api(me).put(`/folders/${a._id}`, { name: "C" })).status).toBe(200);
    expect((await api(me).put(`/folders/${a._id}`, { name: "b" })).status).toBe(409);
  });

  it("limits how deep folders can nest", async () => {
    const me = await createUser();
    let parent: string | undefined;
    for (let i = 0; i < 20; i++) parent = (await folder(me, `L${i}`, parent))._id;
    expect((await api(me).post("/folders", { name: "too deep", parentId: parent })).status).toBe(400);
  });

  it("keeps strangers out: another person's folder looks like it does not exist", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    const mine = await folder(me, "Private");
    for (const res of [
      await api(other).get(`/browse?folder=${mine._id}`),
      await api(other).put(`/folders/${mine._id}`, { name: "x" }),
      await api(other).del(`/folders/${mine._id}`),
      await api(other).post("/folders", { name: "in yours", parentId: mine._id }),
      await api(other).post("/initiate", { filename: "a.txt", totalChunks: 1, fileSize: 1, folderId: mine._id }),
    ]) {
      expect(res.status).toBe(404);
    }
  });
});

describe("deleting", () => {
  it("says what a folder holds, then deletes it with everything inside and the stored bytes", async () => {
    const me = await createUser();
    const top = await folder(me, "Top");
    const sub = await folder(me, "Sub", top._id);
    const keep = await addFile(me, "outside.txt", null);
    await addFile(me, "a.txt", top._id);
    await addFile(me, "b.txt", sub._id);

    const stats = (await api(me).get(`/folders/${top._id}/stats`)).body.data;
    expect(stats).toEqual({ folders: 1, files: 2, size: 20 });

    expect((await api(me).del(`/folders/${top._id}`)).status).toBe(200);
    expect(removed.filter((p) => p.endsWith("-stored")).sort()).toEqual(
      [`xendrive/${me.user._id}/a.txt-stored`, `xendrive/${me.user._id}/b.txt-stored`].sort(),
    );
    const left = (await api(me).get("/browse")).body.data;
    expect(left.folders).toEqual([]);
    expect(left.files.map((f: any) => f._id)).toEqual([keep.id]);
  });

  it("deletes a single file and its bytes", async () => {
    const me = await createUser();
    const file = await addFile(me, "x.txt", null);
    expect((await api(me).del(`/files/${file.id}`)).status).toBe(200);
    expect(removed).toContain(`xendrive/${me.user._id}/x.txt-stored`);
    expect((await api(me).get(`/files/${file.id}`)).status).toBe(404);
  });
});

describe("a file's own settings and link", () => {
  it("renames a file, sets a password, and a public download needs it", async () => {
    const me = await createUser();
    const file = await addFile(me, "plan.txt", null);
    const set = await api(me).put(`/files/${file.id}/settings`, { name: "plan v2.txt", password: "hunter2" });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.data.name).toBe("plan v2.txt");

    const token = (await api(me).get(`/files/${file.id}`)).body.data.file.shareToken;
    const noPass = await request(t.app).get(`/api/xendrive/download/${token}`);
    expect(noPass.status).toBe(401);
    const ok = await request(t.app).get(`/api/xendrive/download/${token}?password=hunter2`);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-disposition"]).toContain("plan%20v2.txt");
    expect(
      await request(t.app)
        .get(`/api/xendrive/info/${token}`)
        .then((r) => r.body.data.name),
    ).toBe("plan v2.txt");
  });
});

describe("a folder's public link", () => {
  it("shows the shared folder and what is under it, to anyone, and nothing else", async () => {
    const me = await createUser();
    const shared = await folder(me, "Shared");
    const inner = await folder(me, "Inner", shared._id);
    const sibling = await folder(me, "NotShared");
    const inFile = await addFile(me, "visible.txt", inner._id);
    const outFile = await addFile(me, "hidden.txt", sibling._id);

    const enabled = await api(me).post(`/folders/${shared._id}/share`);
    const token = enabled.body.data.folder.shareToken;
    expect(token).toBeTruthy();

    const rootView = await request(t.app).get(`/api/xendrive/public/folder/${token}`);
    expect(rootView.status, JSON.stringify(rootView.body)).toBe(200);
    expect(rootView.body.data.folders.map((f: any) => f.name)).toEqual(["Inner"]);

    const innerView = await request(t.app).get(`/api/xendrive/public/folder/${token}?folder=${inner._id}`);
    expect(innerView.body.data.files.map((f: any) => f.name)).toEqual(["visible.txt"]);
    // the breadcrumb starts at the shared folder: nothing above it is revealed
    expect(innerView.body.data.breadcrumb.map((c: any) => c.name)).toEqual(["Shared", "Inner"]);

    // a folder outside the shared tree is not reachable through this link
    expect((await request(t.app).get(`/api/xendrive/public/folder/${token}?folder=${sibling._id}`)).status).toBe(404);

    // downloads: inside works, outside does not
    const dl = await request(t.app).get(`/api/xendrive/public/folder/${token}/files/${inFile.id}`);
    expect(dl.status).toBe(200);
    expect(dl.headers["content-disposition"]).toContain("visible.txt");
    expect((await request(t.app).get(`/api/xendrive/public/folder/${token}/files/${outFile.id}`)).status).toBe(404);
  });

  it("hides an expired file, and ignores a file's own password because the whole folder was shared", async () => {
    const me = await createUser();
    const shared = await folder(me, "Mixed");
    await addFile(me, "fresh.txt", shared._id, { password: "secret" });
    await addFile(me, "stale.txt", shared._id, { expiry: new Date(Date.now() - 1000) });
    const token = (await api(me).post(`/folders/${shared._id}/share`)).body.data.folder.shareToken;

    const view = await request(t.app).get(`/api/xendrive/public/folder/${token}`);
    expect(view.body.data.files.map((f: any) => f.name)).toEqual(["fresh.txt"]);
  });

  it("rotating gives a new link and kills the old one; disabling kills it too", async () => {
    const me = await createUser();
    const shared = await folder(me, "Links");
    const first = (await api(me).post(`/folders/${shared._id}/share`)).body.data.folder.shareToken;
    // enabling again keeps the same link
    expect((await api(me).post(`/folders/${shared._id}/share`)).body.data.folder.shareToken).toBe(first);

    const second = (await api(me).post(`/folders/${shared._id}/share/rotate`)).body.data.folder.shareToken;
    expect(second).not.toBe(first);
    expect((await request(t.app).get(`/api/xendrive/public/folder/${first}`)).status).toBe(404);
    expect((await request(t.app).get(`/api/xendrive/public/folder/${second}`)).status).toBe(200);

    expect((await api(me).del(`/folders/${shared._id}/share`)).status).toBe(200);
    expect((await request(t.app).get(`/api/xendrive/public/folder/${second}`)).status).toBe(404);
  });

  it("a stranger cannot manage someone else's folder link", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    const mine = await folder(me, "Mine");
    expect((await api(other).post(`/folders/${mine._id}/share`)).status).toBe(404);
  });
});

describe("usage", () => {
  it("the recent endpoint returns the latest files and the totals", async () => {
    const me = await createUser();
    for (const n of ["a", "b", "c", "d"]) await addFile(me, n + ".txt", null);
    const r = (await api(me).get("/recent")).body.data;
    expect(r.files).toHaveLength(3);
    expect(r).toMatchObject({ fileCount: 4, spaceUsed: 40 });
  });

  it("counts a person's files and bytes", async () => {
    const me = await createUser();
    await addFile(me, "a.txt", null);
    await addFile(me, "b.txt", null);
    const { usageFor, usageForAll } = await import("../utils/xendriveUtils.js");
    expect(await usageFor(String(me.user._id))).toEqual({ fileCount: 2, spaceUsed: 20 });
    expect((await usageForAll()).get(String(me.user._id))).toEqual({ fileCount: 2, spaceUsed: 20 });
  });
});
