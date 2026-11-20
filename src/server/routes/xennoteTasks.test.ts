import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createUser, startTestApp, type TestApp } from "../testing/testApp";
import { up } from "../../../migrations/1796200000000-xennote-task-index";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp([() => import("./xennote/index.js")]);
}, 120_000);
afterAll(async () => {
  await app?.stop();
}, 45_000);

it("backfills tasks and lets editors tick them without replacing other text", async () => {
  const [owner, viewer, stranger] = await Promise.all([createUser(), createUser(), createUser()]);
  const route = (method: "post" | "get" | "put", path: string, user = owner) =>
    request(app.app)[method](`/api/xennote${path}`).auth(user.token, { type: "bearer" });
  const post = (path: string, value: object) => route("post", path).send(value);
  const book = (await post("/notebooks", { name: "Tasks" })).body.data.notebook._id;
  const section = (await post(`/notebooks/${book}/sections`, { name: "Notes" })).body.data.section.id;
  const page = (await post(`/sections/${section}/pages`, { title: "Work" })).body.data.page.id;
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Keep this text" }] },
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { id: "task-one", checked: false },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Finish work" }] }],
          },
        ],
      },
    ],
  };
  const created = await route("put", `/pages/${page}/body`).send({ base_rev: 0, doc });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  const row = await mongoose.model("XenNotePage").findById(page).lean();
  await mongoose.connection.collection("xennotepages").updateOne({ _id: row?._id }, { $unset: { task_items: "" } });
  await up(mongoose.connection);
  await up(mongoose.connection);
  await post(`/notebooks/${book}/members`, { userIds: [viewer.user.id], role: "viewer" });
  const tasks = await route("get", `/tasks?notebook=${book}`, viewer);
  expect(tasks.body.data.items).toMatchObject([
    { block_id: "task-one", text: "Finish work", page_id: page, can_edit: false },
  ]);
  expect((await route("get", "/tasks", stranger)).body.data.items).toEqual([]);
  const toggle = `/pages/${page}/tasks/task-one`;
  expect((await route("put", toggle, viewer).send({ checked: true })).status).toBe(403);
  expect((await route("put", toggle).send({ checked: true })).status).toBe(200);
  expect((await route("get", "/tasks")).body.data.items).toEqual([]);
  expect((await route("get", "/tasks?done=true")).body.data.items).toMatchObject([{ done: true, text: "Finish work" }]);
  const body = (await route("get", `/pages/${page}`)).body.data.doc;
  expect(body.content[0].content[0].text).toBe("Keep this text");
  expect(body.content[1].content[0].attrs.checked).toBe(true);
}, 45_000);
