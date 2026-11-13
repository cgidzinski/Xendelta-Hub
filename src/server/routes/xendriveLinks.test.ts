import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { Readable } from "stream";
import { vi } from "vitest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Share-link passwords (hashed), a folder link's password and expiry, and download counts, through the real routes
// and models. Only storage is faked.
vi.mock("../config/gcs", () => ({
  privateBucket: {
    file: () => ({
      exists: async () => [true],
      createReadStream: () => Readable.from([Buffer.alloc(10, "x")]),
      delete: async () => undefined,
    }),
  },
}));
vi.mock("../utils/gcsUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  deleteFromGCS: vi.fn(async () => undefined),
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
const auth = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const api = (who: U) => ({
  get: (url: string) => request(t.app).get(`/api/xendrive${url}`).set(auth(who)),
  post: (url: string, body?: object) => request(t.app).post(`/api/xendrive${url}`).set(auth(who)).send(body),
  put: (url: string, body: object) => request(t.app).put(`/api/xendrive${url}`).set(auth(who)).send(body),
  del: (url: string) => request(t.app).delete(`/api/xendrive${url}`).set(auth(who)),
});
const pub = (url: string) => request(t.app).get(`/api/xendrive${url}`);
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
const sharedFolder = async (who: U, name: string) => {
  const made = await api(who).post("/folders", { name });
  const id = made.body.data.folder._id as string;
  const token = (await api(who).post(`/folders/${id}/share`)).body.data.folder.shareToken as string;
  return { id, token };
};
const storedFile = async (id: string) => {
  const { XenDriveFile } = await import("../models/xendriveFile.js");
  return XenDriveFile.findById(id).lean<any>();
};

describe("a file link's password", () => {
  it("is stored as a hash, never sent back, and still gates the download", async () => {
    const me = await createUser();
    const file = await addFile(me, "plan.txt", null);
    const set = await api(me).put(`/files/${file.id}/settings`, { password: "hunter2", shareEnabled: true });
    expect(set.status).toBe(200);
    expect(set.body.data).toMatchObject({ hasPassword: true });
    expect(JSON.stringify(set.body)).not.toContain("hunter2");

    const detail = await api(me).get(`/files/${file.id}`);
    expect(detail.body.data.file.hasPassword).toBe(true);
    expect(detail.body.data.file).not.toHaveProperty("password");
    expect(detail.body.data.file).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(detail.body)).not.toContain("hunter2");

    const stored = await storedFile(file.id);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored.passwordHash).not.toContain("hunter2");
    expect(stored.password).toBeUndefined();

    const token = detail.body.data.file.shareToken;
    expect((await pub(`/download/${token}`)).status).toBe(401);
    expect((await pub(`/download/${token}?password=nope`)).status).toBe(401);
    expect((await pub(`/download/${token}?password=hunter2`)).status).toBe(200);
    expect((await pub(`/info/${token}`)).body.data.requiresPassword).toBe(true);
  });

  it("can be changed and removed", async () => {
    const me = await createUser();
    const file = await addFile(me, "a.txt", null);
    await api(me).put(`/files/${file.id}/settings`, { password: "first", shareEnabled: true });
    const token = (await api(me).get(`/files/${file.id}`)).body.data.file.shareToken;

    await api(me).put(`/files/${file.id}/settings`, { password: "second" });
    expect((await pub(`/download/${token}?password=first`)).status).toBe(401);
    expect((await pub(`/download/${token}?password=second`)).status).toBe(200);

    const removed = await api(me).put(`/files/${file.id}/settings`, { password: null });
    expect(removed.body.data.hasPassword).toBe(false);
    expect((await pub(`/download/${token}`)).status).toBe(200);
  });

  it("still honours an old plain-text password until the migration has run, and replaces it when changed", async () => {
    const me = await createUser();
    const file = await addFile(me, "old.txt", null, { password: "legacy", shareEnabled: true });
    const token = file.shareToken as string;

    expect((await api(me).get(`/files/${file.id}`)).body.data.file.hasPassword).toBe(true);
    expect((await pub(`/download/${token}`)).status).toBe(401);
    expect((await pub(`/download/${token}?password=wrong`)).status).toBe(401);
    expect((await pub(`/download/${token}?password=legacy`)).status).toBe(200);

    await api(me).put(`/files/${file.id}/settings`, { password: "modern" });
    const stored = await storedFile(file.id);
    expect(stored.password).toBeUndefined();
    expect((await pub(`/download/${token}?password=legacy`)).status).toBe(401);
    expect((await pub(`/download/${token}?password=modern`)).status).toBe(200);
  });
});

