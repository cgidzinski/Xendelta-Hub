import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { XenKitchenBook, XenKitchenItem } from "../models/xenKitchen";

// A signed-in person opening a XenKitchen or XenDrive public link is told whether it is already theirs.
vi.mock("../utils/storageUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  generateSignedUrl: vi.fn(async (path: string) => `https://example.test/signed/${path}`),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([
    () => import("./xenkitchen.js"),
    () => import("./xendrive.js"),
    () => import("./recipaint.js"),
  ]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;
const get = (who: U, url: string) =>
  request(t.app)
    .get(url)
    .set({ Authorization: `Bearer ${who.token}` });
const token = (n: string) => n.repeat(22).slice(0, 22);

describe("XenKitchen links", () => {
  it("tells book members their role and strangers that they only hold the link", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const stranger = await createUser();
    const book = await XenKitchenBook.create({
      name: "Family",
      members: [
        { user_id: String(owner.user._id), role: "owner" },
        { user_id: String(viewer.user._id), role: "viewer" },
      ],
      share: { enabled: true, token: token("b") },
    });
    const item = await XenKitchenItem.create({
      book_id: book._id,
      title: "Soup",
      created_by: String(owner.user._id),
      share: { enabled: true, token: token("i") },
    } as any);

    const asViewer = await get(viewer, `/api/xenkitchen/shared/${token("i")}`);
    expect(asViewer.body.data).toMatchObject({
      access: "member",
      role: "viewer",
      item_id: String(item._id),
      book_id: String(book._id),
    });
    expect((await get(stranger, `/api/xenkitchen/shared/${token("i")}`)).body.data).toMatchObject({
      access: "link",
      role: null,
    });
    expect((await get(owner, `/api/xenkitchen/shared/book/${token("b")}`)).body.data).toMatchObject({
      access: "member",
      role: "owner",
      book_id: String(book._id),
    });
    expect((await get(stranger, `/api/xenkitchen/shared/book/${token("b")}`)).body.data.access).toBe("link");
    expect((await get(stranger, `/api/xenkitchen/shared/${token("z")}`)).status).toBe(404);
  });
});

describe("XenDrive links", () => {
  it("only the owner is sent into the app", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const { createDriveFile } = await import("../testing/files.js");
    const file = await createDriveFile({
      owner_id: owner.user._id,
      folder_id: null,
      name: "a.txt",
      storage_path: `xendrive/${owner.user._id}/a`,
      mimeType: "text/plain",
      size: 1,
      shareEnabled: true,
      shareToken: token("f"),
    });
    const mine = await get(owner, `/api/xendrive/shared-link/file/${token("f")}`);
    expect(mine.body.data).toEqual({ mine: true, file_id: String(file._id) });
    expect((await get(stranger, `/api/xendrive/shared-link/file/${token("f")}`)).body.data).toEqual({
      mine: false,
      file_id: null,
    });
    expect((await get(stranger, `/api/xendrive/shared-link/file/${token("q")}`)).status).toBe(404);
  });
});

describe("Recipaint links", () => {
  it("only the owner of a public recipe is sent into the app", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const { Recipe } = await import("../models/recipe.js");
    const recipe = await Recipe.create({
      title: "Ember",
      owner: owner.user._id,
      author: owner.user._id,
      isPublic: true,
    } as any);
    expect((await get(owner, `/api/recipaint/shared-link/${recipe._id}`)).body.data).toEqual({ mine: true });
    expect((await get(stranger, `/api/recipaint/shared-link/${recipe._id}`)).body.data).toEqual({ mine: false });
  });
});
