import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import type { Request } from "express";
import { callerId } from "./http";

describe("callerId", () => {
  it("is a plain string even though the user's _id is an ObjectId, so === against stored ids works", () => {
    const oid = new Types.ObjectId();
    const id = callerId({ user: { _id: oid } } as unknown as Request);
    expect(typeof id).toBe("string");
    expect(id).toBe(oid.toHexString());
    expect(id === oid.toHexString()).toBe(true);
  });

  it("leaves a string id unchanged", () => {
    expect(callerId({ user: { _id: "abc" } } as unknown as Request)).toBe("abc");
  });
});
