import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { hashSharePassword } from "../utils/sharePasswords";
import { getJwtSecret } from "../config/env";

// Public downloads: the link's password travels in a header or a POST body, never in the address the file streams
// from; a short-lived ticket stands in for it. Only storage is faked.
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
const addFile = async (who: U, name: string, folderId: string | null = null, extra: object = {}) => {
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
    ...extra,
  });
};
const ticketOf = (res: request.Response) => res.body.data.ticket as string;

describe("a file link with a password", () => {
  async function locked() {
    const me = await createUser();
    const file = await addFile(me, "plan.txt", null, {
      shareEnabled: true,
      passwordHash: await hashSharePassword("hunter2"),
    });
    const token = (await api(me).get(`/files/${file.id}`)).body.data.file.shareToken as string;
    return { me, file, token };
  }
  const ask = (token: string, body: object = {}) =>
    request(t.app).post(`/api/xendrive/download/${token}/ticket`).send(body);

  it("hands out a ticket for the right password, and the ticket downloads without one", async () => {
    const { token } = await locked();
    expect((await ask(token)).status).toBe(401);
    expect((await ask(token, { password: "wrong" })).status).toBe(401);

    const res = await ask(token, { password: "hunter2" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const dl = await request(t.app).get(`/api/xendrive/download/${token}?ticket=${encodeURIComponent(ticketOf(res))}`);
    expect(dl.status).toBe(200);
    expect(dl.headers["content-disposition"]).toContain("plan.txt");
    // Without the ticket it still wants the password.
    expect((await request(t.app).get(`/api/xendrive/download/${token}`)).status).toBe(401);
  });

  it("also takes the password in a header (and in the address, for older links)", async () => {
    const { token } = await locked();
    const viaHeader = await request(t.app).get(`/api/xendrive/download/${token}`).set("X-Share-Password", "hunter2");
    expect(viaHeader.status).toBe(200);
    expect((await request(t.app).get(`/api/xendrive/download/${token}?password=hunter2`)).status).toBe(200);
    expect((await request(t.app).get(`/api/xendrive/download/${token}`).set("X-Share-Password", "nope")).status).toBe(
      401,
    );
  });

  it("rejects a ticket that is expired, forged, or made for another file", async () => {
    const a = await locked();
    const b = await locked();
    const ticketA = ticketOf(await ask(a.token, { password: "hunter2" }));
    // Another file's link doesn't accept it.
    expect(
      (await request(t.app).get(`/api/xendrive/download/${b.token}?ticket=${encodeURIComponent(ticketA)}`)).status,
    ).toBe(401);

    const expired = jwt.sign({ purpose: "xendrive-download", link: a.token, file: a.file.id }, getJwtSecret(), {
      expiresIn: -10,
    });
    expect((await request(t.app).get(`/api/xendrive/download/${a.token}?ticket=${expired}`)).status).toBe(401);
    const forged = jwt.sign({ purpose: "xendrive-download", link: a.token, file: a.file.id }, "not-the-secret");
    expect((await request(t.app).get(`/api/xendrive/download/${a.token}?ticket=${forged}`)).status).toBe(401);
    const wrongPurpose = jwt.sign({ purpose: "login", link: a.token, file: a.file.id }, getJwtSecret());
    expect((await request(t.app).get(`/api/xendrive/download/${a.token}?ticket=${wrongPurpose}`)).status).toBe(401);
  });

  it("a ticket never outlives the link: switched off, it stops working", async () => {
    const { me, file, token } = await locked();
    const ticket = ticketOf(await ask(token, { password: "hunter2" }));
    await api(me).put(`/files/${file.id}/settings`, { shareEnabled: false });
    expect(
      (await request(t.app).get(`/api/xendrive/download/${token}?ticket=${encodeURIComponent(ticket)}`)).status,
    ).toBe(404);
  });
});

describe("a folder link with a password", () => {
  async function lockedFolder() {
    const me = await createUser();
    const folder = (await api(me).post("/folders", { name: "Shared" })).body.data.folder;
    const inside = await addFile(me, "inside.txt", folder._id);
    const outside = await addFile(me, "outside.txt", null);
    const token = (await api(me).post(`/folders/${folder._id}/share`)).body.data.folder.shareToken as string;
    const set = await api(me).put(`/folders/${folder._id}/share/settings`, { password: "open-sesame" });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    return { token, inside, outside };
  }
  const ask = (token: string, fileId: string, body: object = {}) =>
    request(t.app).post(`/api/xendrive/public/folder/${token}/files/${fileId}/ticket`).send(body);

  it("lists with the password in a header, and downloads with a ticket", async () => {
    const { token, inside } = await lockedFolder();
    expect((await request(t.app).get(`/api/xendrive/public/folder/${token}`)).status).toBe(403);
    const listed = await request(t.app)
      .get(`/api/xendrive/public/folder/${token}`)
      .set("X-Share-Password", "open-sesame");
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    expect(listed.body.data.files.map((f: any) => f.name)).toEqual(["inside.txt"]);

    expect((await ask(token, inside.id)).status).toBe(403);
    const res = await ask(token, inside.id, { password: "open-sesame" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const dl = await request(t.app).get(
      `/api/xendrive/public/folder/${token}/files/${inside.id}?ticket=${encodeURIComponent(ticketOf(res))}`,
    );
    expect(dl.status).toBe(200);
    expect((await request(t.app).get(`/api/xendrive/public/folder/${token}/files/${inside.id}`)).status).toBe(403);
  });

  it("won't issue a ticket for a file outside the folder, and a ticket is for one file only (the password is asked for again)", async () => {
    const { token, inside, outside } = await lockedFolder();
    expect((await ask(token, outside.id, { password: "open-sesame" })).status).toBe(404);
    const ticket = ticketOf(await ask(token, inside.id, { password: "open-sesame" }));
    expect(
      (
        await request(t.app).get(
          `/api/xendrive/public/folder/${token}/files/${outside.id}?ticket=${encodeURIComponent(ticket)}`,
        )
      ).status,
    ).toBe(403);
  });
});
