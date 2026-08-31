import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { isSameId } from "./objectId";

const { ObjectId } = mongoose.Types;

const id = new ObjectId();
const hex = id.toString();
const otherId = new ObjectId();

describe("isSameId", () => {
  it("matches an ObjectId against its own hex string", () => {
    // The exact comparison DELETE /api/recipaint/:id was getting wrong: req.user._id is an
    // ObjectId, recipe.owner.toString() is a hex string, and `!==` called them different.
    expect(isSameId(id, hex)).toBe(true);
    expect(isSameId(hex, id)).toBe(true);
  });

  it("matches like-for-like shapes", () => {
    expect(isSameId(id, new ObjectId(hex))).toBe(true);
    expect(isSameId(hex, hex)).toBe(true);
  });

  it("ignores hex casing", () => {
    expect(isSameId(hex.toUpperCase(), hex.toLowerCase())).toBe(true);
    expect(isSameId(id, hex.toUpperCase())).toBe(true);
  });

  it("reaches through a populated ref to the id it carries", () => {
    expect(isSameId({ _id: id, username: "cgidzinski" }, hex)).toBe(true);
    expect(isSameId({ _id: hex }, id)).toBe(true);
    expect(isSameId({ _id: id }, { _id: hex })).toBe(true);
  });

  // The authorization property: the fix must not become a hole.
  it("never matches two different ids, in any combination of shapes", () => {
    const other = otherId.toString();
    for (const [a, b] of [
      [id, otherId],
      [id, other],
      [hex, otherId],
      [hex, other],
      [{ _id: id }, other],
      [{ _id: id }, { _id: otherId }],
    ] as const) {
      expect(isSameId(a, b), `${String(a)} vs ${String(b)}`).toBe(false);
    }
  });

  it("returns false for anything that isn't a usable id, without throwing", () => {
    for (const value of [
      null,
      undefined,
      "",
      "asset",
      "paints",
      hex.slice(0, 23), // one char short
      `${hex}a`, // one char long
      "zzzzzzzzzzzzzzzzzzzzzzzz", // 24 chars, not hex
      {},
      { _id: null },
      { _id: "nope" },
      [],
      0,
      NaN,
      true,
    ]) {
      expect(isSameId(value, hex), `left=${JSON.stringify(value)}`).toBe(false);
      expect(isSameId(hex, value), `right=${JSON.stringify(value)}`).toBe(false);
    }
  });

  it("does not treat two unusable values as equal", () => {
    expect(isSameId(null, null)).toBe(false);
    expect(isSameId(undefined, undefined)).toBe(false);
    expect(isSameId("asset", "asset")).toBe(false);
  });
});
