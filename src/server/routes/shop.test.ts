import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { GEM_PACKS } from "@shared/monetization";
import { SHOP_ITEMS } from "../constants/shopItems";
import { ITEMS } from "../constants/items";

// The gem shop end to end: buying gems with the dummy provider, spending them, redeeming what was bought.

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./shop.js"), () => import("./users.js"), () => import("./admin/index.js")]);
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
const buyItem = (token: string, body: object = { itemId: GEM_PACKS[0].id }) =>
  request(t.app).post("/api/shop/buy").set(auth(token)).send(body);

describe("catalogue", () => {
  it("sells every item for exactly one positive whole-number price, and the items exist", () => {
    for (const s of SHOP_ITEMS) {
      const prices = [s.price, s.priceCents].filter((p) => p !== undefined);
      expect(prices, `${s.id} has one price`).toHaveLength(1);
      expect(Number.isInteger(prices[0]) && prices[0]! > 0, `${s.id} price`).toBe(true);
      if (s.priceCents !== undefined) {
        expect(s.currency, `${s.id} currency`).toBeTruthy();
        expect(s.grantsGems! > 0, `${s.id} grants gems`).toBe(true);
      }
      expect(ITEMS[s.itemKey], `${s.itemKey} exists`).toBeDefined();
      expect(ITEMS[s.itemKey].legacy, `${s.itemKey} is not retired`).toBeFalsy();
    }
    expect(new Set(SHOP_ITEMS.map((s) => s.id)).size).toBe(SHOP_ITEMS.length);
  });

  it("lists every gem pack in the shop under Gems", () => {
    for (const pack of GEM_PACKS) {
      const item = SHOP_ITEMS.find((s) => s.id === pack.id);
      expect(item).toMatchObject({ category: "Gems", priceCents: pack.priceCents, grantsGems: pack.gems });
    }
  });

  it("no longer sells storage: files are billed in gems by month", () => {
    expect(SHOP_ITEMS.some((s) => s.category === "Storage")).toBe(false);
    expect(ITEMS["1gb-xendrive-voucher"]).toBeUndefined();
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
  it("start with no gems and nothing stored", async () => {
    const { token } = await createUser();
    const res = await request(t.app).get("/api/user/profile").set(auth(token));
    expect(res.body.data.user.gems).toBe(0);
    expect(res.body.data.user.xendrive).toEqual({ fileCount: 0, spaceUsed: 0 });
  });
});

describe("buying gems", () => {
  it("grants nothing while buying gems is switched off, whatever the environment says", async () => {
    const { user, token } = await createUser();
    const admin = await createUser({ roles: ["admin"] });
    for (const provider of [undefined, "dummy", "none"]) {
      for (const node of ["test", "production"]) {
        process.env.NODE_ENV = node;
        if (provider === undefined) delete process.env.PAYMENTS_PROVIDER;
        else process.env.PAYMENTS_PROVIDER = provider;

        const shop = await request(t.app).get("/api/shop").set(auth(token));
        expect(shop.body.data.payments.available).toBe(false);
        expect((await buyItem(token, { itemId: GEM_PACKS[1].id })).status).toBe(503);
        expect((await buyItem(admin.token, { itemId: GEM_PACKS[1].id })).status).toBe(503);
      }
    }
    expect((await reload(user._id)).gems).toBe(0);
    expect((await reload(admin.user._id)).gems).toBe(0);
    expect(await mongoose.model("GemPurchase").countDocuments({ user: { $in: [user._id, admin.user._id] } })).toBe(0);
  });

  it("credits a purchase only once, however often it is fulfilled", async () => {
    const { fulfilGemPurchase } = await import("../payments/fulfil.js");
    const { user } = await createUser();
    const purchase: any = await mongoose.model("GemPurchase").create({
      user: user._id,
      itemId: "gems-1000",
      gems: 1000,
      amountCents: 500,
      currency: "USD",
      provider: "dummy",
    });
    const results = await Promise.all([1, 2, 3].map(() => fulfilGemPurchase(purchase._id.toString())));
    expect(results.filter((n) => n > 0)).toEqual([1000]);
    expect((await reload(user._id)).gems).toBe(1000);
  });

  it("rejects an unknown item and a malformed id", async () => {
    const { token } = await createUser();
    expect((await buyItem(token, { itemId: "gems-999999" })).status).toBe(404);
    for (const itemId of [{ $gt: "" }, undefined]) {
      expect((await buyItem(token, { itemId })).status).toBe(400);
    }
  });

  it("does not put a gem pack in the inventory", async () => {
    const { user, token } = await createUser();
    await buyItem(token);
    expect((await reload(user._id)).inventory).toHaveLength(0);
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

  it("a held gem voucher pays out 5,000 gems, once, even when redeemed several times at once", async () => {
    const { user, token } = await createUser();
    const itemId = await give(user._id, "1000-gem-voucher");

    const results = await Promise.all([1, 2, 3, 4].map(() => use(token, itemId)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(3);

    const fresh = await reload(user._id);
    expect(fresh.gems).toBe(5000);
    expect(fresh.inventory[0].used).toBe(true);
  });

  it("answers 404 for an item that is not in the inventory", async () => {
    const { token } = await createUser();
    expect((await use(token, new mongoose.Types.ObjectId().toString())).status).toBe(404);
  });
});

describe("buying from the shop", () => {
  it("takes the gems and puts the item in the inventory", async () => {
    const { user, token } = await createUser({ gems: 30000 });
    const res = await request(t.app).post("/api/shop/buy").set(auth(token)).send({ itemId: "3" });
    expect(res.body).toMatchObject({ status: true });
    const fresh = await reload(user._id);
    expect(fresh.gems).toBe(5000);
    expect(fresh.inventory.map((i: any) => i.itemKey)).toEqual(["golden-badge"]);
  });

  it("records every gem movement in the ledger, so the balance matches its history", async () => {
    const { transfer, HOUSE, userAccount } = await import("../billing/ledger.js");
    const { ledgerMismatches } = await import("../utils/dbStats.js");
    const { user, token } = await createUser();
    await transfer({
      from: HOUSE,
      to: userAccount(user._id),
      amount: 30000,
      kind: "admin_adjustment",
      idempotencyKey: `t:${user._id}`,
    });
    await request(t.app).post("/api/shop/buy").set(auth(token)).send({ itemId: "3" });
    const tx = await mongoose.model("GemTransaction").find({ "from.id": user._id, kind: "shop_purchase" }).lean();
    expect(tx).toHaveLength(1);
    expect((await reload(user._id)).gems).toBe(5000);
    const { mismatches } = await ledgerMismatches(10_000);
    expect(mismatches.find((m) => m.id === String(user._id))).toBeUndefined();
  });

  it("refuses a purchase the balance can't cover, without granting the item", async () => {
    const { user, token } = await createUser({ gems: 10 });
    const res = await request(t.app).post("/api/shop/buy").set(auth(token)).send({ itemId: "3" });
    expect(res.body).toMatchObject({ status: false, message: "Not enough gems" });
    const fresh = await reload(user._id);
    expect(fresh.gems).toBe(10);
    expect(fresh.inventory).toHaveLength(0);
  });

  it("no longer sells the point voucher that used to pay the buyer", async () => {
    const { user, token } = await createUser({ gems: 0 });
    const res = await request(t.app).post("/api/shop/buy").set(auth(token)).send({ itemId: "1" });
    expect(res.status).toBe(404);
    expect((await reload(user._id)).gems).toBe(0);
  });
});

describe("admin gifts", () => {
  it("add the item to the inventory", async () => {
    const admin = await createUser({ roles: ["admin"] });
    const { user } = await createUser();
    const res = await request(t.app)
      .post(`/api/admin/users/${user._id}/give-item`)
      .set(auth(admin.token))
      .send({ itemKey: "golden-badge" });
    expect(res.status).toBe(200);
    expect((await reload(user._id)).inventory.map((i: any) => i.itemKey)).toEqual(["golden-badge"]);
  });

  it("cannot hand out the retired storage voucher", async () => {
    const admin = await createUser({ roles: ["admin"] });
    const { user } = await createUser();
    const res = await request(t.app)
      .post(`/api/admin/users/${user._id}/give-item`)
      .set(auth(admin.token))
      .send({ itemKey: "1gb-xendrive-voucher" });
    expect(res.status).toBe(404);
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
