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

it("scope-checks live blocks, backlinks, public embeds and Markdown export", async () => {
  const owner = await createUser();
  const guest = await createUser();
  const route = (method: "post" | "get" | "put", path: string, who?: typeof owner) => {
    const call = request(app.app)[method](`/api/xennote${path}`);
    return who ? call.auth(who.token, { type: "bearer" }) : call;
  };
  const post = (path: string, value?: object) => route("post", path, owner).send(value);
  const book = (await post("/notebooks", { name: "Blocks" })).body.data.notebook._id;
  const section = (await post(`/notebooks/${book}/sections`, { name: "Notes" })).body.data.section.id;
  const target = (await post(`/sections/${section}/pages`, { title: "Target" })).body.data.page.id;
  const source = (await post(`/sections/${section}/pages`, { title: "Source" })).body.data.page.id;
  const save = (page: string, content: unknown[], base_rev = 0) =>
    route("put", `/pages/${page}/body`, owner).send({ base_rev, doc: { type: "doc", content } });
  expect(
    (
      await save(target, [
        { type: "paragraph", attrs: { id: "original" }, content: [{ type: "text", text: "Block contents" }] },
      ])
    ).status,
  ).toBe(200);
  const embedded = await save(source, [{ type: "blockEmbed", attrs: { page_id: target, block_id: "original" } }]);
  expect(embedded.status, JSON.stringify(embedded.body)).toBe(200);

  const blockPath = `/pages/${target}/blocks/original`;
  expect((await route("get", blockPath, guest)).body.data).toEqual({ status: "locked" });
  expect((await route("get", `${blockPath}/backlinks`, owner)).body.data).toEqual([{ id: source, title: "Source" }]);
  expect((await route("get", `/pages/${source}/export`, owner)).text).toContain("> Block contents");
  expect((await route("get", `/pages/${source}/export`, guest)).status).toBe(404);
  const bookToken = (await post(`/notebooks/${book}/share`)).body.data.notebook.share.token;
  expect((await route("get", `/public/notebook/${bookToken}/blocks/${target}/original`)).body.data).toMatchObject({
    status: "available",
    excerpt: "Block contents",
  });

  expect((await save(target, [{ type: "paragraph" }], 1)).status).toBe(200);
  expect((await route("get", blockPath, owner)).body.data).toEqual({ status: "removed" });
  expect((await route("get", `/pages/${source}/export`, owner)).text).toContain("> Block removed");
}, 45_000);
