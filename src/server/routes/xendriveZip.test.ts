import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { crc32, zipPath } from "../utils/zipStream";

// "Download all" on a shared folder: one zip, streamed, with the folder structure. Only storage is faked.
vi.mock("../utils/storageUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  deleteFromStorage: vi.fn(async () => undefined),
  generateSignedUrl: vi.fn(async (path: string) => `https://example.test/signed/${path}`),
}));

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
    put: (url: string, body: object) => request(t.app).put(`/api/xendrive${url}`).set(auth).send(body),
  };
};
const folder = async (who: U, name: string, parentId?: string) =>
  (await api(who).post("/folders", { name, parentId })).body.data.folder as { _id: string };
const addFile = async (who: U, name: string, content: string, folderId: string | null, extra: object = {}) => {
  const { createDriveFile } = await import("../testing/files.js");
  const { privateStore } = await import("../storage/index.js");
  const key = `xendrive/${who.user._id}/${Math.random().toString(36).slice(2)}-${name}`;
  await privateStore.put(key, Buffer.from(content), { contentType: "text/plain" });
  return createDriveFile({
    owner_id: who.user._id,
    folder_id: folderId,
    name,
    storage_path: key,
    mimeType: "text/plain",
    size: Buffer.byteLength(content),
    ...extra,
  });
};

/** Read a zip back: its entries with their stored bytes, checked against the checksums in the index. */
function readZip(buf: Buffer): Array<{ name: string; data: string }> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThan(-1);
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const entries: Array<{ name: string; data: string }> = [];
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    expect(buf.readUInt32LE(offset)).toBe(0x04034b50);
    const dataStart = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const data = buf.subarray(dataStart, dataStart + size);
    expect(crc32(data)).toBe(crc);
    // the data descriptor right after the bytes repeats the checksum and size
    expect(buf.readUInt32LE(dataStart + size)).toBe(0x08074b50);
    expect(buf.readUInt32LE(dataStart + size + 4)).toBe(crc);
    entries.push({ name, data: data.toString("utf8") });
    p += 46 + nameLen;
  }
  return entries;
}
const binary = (res: request.Response) => Buffer.from(res.body as Buffer);
const get = (url: string) =>
  request(t.app)
    .get(url)
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });

