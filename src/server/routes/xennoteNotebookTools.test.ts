import { crc32 } from "node:zlib";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createUser, startTestApp, type TestApp } from "../testing/testApp";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp([() => import("./xennote/index.js")]);
  // The journal route settles concurrent requests by catching duplicate-key errors from the
  // one-page-per-day and one-journal-section indexes, so those must exist before the race.
  await Promise.all([mongoose.model("XenNotePage").init(), mongoose.model("XenNoteSection").init()]);
}, 120_000);
afterAll(async () => {
  await app?.stop();
}, 45_000);

type User = Awaited<ReturnType<typeof createUser>>;
const api = (method: "get" | "post" | "put", path: string, user: User) =>
  request(app.app)[method](`/api/xennote${path}`).auth(user.token, { type: "bearer" });
const text = (value: string) => ({ type: "paragraph", content: [{ type: "text", text: value }] });

function readZip(binary: Buffer) {
  const entries = new Map<string, Buffer>();
  const end = binary.length - 22;
  expect(binary.readUInt32LE(end)).toBe(0x06054b50);
  const count = binary.readUInt16LE(end + 10);
  let cursor = binary.readUInt32LE(end + 16);
  for (let i = 0; i < count; i += 1) {
    expect(binary.readUInt32LE(cursor)).toBe(0x02014b50);
    const checksum = binary.readUInt32LE(cursor + 16);
    const length = binary.readUInt32LE(cursor + 24);
    const nameLength = binary.readUInt16LE(cursor + 28);
    const header = binary.readUInt32LE(cursor + 42);
    const start = header + 30 + binary.readUInt16LE(header + 26);
    const payload = binary.subarray(start, start + length);
    expect(crc32(payload)).toBe(checksum);
    entries.set(binary.subarray(cursor + 46, cursor + 46 + nameLength).toString(), payload);
    cursor += 46 + nameLength;
  }
  return entries;
}

it("makes one journal page per day, copies template files and exports a readable archive", async () => {
  const [owner, viewer, stranger] = await Promise.all([createUser(), createUser(), createUser()]);
  const post = (path: string, body?: object) => api("post", path, owner).send(body);
  const book = (await post("/notebooks", { name: "Work" })).body.data.notebook._id;
  const section = (await post(`/notebooks/${book}/sections`, { name: "Work pages" })).body.data.section.id;
  const templates = await post(`/notebooks/${book}/templates`);
  expect(templates.status, JSON.stringify(templates.body)).toBe(200);
  const made = await post(`/sections/${templates.body.data.section.id}/pages`, { title: "Day starter" });
  const template = made.body.data.page.id;
  const uploaded = await api("post", `/pages/${template}/files`, owner).attach("files", Buffer.from("sample bytes"), {
    filename: "plan.txt",
    contentType: "text/plain",
  });
  expect(uploaded.status).toBe(200);
  const file = uploaded.body.data.files[0].id;
  const saved = await api("put", `/pages/${template}/body`, owner).send({
    base_rev: 0,
    doc: {
      type: "doc",
      content: [text("Plan {{date}}"), { type: "fileBlock", attrs: { file_id: file, name: "plan.txt" } }],
    },
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  expect((await api("put", `/notebooks/${book}/journal-template`, owner).send({ page_id: template })).status).toBe(200);
  await post(`/notebooks/${book}/members`, { userIds: [viewer.user.id], role: "viewer" });
  const date = "2026-11-20";
  expect((await api("post", `/notebooks/${book}/journal`, viewer).send({ date })).status).toBe(403);
  const [one, two] = await Promise.all([
    post(`/notebooks/${book}/journal`, { date }),
    post(`/notebooks/${book}/journal`, { date }),
  ]);
  expect(one.status, JSON.stringify(one.body)).toBe(200);
  expect(two.status, JSON.stringify(two.body)).toBe(200);
  expect(one.body.data.id).toBe(two.body.data.id);
  const journal = one.body.data.id;
  const journalPage = (await api("get", `/pages/${journal}`, viewer)).body.data;
  expect(journalPage.page.journal_date).toBe(date);
  expect(journalPage.doc.content[0].content).toEqual([{ type: "text", text: `Plan ${date}` }]);
  expect(Object.keys(journalPage.files)).toHaveLength(1);
  expect(Object.keys(journalPage.files)).not.toContain(file);
  expect((await post(`/sections/${section}/from-template`, { template_id: template })).status).toBe(200);
  expect((await api("get", `/notebooks/${book}/export`, stranger)).status).toBe(404);
  const markdown = await api("get", `/pages/${journal}/export`, viewer);
  expect(markdown.text).toContain(`Plan ${date}`);
  const zip = await api("get", `/notebooks/${book}/export`, viewer)
    .buffer(true)
    .parse((stream, done) => {
      const buffers: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => buffers.push(chunk));
      stream.on("end", () => done(null, Buffer.concat(buffers)));
      stream.on("error", done);
    });
  expect(zip.status).toBe(200);
  const entries = readZip(zip.body);
  expect([...entries.keys()].some((name) => name.startsWith("Journal/") && name.endsWith(".md"))).toBe(true);
  expect([...entries.values()].some((bytes) => bytes.toString() === "sample bytes")).toBe(true);
}, 45_000);

it("lets a member inspect history and restores a version through the normal save pipeline", async () => {
  const [owner, viewer] = await Promise.all([createUser(), createUser()]);
  const book = (await api("post", "/notebooks", owner).send({ name: "History" })).body.data.notebook._id;
  const section = (await api("post", `/notebooks/${book}/sections`, owner).send({ name: "Notes" })).body.data.section
    .id;
  const id = (await api("post", `/sections/${section}/pages`, owner).send({ title: "Plan" })).body.data.page.id;
  const save = (base_rev: number, value: string) =>
    api("put", `/pages/${id}/body`, owner).send({ base_rev, doc: { type: "doc", content: [text(value)] } });
  expect((await save(0, "Version one")).status).toBe(200);
  expect((await save(0, "Version two")).status).toBe(200);
  await api("post", `/notebooks/${book}/members`, owner).send({ userIds: [viewer.user.id], role: "viewer" });
  const history = (await api("get", `/pages/${id}/history`, viewer)).body.data;
  const base = `/pages/${id}/history/${history[0].id}`;
  expect((await api("get", base, viewer)).body.data.doc.content[0].content[0].text).toBe("Version one");
  expect((await api("post", `${base}/restore`, viewer)).status).toBe(403);
  expect((await api("post", `${base}/restore`, owner)).status).toBe(200);
  expect((await api("get", `/pages/${id}`, viewer)).body.data.doc.content[0].content[0].text).toBe("Version one");
}, 45_000);
