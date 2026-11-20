import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// A signed-in person opening a public link is told whether the note is already theirs.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xennote/index.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const api = (who: U) => {
  const h = (r: request.Test) => r.set({ Authorization: `Bearer ${who.token}` });
  return {
    get: (url: string) => h(request(t.app).get(`/api/xennote${url}`)),
    post: (url: string, body?: object) => h(request(t.app).post(`/api/xennote${url}`)).send(body),
  };
};

const sharedNote = async (owner: U) => {
  const n = await api(owner).post("/notes", { type: "text", title: "Plan", body: "x" });
  const s = await api(owner).post(`/notes/${n.body.data.note._id}/share`);
  return { id: n.body.data.note._id as string, token: s.body.data.note.share.token as string };
};

describe("opening a public link while signed in", () => {
  it("tells someone the note is shared with their role, and anyone else that they only hold the link", async () => {
    const owner = await createUser();
    const editor = await createUser();
    const stranger = await createUser();
    const { id, token } = await sharedNote(owner);
    const added = await api(owner).post(`/notes/${id}/members`, { userIds: [editor.user.id], role: "editor" });
    expect(added.status, JSON.stringify(added.body)).toBe(200);

    const asEditor = await api(editor).get(`/shared/note/${token}`);
    expect(asEditor.body.data).toMatchObject({ access: "member", role: "editor", note_id: id, notebook_id: null });
    const asOwner = await api(owner).get(`/shared/note/${token}`);
    expect(asOwner.body.data).toMatchObject({ access: "member", role: "owner" });
    const asStranger = await api(stranger).get(`/shared/note/${token}`);
    expect(asStranger.body.data).toMatchObject({ access: "link", role: null });
  });

  it("sends the owner of a loose note to it, and a stranger to the read-only view", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const { id, token } = await sharedNote(owner);
    expect((await api(owner).get(`/shared/note/${token}`)).body.data).toMatchObject({
      access: "member",
      role: "owner",
      note_id: id,
    });
    expect((await api(stranger).get(`/shared/note/${token}`)).body.data.access).toBe("link");
  });

  it("answers a notebook link the same way, and 404s on a link that is off", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const stranger = await createUser();
    const book = (await api(owner).post("/notebooks", { name: "Shared" })).body.data.notebook;
    await api(owner).post(`/notebooks/${book._id}/members`, { userIds: [viewer.user.id], role: "viewer" });
    const share = await api(owner).post(`/notebooks/${book._id}/share`);
    expect(share.status, JSON.stringify(share.body)).toBe(200);
    const token = share.body.data.notebook.share.token;

    expect((await api(viewer).get(`/shared/notebook/${token}`)).body.data).toMatchObject({
      access: "member",
      role: "viewer",
      notebook_id: book._id,
    });
    expect((await api(stranger).get(`/shared/notebook/${token}`)).body.data.access).toBe("link");
    expect((await api(stranger).get(`/shared/note/${token}`)).status).toBe(404);
    expect((await api(stranger).get(`/shared/notebook/${"a".repeat(22)}`)).status).toBe(404);
  });
});