describe("downloading a shared folder as a zip", () => {
  it("includes everything beneath it with its folders, and counts the downloads", async () => {
    const me = await createUser();
    const root = await folder(me, "Holiday");
    const pics = await folder(me, "Pics", root._id);
    const deep = await folder(me, "Deep", pics._id);
    await addFile(me, "notes.txt", "packing list", root._id);
    await addFile(me, "beach.txt", "sand", pics._id);
    await addFile(me, "café ☕.txt", "unicode", deep._id);
    await addFile(me, "old.txt", "stale", root._id, { expiry: new Date(Date.now() - 1000) });
    await addFile(me, "elsewhere.txt", "not shared", null);
    const token = (await api(me).post(`/folders/${root._id}/share`)).body.data.folder.shareToken;

    const res = await get(`/api/xendrive/public/folder/${token}/zip`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toContain("Holiday.zip");
    const zip = readZip(binary(res));
    expect(zip.map((e) => e.name).sort()).toEqual([
      "Holiday/Pics/Deep/café ☕.txt",
      "Holiday/Pics/beach.txt",
      "Holiday/notes.txt",
    ]);
    expect(zip.find((e) => e.name === "Holiday/notes.txt")?.data).toBe("packing list");

    const after = (await api(me).get(`/folders/${root._id}/stats`)).body.data;
    expect(after.files).toBe(4); // the expired file is still the owner's
    const folderRow = (await api(me).get("/browse")).body.data.folders.find((f: any) => f._id === root._id);
    expect(folderRow.downloads).toBe(3);
  });

  it("can zip just a folder inside the share, and refuses one outside it", async () => {
    const me = await createUser();
    const root = await folder(me, "Root");
    const sub = await folder(me, "Sub", root._id);
    const outside = await folder(me, "Outside");
    await addFile(me, "in.txt", "inside", sub._id);
    await addFile(me, "out.txt", "outside", outside._id);
    const token = (await api(me).post(`/folders/${root._id}/share`)).body.data.folder.shareToken;

    const res = await get(`/api/xendrive/public/folder/${token}/zip?folder=${sub._id}`);
    expect(readZip(binary(res)).map((e) => e.name)).toEqual(["Sub/in.txt"]);
    expect((await get(`/api/xendrive/public/folder/${token}/zip?folder=${outside._id}`)).status).toBe(404);
  });

  it("keeps two files with the same name apart, and says so when there is nothing to download", async () => {
    const me = await createUser();
    const root = await folder(me, "Dupes");
    await addFile(me, "a.txt", "one", root._id);
    await addFile(me, "a.txt", "two", root._id);
    const empty = await folder(me, "Empty");
    const token = (await api(me).post(`/folders/${root._id}/share`)).body.data.folder.shareToken;
    const emptyToken = (await api(me).post(`/folders/${empty._id}/share`)).body.data.folder.shareToken;

    expect(
      readZip(binary(await get(`/api/xendrive/public/folder/${token}/zip`)))
        .map((e) => e.name)
        .sort(),
    ).toEqual(["Dupes/a (2).txt", "Dupes/a.txt"]);
    expect((await get(`/api/xendrive/public/folder/${emptyToken}/zip`)).status).toBe(404);
  });

  it("needs the password: asked for in a POST, then used as a ticket", async () => {
    const me = await createUser();
    const root = await folder(me, "Locked");
    await addFile(me, "x.txt", "secret", root._id);
    const token = (await api(me).post(`/folders/${root._id}/share`)).body.data.folder.shareToken;
    await api(me).put(`/folders/${root._id}/share/settings`, { password: "pw" });

    expect((await get(`/api/xendrive/public/folder/${token}/zip`)).status).toBe(403);
    const base = `/api/xendrive/public/folder/${token}/zip`;
    expect((await request(t.app).post(`${base}/ticket`).send({ password: "bad" })).status).toBe(403);
    const ticket = (await request(t.app).post(`${base}/ticket`).send({ password: "pw" })).body.data.ticket;
    const res = await get(`${base}?ticket=${encodeURIComponent(ticket)}`);
    expect(res.status).toBe(200);
    expect(readZip(binary(res)).map((e) => e.name)).toEqual(["Locked/x.txt"]);
    // A ticket made for the whole share isn't good for a different folder inside it.
    expect((await get(`${base}?folder=${root._id}&ticket=${encodeURIComponent(ticket)}`)).status).toBe(403);
  });

  it("isn't reachable when the link is off or has expired", async () => {
    const me = await createUser();
    const root = await folder(me, "Gone");
    await addFile(me, "x.txt", "x", root._id);
    expect((await get(`/api/xendrive/public/folder/nope-nope-nope/zip`)).status).toBe(404);
    const token = (await api(me).post(`/folders/${root._id}/share`)).body.data.folder.shareToken;
    await api(me).put(`/folders/${root._id}/share/settings`, { expiry: new Date(Date.now() - 1000).toISOString() });
    expect((await get(`/api/xendrive/public/folder/${token}/zip`)).status).toBe(403);
  });
});

describe("zip helpers", () => {
  it("checksums like CRC-32", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(Buffer.from("6789"), crc32(Buffer.from("12345")))).toBe(0xcbf43926);
  });

  it("makes safe, unique entry names", () => {
    const taken = new Set<string>();
    expect(zipPath(["Top", "..", "a\\b.txt"], taken)).toBe("Top/_/a_b.txt");
    expect(zipPath(["Top", "x/y"], taken)).toBe("Top/x_y");
    expect(zipPath(["Top", "x.txt"], taken)).toBe("Top/x.txt");
    expect(zipPath(["Top", "X.TXT"], taken)).toBe("Top/X (2).TXT");
    expect(zipPath(["Top", "noext"], taken)).toBe("Top/noext");
    expect(zipPath(["Top", "noext"], taken)).toBe("Top/noext (2)");
  });
});
