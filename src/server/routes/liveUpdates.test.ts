import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { SocketManager } from "../infrastructure/SocketManager";

// Someone else's change has to reach your open screen. These tests take the place of a browser: they watch what the
// routes push through the SocketManager, which is the only thing that keeps XenKitchen and XenRoutine in step.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([
    () => import("./xenkitchen.js"),
    () => import("./xenkitchenPlan.js"),
    () => import("./xenroutine.js"),
  ]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

type U = Awaited<ReturnType<typeof createUser>>;

const as = (who: U) => ({ Authorization: `Bearer ${who.token}` });
const kitchen = (who: U) => ({
  get: (url: string) => request(t.app).get(`/api/xenkitchen${url}`).set(as(who)),
  post: (url: string, body?: object) => request(t.app).post(`/api/xenkitchen${url}`).set(as(who)).send(body),
  put: (url: string, body: object) => request(t.app).put(`/api/xenkitchen${url}`).set(as(who)).send(body),
  del: (url: string) => request(t.app).delete(`/api/xenkitchen${url}`).set(as(who)),
});
const routine = (who: U) => ({
  post: (url: string, body?: object) => request(t.app).post(`/api/xenroutine${url}`).set(as(who)).send(body),
  put: (url: string, body: object) => request(t.app).put(`/api/xenroutine${url}`).set(as(who)).send(body),
  del: (url: string) => request(t.app).delete(`/api/xenroutine${url}`).set(as(who)),
});

/** Everything the server pushed, in order, as "room|event". */
let pushed: Array<{ room: string; event: string; payload: unknown }> = [];
beforeEach(() => {
  pushed = [];
  (SocketManager.getInstance() as any).io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => pushed.push({ room, event, payload }),
    }),
  };
});
const roomsSent = (event: string) => pushed.filter((p) => p.event === event).map((p) => p.room);

/** A book shared by two people. */
async function sharedBook() {
  const owner = await createUser();
  const friend = await createUser();
  const book = (await kitchen(owner).get("/books")).body.data.books[0]._id as string;
  const added = await kitchen(owner).post(`/books/${book}/members`, {
    userIds: [friend.user._id.toString()],
    role: "editor",
  });
  expect(added.status, JSON.stringify(added.body)).toBe(200);
  pushed = [];
  return { owner, friend, book };
}

describe("a recipe book shared by two people", () => {
  it("tells both of them when a recipe is saved, changed or deleted", async () => {
    const { owner, friend, book } = await sharedBook();
    const created = await kitchen(owner).post("/items", { book_id: book, title: "Soup" });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const item = created.body.data.item._id as string;

    expect(roomsSent("xenkitchen:book_update")).toEqual(
      expect.arrayContaining([`user:${owner.user._id}`, `user:${friend.user._id}`]),
    );
    expect(pushed.find((p) => p.event === "xenkitchen:book_update")?.payload).toEqual({ bookId: book });

    pushed = [];
    await kitchen(friend).put(`/items/${item}`, { title: "Soup, revised" });
    expect(roomsSent("xenkitchen:book_update")).toContain(`user:${owner.user._id}`);

    pushed = [];
    await kitchen(friend).del(`/items/${item}`);
    expect(roomsSent("xenkitchen:book_update")).toContain(`user:${owner.user._id}`);
  });

  it("tells both of them when the book itself, its categories or its plan change", async () => {
    const { owner, friend, book } = await sharedBook();
    const item = (await kitchen(owner).post("/items", { book_id: book, title: "Toast" })).body.data.item._id;

    await kitchen(owner).put(`/books/${book}`, { name: "Ann's kitchen" });
    expect(roomsSent("xenkitchen:books_updated")).toContain(`user:${friend.user._id}`);

    pushed = [];
    await kitchen(owner).post("/categories", { book_id: book, name: "Dinner" });
    expect(roomsSent("xenkitchen:book_update")).toContain(`user:${friend.user._id}`);

    pushed = [];
    await kitchen(owner).post(`/books/${book}/plan`, { date: "2026-04-01", item_id: item });
    expect(roomsSent("xenkitchen:book_update")).toContain(`user:${friend.user._id}`);
  });

  it("tells the person who was removed, so their list drops the book", async () => {
    const { owner, friend, book } = await sharedBook();
    const removed = await kitchen(owner).del(`/books/${book}/members/${friend.user._id}`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(roomsSent("xenkitchen:books_updated")).toContain(`user:${friend.user._id}`);
  });
});

describe("a routine shared by two people", () => {
  it("tells the other person when a step is ticked or the routine is edited", async () => {
    const owner = await createUser();
    const friend = await createUser();

    const created = await routine(owner).post("/routines", {
      name: "Water the plants",
      interval: { every: 1, unit: "weeks" },
      checklist: [{ text: "Kitchen" }],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.data.routine._id as string;
    const step = created.body.data.routine.checklist[0]._id as string;

    const shared = await routine(owner).post(`/routines/${id}/share`, {
      userIds: [friend.user._id.toString()],
    });
    expect(shared.status, JSON.stringify(shared.body)).toBe(200);
    pushed = [];

    // The friend ticks a step: the owner's open screen has to hear it, because the tick is shared.
    const ticked = await routine(friend).put(`/routines/${id}/checklist/${step}`, { done: true });
    expect(ticked.status, JSON.stringify(ticked.body)).toBe(200);
    expect(roomsSent("xenroutine:update")).toEqual(
      expect.arrayContaining([`user:${owner.user._id}`, `user:${friend.user._id}`]),
    );

    // The owner edits it (only the owner may): the friend's open screen has to hear that too.
    pushed = [];
    const edited = await routine(owner).put(`/routines/${id}`, { name: "Water the plants and ferns" });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(roomsSent("xenroutine:update")).toContain(`user:${friend.user._id}`);
  });
});
