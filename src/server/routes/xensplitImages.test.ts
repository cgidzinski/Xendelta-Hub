import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// Google Cloud Storage is the only thing stubbed: the rest (routes, models, Mongo) is real. The
// stub takes a moment, like a real upload does, which is what widens the race window below.
vi.mock("../utils/gcsUtils.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  uploadToGCS: vi.fn(async () => {
    await new Promise((r) => setTimeout(r, 150));
    return "stub-url";
  }),
  generateSignedUrl: vi.fn(async () => "https://example.test/signed"),
  deleteFromGCS: vi.fn(async () => undefined),
}));

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./xensplit.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
// A valid 1x1 PNG, so the image file filter accepts it.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function setup() {
  const owner = await createUser();
  const created = await request(t.app)
    .post("/api/xensplit/groups")
    .set(auth(owner.token))
    .send({ name: "Trip", default_currency: "CAD" });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  const groupId = created.body.data.group?._id ?? created.body.data._id;
  return { owner, groupId };
}

const addExpense = (token: string, groupId: string, userId: string, title: string) =>
  request(t.app)
    .post(`/api/xensplit/groups/${groupId}/expenses`)
    .set(auth(token))
    .send({
      paid_by: userId,
      amount: 20,
      currency: "CAD",
      title,
      date: new Date().toISOString(),
      split_type: "equal",
      splits: [{ user_id: userId }],
    });

const upload = (token: string, groupId: string, expenseId: string) =>
  request(t.app)
    .post(`/api/xensplit/groups/${groupId}/expenses/${expenseId}/images`)
    .set(auth(token))
    .attach("images", PNG, { filename: "receipt.png", contentType: "image/png" });

describe("XenSplit expense images", () => {
  it("uploads an image to an expense right after it was created", async () => {
    const { owner, groupId } = await setup();
    const add = await addExpense(owner.token, groupId, owner.user._id.toString(), "Dinner");
    expect(add.status, JSON.stringify(add.body)).toBe(200);
    const expenseId = add.body.data.newExpenseId;
    expect(expenseId).toBeTruthy();

    const res = await upload(owner.token, groupId, expenseId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("still succeeds when another write to the same group lands while the upload is in flight", async () => {
    const { owner, groupId } = await setup();
    const uid = owner.user._id.toString();
    const first = await addExpense(owner.token, groupId, uid, "Dinner");
    const expenseId = first.body.data.newExpenseId;

    // The upload spends ~150ms in (stubbed) storage between loading the group and saving it.
    const uploading = upload(owner.token, groupId, expenseId);
    await new Promise((r) => setTimeout(r, 50));
    const other = await addExpense(owner.token, groupId, uid, "Taxi"); // changes the group meanwhile
    expect(other.status).toBe(200);

    const res = await uploading;
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    // and both the new expense and the image are there afterwards
    const group = await request(t.app).get(`/api/xensplit/groups/${groupId}`).set(auth(owner.token));
    const titles = group.body.data.expenses.map((e: any) => e.title).sort();
    expect(titles).toEqual(["Dinner", "Taxi"]);
    const dinner = group.body.data.expenses.find((e: any) => e.title === "Dinner");
    expect(dinner.images?.length ?? dinner.image_count).toBeGreaterThan(0);
  });
});

describe("XenSplit expense images: several at once", () => {
  const uploadMany = (token: string, groupId: string, expenseId: string, n: number) => {
    let req = request(t.app).post(`/api/xensplit/groups/${groupId}/expenses/${expenseId}/images`).set(auth(token));
    for (let i = 0; i < n; i++) req = req.attach("images", PNG, { filename: `r${i}.png`, contentType: "image/png" });
    return req;
  };

  it("stores every photo of a multi-photo upload", async () => {
    const { owner, groupId } = await setup();
    const add = await addExpense(owner.token, groupId, owner.user._id.toString(), "Hotel");
    const res = await uploadMany(owner.token, groupId, add.body.data.newExpenseId, 4);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const group = await request(t.app).get(`/api/xensplit/groups/${groupId}`).set(auth(owner.token));
    const hotel = group.body.data.expenses.find((e: any) => e.title === "Hotel");
    expect(hotel.images).toHaveLength(4);
  });

  it("saves nothing and cleans up when one photo fails to store", async () => {
    const gcs = await import("../utils/gcsUtils.js");
    const { owner, groupId } = await setup();
    const add = await addExpense(owner.token, groupId, owner.user._id.toString(), "Museum");
    vi.mocked(gcs.deleteFromGCS).mockClear();
    // second photo's storage call fails
    let calls = 0;
    vi.mocked(gcs.uploadToGCS).mockImplementation(async () => {
      calls += 1;
      if (calls === 2) throw new Error("storage unavailable");
      return "ok";
    });

    const res = await uploadMany(owner.token, groupId, add.body.data.newExpenseId, 3);
    expect(res.status).toBe(500);
    // the two that did upload were removed again
    expect(vi.mocked(gcs.deleteFromGCS)).toHaveBeenCalledTimes(2);
    const group = await request(t.app).get(`/api/xensplit/groups/${groupId}`).set(auth(owner.token));
    const museum = group.body.data.expenses.find((e: any) => e.title === "Museum");
    expect(museum.images ?? []).toHaveLength(0);
  });
});
