import mongoose from "mongoose";
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

it("only graphs accessible pages and edges and optionally merges equal tags across notebooks", async () => {
  const [owner, guest] = await Promise.all([createUser(), createUser()]);
  const note = (method: "post" | "get", path: string, who = owner) =>
    request(app.app)[method](`/api/xennote${path}`).auth(who.token, { type: "bearer" });
  const create = async (name: string) => {
    const b = (await note("post", "/notebooks").send({ name })).body.data.notebook._id;
    const s = (await note("post", `/notebooks/${b}/sections`).send({ name: "Notes" })).body.data.section.id;
    const page = (await note("post", `/sections/${s}/pages`).send({ title: name })).body.data.page.id;
    return { b, page };
  };
  const [left, right, hidden] = await Promise.all([create("Left"), create("Right"), create("Hidden")]);
  const pages = mongoose.model("XenNotePage");
  await pages.updateOne({ _id: left.page }, { tags: ["trip"], links: [right.page, hidden.page] });
  await pages.updateOne({ _id: right.page }, { tags: ["trip"] });
  await note("post", `/notebooks/${left.b}/members`).send({ userIds: [guest.user.id], role: "viewer" });
  await note("post", `/pages/${right.page}/people`).send({ userIds: [guest.user.id], role: "viewer" });

  const visible = (await note("get", "/graph", guest)).body.data;
  expect(visible.nodes.filter((n: { kind: string }) => n.kind === "tag")).toHaveLength(2);
  expect(visible.nodes).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: hidden.page })]));
  expect(visible.nodes).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: right.page, notebook_name: null, notebook_id: null })]),
  );
  expect(visible.links.filter((edge: { kind: string }) => edge.kind === "link")).toEqual([
    { source: left.page, target: right.page, kind: "link" },
  ]);
  const merged = (await note("get", "/graph?mergeTags=true", guest)).body.data;
  expect(merged.nodes.filter((n: { kind: string }) => n.kind === "tag")).toHaveLength(1);
  expect((await note("get", `/graph?notebook=${right.b}`, guest)).status).toBe(404);
  const scoped = (await note("get", `/graph?notebook=${left.b}`, guest)).body.data;
  expect(scoped.notebook_name).toBe("Left");
  expect(scoped.links.every((edge: { kind: string }) => edge.kind === "tag")).toBe(true);
}, 45_000);
