import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createUser, startTestApp, type TestApp } from "../testing/testApp";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp([() => import("./xennote/index.js")]);
}, 120_000);
afterAll(async () => {
  await app?.stop();
}, 45_000);

it("writes validated typed properties and scopes queries to live, accessible pages", async () => {
  const [owner, guest] = await Promise.all([createUser(), createUser()]);
  const route = (method: "post" | "get" | "put", path: string, user = owner) =>
    request(app.app)[method](`/api/xennote${path}`).auth(user.token, { type: "bearer" });
  const addBook = async (name: string) => {
    const book = (await route("post", "/notebooks").send({ name })).body.data.notebook._id;
    return {
      book,
      section: (await route("post", `/notebooks/${book}/sections`).send({ name: "Notes" })).body.data.section.id,
    };
  };
  const { book, section } = await addBook("Properties");
  const { section: other } = await addBook("Other");
  const addPage = async (area: string, title: string) =>
    (await route("post", `/sections/${area}/pages`).send({ title })).body.data.page.id;
  const [dashboard, match, hidden, outside] = await Promise.all([
    addPage(section, "Dashboard"),
    addPage(section, "Visible"),
    addPage(section, "Hidden"),
    addPage(other, "Outside"),
  ]);
  const sheet = [
    { key: "Hours", type: "number", value: 5 },
    { key: "Due date", type: "date", value: "2026-11-20" },
    { key: "State", type: "status", value: "In progress" },
    { key: "Priority", type: "select", value: "High", options: ["Low", "High"] },
    { key: "Owner", type: "text", value: "Maya" },
  ];
  for (const id of [match, hidden, outside]) {
    const properties = await route("put", `/pages/${id}/properties`).send({ properties: sheet });
    expect(properties.status, JSON.stringify(properties.body)).toBe(200);
  }
  expect(
    (
      await route("put", `/pages/${match}/properties`).send({
        properties: [{ key: "Priority", type: "select", value: "No", options: ["High"] }],
      })
    ).status,
  ).toBe(400);
  await route("post", `/notebooks/${book}/members`).send({ userIds: [guest.user.id], role: "viewer" });
  await route("put", `/pages/${hidden}`).send({ archived: true });
  const run = (body: object) => route("post", `/pages/${dashboard}/query`, guest).send(body);
  const query = { key: "Hours", type: "number", operator: "atLeast", value: 3 };
  const result = await run(query);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  expect(result.body.data).toEqual([{ id: match, title: "Visible", value: 5 }]);
  expect((await run({ ...query, value: { $ne: null } })).status).toBe(400);
  expect((await run({ ...query, limit: 1000 })).status).toBe(400);
  expect((await route("put", `/pages/${match}/properties`, guest).send({ properties: [] })).status).toBe(403);

  const config = { key: "Hours", type: "number", operator: "atLeast", value: 3 };
  const save = await route("put", `/pages/${dashboard}/body`).send({
    base_rev: 0,
    doc: { type: "doc", content: [{ type: "pageQuery", attrs: { query: config } }] },
  });
  expect(save.status, JSON.stringify(save.body)).toBe(200);
  const read = await route("get", `/pages/${dashboard}`, guest);
  expect(read.body.data.doc.content[0].attrs.query).toMatchObject({ key: "hours", limit: 20 });
  await route("put", `/pages/${match}/properties`).send({ properties: [{ key: "Hours", type: "number", value: 1 }] });
  expect((await run(query)).body.data).toEqual([]);
}, 45_000);
