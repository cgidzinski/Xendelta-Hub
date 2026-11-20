import mongoose from "mongoose";
import request from "supertest";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createUser, startTestApp, type TestApp } from "../testing/testApp";

let t: TestApp;
beforeAll(async () => {
  const keys = webpush.generateVAPIDKeys();
  vi.stubEnv("VAPID_PUBLIC_KEY", keys.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
  t = await startTestApp([() => import("./xennote/index.js"), () => import("./feed/index.js")]);
}, 180_000);
afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await t?.stop();
}, 60_000);

type User = Awaited<ReturnType<typeof createUser>>;
const call = (method: "get" | "post" | "put" | "delete", path: string, user?: User) => {
  const req = request(t.app)[method](`/api/xennote${path}`);
  return user ? req.auth(user.token, { type: "bearer" }) : req;
};

async function notebook(owner: User, name: string) {
  const book = await call("post", "/notebooks", owner).send({ name });
  expect(book.status, JSON.stringify(book.body)).toBe(200);
  const id = book.body.data.notebook._id as string;
  const section = await call("post", `/notebooks/${id}/sections`, owner).send({ name: "Plans" });
  expect(section.status, JSON.stringify(section.body)).toBe(200);
  return { id, section: section.body.data.section.id as string };
}

async function page(owner: User, section: string, title: string, parent_id?: string) {
  const result = await call("post", `/sections/${section}/pages`, owner).send({ title, parent_id });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body.data.page.id as string;
}

