import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";
import { ITEMS } from "../constants/items";
import { STORAGE_VOUCHER_KEY } from "@shared/monetization";
import { cosmeticsOf, PUBLIC_USER_FIELDS } from "../utils/publicUser";

// Wearing a cosmetic: equip and unequip, what happens when the item goes away, and that the choice reaches the
// public info other people get (and nothing private does).

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp([() => import("./users.js"), () => import("./admin/users.js")]);
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const User = () => mongoose.model("User") as any;
const reload = async (id: unknown) => (await User().findById(id)) as any;

/** Put an item straight into someone's inventory and return its inventory id. */
const give = async (userId: unknown, itemKey: string) => {
  const item = ITEMS[itemKey];
  const doc = await User().findByIdAndUpdate(
    userId,
    {
      $push: {
        inventory: {
          itemKey,
          name: item.name,
          description: item.description,
          redeemable: item.redeemable,
          used: false,
        },
      },
    },
    { new: true },
  );
  return doc.inventory[doc.inventory.length - 1]._id.toString() as string;
};
const equip = (token: string, id: string) => request(t.app).post(`/api/user/inventory/${id}/equip`).set(auth(token));
const unequip = (token: string, id: string) =>
  request(t.app).post(`/api/user/inventory/${id}/unequip`).set(auth(token));

describe("wearing the Golden Badge", () => {
  it("equips and unequips, and the profile says which", async () => {
    const { user, token } = await createUser();
    const id = await give(user._id, "golden-badge");

    expect((await equip(token, id)).status).toBe(200);
    expect((await reload(user._id)).cosmetics.badge).toBe("golden-badge");
    const profile = await request(t.app).get("/api/user/profile").set(auth(token));
    expect(profile.body.data.user.cosmetics).toEqual({ badge: "golden-badge" });

    expect((await unequip(token, id)).status).toBe(200);
    expect((await reload(user._id)).cosmetics?.badge).toBeUndefined();
    const after = await request(t.app).get("/api/user/profile").set(auth(token));
    expect(after.body.data.user.cosmetics).toEqual({});
  });

  it("only works on items that are worn, and only on your own", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const badge = await give(owner.user._id, "golden-badge");
    const voucher = await give(owner.user._id, STORAGE_VOUCHER_KEY);

    expect((await equip(owner.token, voucher)).status).toBe(400);
    expect((await equip(stranger.token, badge)).status).toBe(404);
    expect((await reload(stranger.user._id)).cosmetics?.badge).toBeUndefined();
  });

  it("is taken off when the last copy is trashed, but not while another copy remains", async () => {
    const { user, token } = await createUser();
    const first = await give(user._id, "golden-badge");
    const second = await give(user._id, "golden-badge");
    await equip(token, first);

    await request(t.app).delete(`/api/user/inventory/${first}`).set(auth(token));
    expect((await reload(user._id)).cosmetics.badge).toBe("golden-badge");

    await request(t.app).delete(`/api/user/inventory/${second}`).set(auth(token));
    expect((await reload(user._id)).cosmetics?.badge).toBeUndefined();
  });

  it("is taken off when an admin removes it", async () => {
    const admin = await createUser({ roles: ["admin"] });
    const { user, token } = await createUser();
    const id = await give(user._id, "golden-badge");
    await equip(token, id);

    const res = await request(t.app)
      .delete(`/api/admin/users/${user._id}/inventory/golden-badge`)
      .set(auth(admin.token));
    expect(res.status).toBe(200);
    expect((await reload(user._id)).cosmetics?.badge).toBeUndefined();
  });
});

describe("what other people see", () => {
  it("the user directory carries the worn badge but nothing private", async () => {
    const wearer = await createUser();
    const viewer = await createUser();
    await equip(wearer.token, await give(wearer.user._id, "golden-badge"));

    const res = await request(t.app).get("/api/users").set(auth(viewer.token));
    const entry = res.body.data.users.find((u: any) => u._id === wearer.user._id.toString());
    expect(entry.cosmetics).toEqual({ badge: "golden-badge" });
    for (const key of ["email", "roles", "gems", "inventory", "password"]) expect(entry).not.toHaveProperty(key);
  });

  it("is part of the fields every populated member is loaded with", () => {
    expect(PUBLIC_USER_FIELDS.split(" ")).toContain("cosmetics");
  });

  it("is passed through the XenBudget and XenSplit member serializers", async () => {
    // Loaded here, after the test environment is set: these modules reach the email client.
    const { transformMembers: budgetMembers } = await import("../utils/xenBudgetSerializer.js");
    const { transformMembers: splitMembers } = await import("../utils/xenSplitSerializer.js");
    const member = {
      _id: new mongoose.Types.ObjectId(),
      username: "a",
      avatar: "x",
      cosmetics: { badge: "golden-badge" },
    };
    const plain = { _id: new mongoose.Types.ObjectId(), username: "b", avatar: "y" };
    for (const transform of [budgetMembers, splitMembers]) {
      const out = transform({ members: [member, plain] }).members;
      expect(out[0].cosmetics).toEqual({ badge: "golden-badge" });
      expect(out[1].cosmetics).toBeUndefined();
    }
  });

  it("leaves out an empty or missing cosmetics object", () => {
    expect(cosmeticsOf({ cosmetics: {} })).toBeUndefined();
    expect(cosmeticsOf(null)).toBeUndefined();
    expect(cosmeticsOf({ cosmetics: { badge: "golden-badge" } })).toEqual({ badge: "golden-badge" });
  });
});
