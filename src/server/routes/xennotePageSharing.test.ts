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

async function page(owner: User, section: string, title: string) {
  const result = await call("post", `/sections/${section}/pages`, owner).send({ title });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body.data.page.id as string;
}

describe("XenNote page and notebook sharing", () => {
  it("retires legacy page grants and signs only saved files through the notebook link", async () => {
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
    const retiredToken = "p".repeat(22);
    await mongoose
      .model("XenNotePage")
      .updateOne(
        { _id: id },
        { share: { enabled: true, token: retiredToken }, members: [{ user_id: viewer.user.id, role: "editor" }] },
      );
    expect((await call("post", `/pages/${id}/share`, owner)).status).toBe(404);
    expect(
      (await call("post", `/pages/${id}/people`, owner).send({ userIds: [outsider.user.id], role: "viewer" })).status,
    ).toBe(404);
    expect((await call("get", `/shared/page/${retiredToken}`, viewer)).status).toBe(404);
    expect((await call("get", `/public/page/${retiredToken}`, owner)).status).toBe(404);
    expect((await call("get", `/public/page/${retiredToken}/blocks/${id}/original`, owner)).status).toBe(404);
    expect((await call("get", `/pages/${id}`, viewer)).status).toBe(404);
    expect((await call("get", "/shared-items", viewer)).body.data).toEqual([]);

    await call("post", `/notebooks/${book.id}/members`, owner).send({ userIds: [viewer.user.id], role: "viewer" });
    const member = await call("get", `/pages/${id}`, viewer);
    expect(member.body.data.page).toMatchObject({ my_role: "viewer", can_edit: false });

    const enabled = await call("post", `/notebooks/${book.id}/share`, owner);
    const token = enabled.body.data.notebook.share.token;
    const read = await call("get", `/public/notebook/${token}/pages/${id}`);
    expect(read.body.data).toMatchObject({ id, title: "Release", files: { [used]: { name: "used.txt" } } });
    expect(read.body.data.files[used].url).toContain("?expires=");
    expect(read.body.data.files).not.toHaveProperty(foreign);
    expect(read.body.data.files).not.toHaveProperty(unused);
  });

  it("limits shared notebooks to their visible pages", async () => {
    const owner = await createUser();
    const book = await notebook(owner, "Work");
    const unrelated = await notebook(owner, "Private");
    const id = await page(owner, book.section, "Release");
    const checklist = await page(owner, book.section, "Checklist");
    const hidden = await page(owner, book.section, "Archive");
    const foreign = await page(owner, unrelated.section, "Outside");
    await call("put", `/pages/${hidden}`, owner).send({ archived: true });
    const token = (await call("post", `/notebooks/${book.id}/share`, owner)).body.data.notebook.share.token;
    const view = await call("get", `/public/notebook/${token}`);
    expect(view.body.data.sections).toEqual([{ id: book.section, name: "Plans" }]);
    expect(view.body.data.pages.map((entry: { id: string }) => entry.id)).toEqual(
      expect.arrayContaining([id, checklist]),
    );
    expect(view.body.data.pages).toHaveLength(2);
    expect(view.body.data.notes).toBeUndefined();
    for (const excluded of [hidden, foreign]) {
      expect((await call("get", `/public/notebook/${token}/pages/${excluded}`)).status).toBe(404);
    }
    expect((await call("get", `/public/notebook/${token}/pages/${checklist}`)).body.data.title).toBe("Checklist");
  });

  it("groups shared notebooks by sender, tracks markers, and delivers notifications and feed entries", async () => {
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
      const people = { userIds: [guest.user.id], role: "viewer" };
      expect((await call("post", `/notebooks/${book.id}/members`, owner).send(people)).status).toBe(200);

      const notifications = await mongoose.model("Notification").find({ userId: guest.user.id }).lean();
      const links = [`/internal/xennote/b/${book.id}`];
      expect(notifications).toHaveLength(1);
      expect(notifications.map((item) => item.link)).toEqual(expect.arrayContaining(links));
      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(sendPush.mock.calls.map(([, payload]) => JSON.parse(String(payload)).url)).toEqual(links);
      const feed = () => request(t.app).get("/api/feed").auth(guest.token, { type: "bearer" });
      expect((await feed()).body.data.entries.map((entry: { verb: string }) => entry.verb)).toEqual(
        expect.arrayContaining(["xennote.notebook_shared"]),
      );

      const list = async () => (await call("get", "/shared-items", guest)).body.data;
      expect(await list()).toMatchObject([
        {
          sender: { user_id: owner.user.id },
          items: [{ kind: "notebook", id: book.id, status: "new" }],
        },
      ]);
      expect((await call("get", "/shared-items", outsider)).body.data).toEqual([]);
      const tree = await call("get", `/notebooks/${book.id}/tree`, guest);
      await call("post", `/shared-items/notebook/${book.id}/seen`, guest).send({ through: tree.body.data.viewed_at });
      expect((await list())[0].items.map((item: { status: string }) => item.status)).toEqual([null]);
      await page(owner, book.section, "New notes");
      expect((await list())[0].items.map((item: { status: string }) => item.status)).toEqual(["changed"]);
    } finally {
      sendPush.mockRestore();
    }
  });
});