describe("XenNote page and notebook sharing", () => {
  it("opens public page links with the caller's own role and signs only files in the saved page", async () => {
    const [owner, viewer, outsider] = await Promise.all([createUser(), createUser(), createUser()]);
    const book = await notebook(owner, "Work");
    const id = await page(owner, book.section, "Release");
    const other = await page(owner, book.section, "Private");
    const upload = (pageId: string, name: string) =>
      call("post", `/pages/${pageId}/files`, owner).attach("files", Buffer.from(name), {
        filename: name,
        contentType: "text/plain",
      });
    const used = (await upload(id, "used.txt")).body.data.files[0].id;
    const unused = (await upload(id, "unused.txt")).body.data.files[0].id;
    const foreign = (await upload(other, "foreign.txt")).body.data.files[0].id;
    const saved = await call("put", `/pages/${id}/body`, owner).send({
      base_rev: 0,
      doc: {
        type: "doc",
        content: [used, foreign].map((file_id) => ({ type: "fileBlock", attrs: { file_id, name: "File" } })),
      },
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect((await call("post", `/pages/${id}/share`, outsider)).status).toBe(404);
    const enabled = await call("post", `/pages/${id}/share`, owner);
    expect(enabled.status, JSON.stringify(enabled.body)).toBe(200);
    const token = enabled.body.data.token as string;
    const read = await call("get", `/public/page/${token}`);
    expect(read.body.data).toMatchObject({ id, title: "Release", files: { [used]: { name: "used.txt" } } });
    expect(read.body.data.files[used].url).toContain("?expires=");
    expect(read.body.data.files).not.toHaveProperty(foreign);
    expect(read.body.data.files).not.toHaveProperty(unused);
    expect((await call("get", `/shared/page/${token}`, outsider)).body.data).toMatchObject({
      access: "link",
      role: null,
    });
    expect((await call("get", `/pages/${id}`, outsider)).status).toBe(404);
    await call("post", `/pages/${id}/people`, owner).send({ userIds: [viewer.user.id], role: "viewer" });
    expect((await call("get", `/shared/page/${token}`, viewer)).body.data).toMatchObject({
      access: "member",
      role: "viewer",
      page_id: id,
      notebook_id: null,
    });
    expect((await call("get", `/pages/${id}/people`, viewer)).body.data.token).toBeNull();
    expect((await call("delete", `/pages/${id}/share`, viewer)).status).toBe(403);
    const next = (await call("post", `/pages/${id}/share/rotate`, owner)).body.data.token;
    expect(next).not.toBe(token);
    expect((await call("get", `/public/page/${token}`)).status).toBe(404);
    expect((await call("get", `/public/page/${next}`)).status).toBe(200);
    await call("delete", `/pages/${id}/share`, owner);
    expect((await call("get", `/public/page/${next}`)).status).toBe(404);
  });

  it("limits shared notebooks to their visible pages", async () => {
    const owner = await createUser();
    const book = await notebook(owner, "Work");
    const unrelated = await notebook(owner, "Private");
    const id = await page(owner, book.section, "Release");
    const child = await page(owner, book.section, "Checklist", id);
    const hidden = await page(owner, book.section, "Archive");
    const hiddenChild = await page(owner, book.section, "Hidden child", hidden);
    const foreign = await page(owner, unrelated.section, "Outside");
    await call("put", `/pages/${hidden}`, owner).send({ archived: true });
    const token = (await call("post", `/notebooks/${book.id}/share`, owner)).body.data.notebook.share.token;
    const view = await call("get", `/public/notebook/${token}`);
    expect(view.body.data.sections).toEqual([{ id: book.section, name: "Plans" }]);
    expect(view.body.data.pages.map((entry: { id: string }) => entry.id)).toEqual(expect.arrayContaining([id, child]));
    expect(view.body.data.pages).toHaveLength(2);
    expect(view.body.data.notes).toBeUndefined();
    for (const excluded of [hidden, hiddenChild, foreign]) {
      expect((await call("get", `/public/notebook/${token}/pages/${excluded}`)).status).toBe(404);
    }
    expect((await call("get", `/public/notebook/${token}/pages/${child}`)).body.data.title).toBe("Checklist");
  });

  it("groups direct shares by sender, tracks markers, and delivers share notifications and feed entries", async () => {
    const [owner, guest, outsider] = await Promise.all([createUser(), createUser(), createUser()]);
    const sendPush = vi
      .spyOn(webpush, "sendNotification")
      .mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    await mongoose.model("PushSubscription").create({
      userId: guest.user.id,
      endpoint: "https://push.example.test/phase5",
      keys: { p256dh: "unused-in-test", auth: "unused-in-test" },
    });
    try {
      const book = await notebook(owner, "Work");
      const privateBook = await notebook(owner, "Private");
      const id = await page(owner, privateBook.section, "Release");
      const child = await page(owner, privateBook.section, "Child", id);
      const people = { userIds: [guest.user.id], role: "viewer" };
      expect((await call("post", `/notebooks/${book.id}/members`, owner).send(people)).status).toBe(200);
      expect((await call("post", `/pages/${id}/people`, owner).send(people)).status).toBe(200);
      expect((await call("post", `/pages/${id}/people`, owner).send(people)).status).toBe(200);

      const notifications = await mongoose.model("Notification").find({ userId: guest.user.id }).lean();
      const links = [`/internal/xennote/b/${book.id}`, `/internal/xennote/p/${id}`];
      expect(notifications).toHaveLength(2);
      expect(notifications.map((item) => item.link)).toEqual(expect.arrayContaining(links));
      expect(sendPush).toHaveBeenCalledTimes(2);
      expect(sendPush.mock.calls.map(([, payload]) => JSON.parse(String(payload)).url)).toEqual(links);
      const feed = () => request(t.app).get("/api/feed").auth(guest.token, { type: "bearer" });
      expect((await feed()).body.data.entries.map((entry: { verb: string }) => entry.verb)).toEqual(
        expect.arrayContaining(["xennote.page_shared", "xennote.notebook_shared"]),
      );

      const list = async () => (await call("get", "/shared-items", guest)).body.data;
      expect(await list()).toMatchObject([
        {
          sender: { user_id: owner.user.id },
          items: [
            { kind: "page", id, status: "new" },
            { kind: "notebook", id: book.id, status: "new" },
          ],
        },
      ]);
      expect((await call("get", "/shared-items", outsider)).body.data).toEqual([]);
      const read = await call("get", `/pages/${id}`, guest);
      expect(read.body.data.children).toEqual([{ id: child, title: "Child" }]);
      expect(
        (await call("post", `/shared-items/page/${id}/seen`, guest).send({ through: read.body.data.viewed_at })).status,
      ).toBe(200);
      const tree = await call("get", `/notebooks/${book.id}/tree`, guest);
      await call("post", `/shared-items/notebook/${book.id}/seen`, guest).send({ through: tree.body.data.viewed_at });
      expect((await list())[0].items.map((item: { status: string }) => item.status)).toEqual([null, null]);
      await call("put", `/pages/${id}`, owner).send({ title: "Release v2" });
      await page(owner, book.section, "New notes");
      expect((await list())[0].items.map((item: { status: string }) => item.status)).toEqual(["changed", "changed"]);
      await call("delete", `/pages/${id}/people/${guest.user.id}`, owner);
      expect((await list())[0].items.map((item: { id: string }) => item.id)).toEqual([book.id]);
      expect((await feed()).body.data.entries.map((entry: { verb: string }) => entry.verb)).not.toContain(
        "xennote.page_shared",
      );
    } finally {
      sendPush.mockRestore();
    }
  });
});
