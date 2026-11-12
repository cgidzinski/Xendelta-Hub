import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { GEM_PACKS, FREE_STORAGE_BYTES, STORAGE_VOUCHER_KEY } from "@shared/monetization";
import { SHOP_ITEMS } from "../constants/shopItems";
import { ITEMS } from "../constants/items";

// The gem shop end to end: buying gems with the dummy provider, spending them, redeeming what was bought.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./gems.js"), () => import("./users.js"), () => import("./admin/users.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const savedEnv = { provider: process.env.PAYMENTS_PROVIDER, node: process.env.NODE_ENV };
afterEach(() => {
  for (const [key, value] of [
    ["PAYMENTS_PROVIDER", savedEnv.provider],
    ["NODE_ENV", savedEnv.node],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const User = () => mongoose.model("User") as any;
const reload = async (id: unknown) => (await User().findById(id)) as any;
const checkout = (token: string, body: object = { packId: GEM_PACKS[0].id }) =>
  request(t.app).post("/api/gems/checkout").set(auth(token)).send(body);

describe("catalogue", () => {
  it("only sells things for a positive whole number of gems that exist", () => {
    for (const s of SHOP_ITEMS) {
      expect(Number.isInteger(s.price) && s.price > 0, `${s.itemKey} price`).toBe(true);
      expect(ITEMS[s.itemKey], `${s.itemKey} exists`).toBeDefined();
      expect(ITEMS[s.itemKey].legacy, `${s.itemKey} is not retired`).toBeFalsy();
    }
    expect(new Set(SHOP_ITEMS.map((s) => s.id)).size).toBe(SHOP_ITEMS.length);
  });

  it("lists the storage voucher under Storage, which the Shop shows as its own section", () => {
    const voucher = SHOP_ITEMS.find((s) => s.itemKey === STORAGE_VOUCHER_KEY);
    expect(voucher?.category).toBe("Storage");
    expect(ITEMS[STORAGE_VOUCHER_KEY].key).toBe(STORAGE_VOUCHER_KEY);
  });

  it("has sane gem packs", () => {
    expect(GEM_PACKS.length).toBeGreaterThan(0);
    for (const p of GEM_PACKS) {
      expect(p.gems).toBeGreaterThan(0);
      expect(Number.isInteger(p.priceCents) && p.priceCents > 0).toBe(true);
    }
    expect(new Set(GEM_PACKS.map((p) => p.id)).size).toBe(GEM_PACKS.length);
  });
});

describe("new accounts", () => {
  it("start with no gems and the free 1 GB of XenDrive", async () => {
    const { token } = await createUser();
    const res = await request(t.app).get("/api/user/profile").set(auth(token));
    expect(res.body.data.user.gems).toBe(0);
    expect(res.body.data.user.xendrive.spaceAllowed).toBe(FREE_STORAGE_BYTES);
  });

  it("add granted space on top of the free tier", async () => {
    const { token } = await createUser({ xendrive: { spaceAllowed: 5_000 } });
    const res = await request(t.app).get("/api/user/profile").set(auth(token));
    expect(res.body.data.user.xendrive.spaceAllowed).toBe(FREE_STORAGE_BYTES + 5_000);
  });
});

describe("buying gems", () => {
  it("credits the pack and records the purchase (dummy provider)", async () => {
    delete process.env.PAYMENTS_PROVIDER;
    const { user, token } = await createUser();
    const pack = GEM_PACKS[1];

    const packs = await request(t.app).get("/api/gems/packs").set(auth(token));
    expect(packs.body.data).toMatchObject({ available: true, testMode: true });

    const res = await checkout(token, { packId: pack.id });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ result: "completed", gems: pack.gems });
    expect((await reload(user._id)).gems).toBe(pack.gems);

    const purchase: any = await mongoose.model("GemPurchase").findOne({ user: user._id });
    expect(purchase).toMatchObject({ status: "completed", gems: pack.gems, amountCents: pack.priceCents });
  });

  it("credits a purchase only once, however often it is fulfilled", async () => {
    const { fulfilGemPurchase } = await import("../payments/fulfil.js");
    const { user } = await createUser();
    const purchase: any = await mongoose.model("GemPurchase").create({
      user: user._id,
      packId: "gems-1000",
      gems: 1000,
      amountCents: 500,
      currency: "USD",
      provider: "dummy",
    });
    const results = await Promise.all([1, 2, 3].map(() => fulfilGemPurchase(purchase._id.toString())));
    expect(results.filter((n) => n > 0)).toEqual([1000]);
    expect((await reload(user._id)).gems).toBe(1000);
  });

  it("is switched off when no provider is configured", async () => {
    process.env.PAYMENTS_PROVIDER = "none";
    const { user, token } = await createUser();
    expect((await request(t.app).get("/api/gems/packs").set(auth(token))).body.data.available).toBe(false);
    expect((await checkout(token)).status).toBe(503);
    expect((await reload(user._id)).gems).toBe(0);
  });

  it("defaults to off in production, and the test provider there is for admins only", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.PAYMENTS_PROVIDER;
    const player = await createUser();
    expect((await checkout(player.token)).status).toBe(503);

    process.env.PAYMENTS_PROVIDER = "dummy";
    expect((await checkout(player.token)).status).toBe(503);
    const admin = await createUser({ roles: ["admin"] });
    expect((await checkout(admin.token)).status).toBe(200);
    expect((await reload(player.user._id)).gems).toBe(0);
  });

  it("rejects an unknown or malformed pack", async () => {
    const { token } = await createUser();
    for (const packId of ["gems-999999", { $gt: "" }, undefined]) {
      expect((await checkout(token, { packId })).status).toBe(400);
    }
  });
});

describe("redeeming", () => {
  const give = async (userId: unknown, itemKey: string) => {
    const item = ITEMS[itemKey];
    const doc = await User().findByIdAndUpdate(
      userId,
      {
        $push: {
          inventory: { itemKey, name: item.name, description: item.description, redeemable: true, used: false },
        },
      },
      { new: true },
    );
    return doc.inventory[doc.inventory.length - 1]._id.toString() as string;
  };
  const use = (token: string, itemId: string) =>
    request(t.app).post(`/api/user/inventory/${itemId}/use`).set(auth(token));

  it("a held gem voucher pays out 1000 gems, once, even when redeemed several times at once", async () => {
    const { user, token } = await createUser();
    const itemId = await give(user._id, "1000-gem-voucher");

    const results = await Promise.all([1, 2, 3, 4].map(() => use(token, itemId)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(3);

    const fresh = await reload(user._id);
    expect(fresh.gems).toBe(1000);
    expect(fresh.inventory[0].used).toBe(true);
  });

  it("the XenDrive voucher adds a gigabyte", async () => {
    const { user, token } = await createUser();
    const itemId = await give(user._id, "1gb-xendrive-voucher");
    expect((await use(token, itemId)).status).toBe(200);
    expect((await reload(user._id)).xendrive.spaceAllowed).toBe(1024 * 1024 * 1024);
  });

  it("answers 404 for an item that is not in the inventory", async () => {
    const { token } = await createUser();
    expect((await use(token, new mongoose.Types.ObjectId().toString())).status).toBe(404);
  });
});

describe("buying from the shop", () => {
  it("takes the gems and puts the item in the inventory", async () => {
    const { user, token } = await createUser({ gems: 1500 });
    const res = await request(t.app).post("/api/gems/shop/buy").set(auth(token)).send({ itemId: "2" });
    expect(res.body).toMatchObject({ status: true });
    const fresh = await reload(user._id);
    expect(fresh.gems).toBe(500);
    expect(fresh.inventory.map((i: any) => i.itemKey)).toEqual(["1gb-xendrive-voucher"]);
  });

  it("no longer sells the point voucher that used to pay the buyer", async () => {
    const { user, token } = await createUser({ gems: 0 });
    const res = await request(t.app).post("/api/gems/shop/buy").set(auth(token)).send({ itemId: "1" });
    expect(res.status).toBe(404);
    expect((await reload(user._id)).gems).toBe(0);
  });
});

describe("admin gifts", () => {
  it("only add the item; the effect happens when the person redeems it", async () => {
    const admin = await createUser({ roles: ["admin"] });
    const { user, token } = await createUser();
    const res = await request(t.app)
      .post(`/api/admin/users/${user._id}/give-item`)
      .set(auth(admin.token))
      .send({ itemKey: "1gb-xendrive-voucher" });
    expect(res.status).toBe(200);

    const gifted = await reload(user._id);
    expect(gifted.xendrive.spaceAllowed).toBe(0);
    expect(gifted.inventory).toHaveLength(1);

    await request(t.app).post(`/api/user/inventory/${gifted.inventory[0]._id}/use`).set(auth(token));
    expect((await reload(user._id)).xendrive.spaceAllowed).toBe(1024 * 1024 * 1024);
  });

  it("cannot hand out a retired item", async () => {
    const admin = await createUser({ roles: ["admin"] });
    const { user } = await createUser();
    const res = await request(t.app)
      .post(`/api/admin/users/${user._id}/give-item`)
      .set(auth(admin.token))
      .send({ itemKey: "1000-gem-voucher" });
    expect(res.status).toBe(404);
  });
});