describe("download counts", () => {
  it("counts each public download of a file, with when it last happened, and not refused ones", async () => {
    const me = await createUser();
    const file = await addFile(me, "count.txt", null);
    await api(me).put(`/files/${file.id}/settings`, { password: "pw", shareEnabled: true });
    const token = (await api(me).get(`/files/${file.id}`)).body.data.file.shareToken;

    expect((await api(me).get(`/files/${file.id}`)).body.data.file).toMatchObject({
      downloads: 0,
      lastDownloadedAt: null,
    });
    await pub(`/download/${token}`); // refused: no password
    await pub(`/download/${token}?password=pw`);
    await pub(`/download/${token}?password=pw`);

    const after = (await api(me).get(`/files/${file.id}`)).body.data.file;
    expect(after.downloads).toBe(2);
    expect(new Date(after.lastDownloadedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe("a folder link's password, expiry and downloads", () => {
  it("asks for the password before showing or serving anything", async () => {
    const me = await createUser();
    const { id, token } = await sharedFolder(me, "Locked");
    const inside = await addFile(me, "secret.txt", id);

    const set = await api(me).put(`/folders/${id}/share/settings`, { password: "open sesame" });
    expect(set.status).toBe(200);
    expect(set.body.data.folder).toMatchObject({ hasPassword: true });
    expect(JSON.stringify(set.body)).not.toContain("open sesame");
    expect(JSON.stringify(set.body)).not.toContain("passwordHash");

    expect((await pub(`/public/folder/${token}/info`)).body.data).toMatchObject({
      name: "Locked",
      requiresPassword: true,
    });

    const none = await pub(`/public/folder/${token}`);
    expect(none.status).toBe(403); // not 401: the client signs out on a 401
    expect(none.body.message).toBe("Password required");
    const wrong = await pub(`/public/folder/${token}?password=guess`);
    expect(wrong.status).toBe(403);
    expect(wrong.body.message).toBe("Incorrect password");
    expect((await pub(`/public/folder/${token}/files/${inside.id}`)).status).toBe(403);

    const ok = await pub(`/public/folder/${token}?password=${encodeURIComponent("open sesame")}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.files.map((f: any) => f.name)).toEqual(["secret.txt"]);
    expect(
      (await pub(`/public/folder/${token}/files/${inside.id}?password=${encodeURIComponent("open sesame")}`)).status,
    ).toBe(200);

    await api(me).put(`/folders/${id}/share/settings`, { password: null });
    expect((await pub(`/public/folder/${token}`)).status).toBe(200);
    expect((await pub(`/public/folder/${token}/info`)).body.data.requiresPassword).toBe(false);
  });

  it("stops working when it expires, and works again once the expiry is cleared", async () => {
    const me = await createUser();
    const { id, token } = await sharedFolder(me, "Temporary");
    await addFile(me, "x.txt", id);

    const set = await api(me).put(`/folders/${id}/share/settings`, {
      expiry: new Date(Date.now() - 1000).toISOString(),
    });
    expect(set.body.data.folder.expiry).toBeTruthy();
    const gone = await pub(`/public/folder/${token}`);
    expect(gone.status).toBe(403);
    expect(gone.body.message).toBe("Link expired");
    expect((await pub(`/public/folder/${token}/info`)).body).toMatchObject({ isExpired: true });

    await api(me).put(`/folders/${id}/share/settings`, { expiry: new Date(Date.now() + 3_600_000).toISOString() });
    expect((await pub(`/public/folder/${token}`)).status).toBe(200);
    await api(me).put(`/folders/${id}/share/settings`, { expiry: null });
    expect((await api(me).get(`/browse`)).body.data.folders[0].expiry).toBeNull();
  });

  it("keeps its password and expiry when the link is turned off and on or replaced", async () => {
    const me = await createUser();
    const { id, token } = await sharedFolder(me, "Keeps");
    const expiry = new Date(Date.now() + 86_400_000).toISOString();
    await api(me).put(`/folders/${id}/share/settings`, { password: "kept", expiry });

    await api(me).del(`/folders/${id}/share`);
    const back = await api(me).post(`/folders/${id}/share`);
    expect(back.body.data.folder).toMatchObject({ hasPassword: true, shareToken: token });
    const rotated = await api(me).post(`/folders/${id}/share/rotate`);
    expect(rotated.body.data.folder.shareToken).not.toBe(token);
    expect(rotated.body.data.folder).toMatchObject({ hasPassword: true });
    expect(new Date(rotated.body.data.folder.expiry).toISOString()).toBe(expiry);
  });

  it("counts downloads through the folder link on the folder and on the file", async () => {
    const me = await createUser();
    const { id, token } = await sharedFolder(me, "Counted");
    const one = await addFile(me, "one.txt", id);
    const two = await addFile(me, "two.txt", id);

    await pub(`/public/folder/${token}/files/${one.id}`);
    await pub(`/public/folder/${token}/files/${one.id}`);
    await pub(`/public/folder/${token}/files/${two.id}`);

    const folder = (await api(me).get(`/browse`)).body.data.folders.find((f: any) => f._id === id);
    expect(folder.downloads).toBe(3);
    expect(new Date(folder.lastDownloadedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect((await storedFile(one.id)).downloads).toBe(2);
    expect((await storedFile(two.id)).downloads).toBe(1);
  });

  it("only the owner can change a folder link's settings", async () => {
    const [me, other] = await Promise.all([createUser(), createUser()]);
    const { id } = await sharedFolder(me, "Mine");
    expect((await api(other).put(`/folders/${id}/share/settings`, { password: "x" })).status).toBe(404);
  });
});
