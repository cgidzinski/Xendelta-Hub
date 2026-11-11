import { describe, it, expect } from "vitest";
import { readStored, writeStored } from "./useLocalStorageState";

const isNumber = (v: unknown): v is number => typeof v === "number";

const fakeStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
};

describe("readStored / writeStored", () => {
  it("round-trips a value", () => {
    const s = fakeStorage();
    writeStored(s, "k", 30);
    expect(readStored(s, "k", isNumber, 7)).toBe(30);
  });
  it("falls back when nothing is stored", () => {
    expect(readStored(fakeStorage(), "k", isNumber, 7)).toBe(7);
  });
  it("falls back for a value the validator rejects (e.g. written by an older version)", () => {
    expect(readStored(fakeStorage({ k: JSON.stringify("pending") }), "k", isNumber, 7)).toBe(7);
  });
  it("falls back for corrupt JSON", () => {
    expect(readStored(fakeStorage({ k: "{nope" }), "k", isNumber, 7)).toBe(7);
  });
  it("survives storage that throws, and storage that isn't there", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(readStored(throwing, "k", isNumber, 7)).toBe(7);
    expect(() => writeStored(throwing, "k", 1)).not.toThrow();
    expect(readStored(undefined, "k", isNumber, 7)).toBe(7);
    expect(() => writeStored(undefined, "k", 1)).not.toThrow();
  });
});
