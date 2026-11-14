import { describe, it, expect } from "vitest";
import { reactedBy } from "./chatUi";

const people: Record<string, string> = {
  me: "Me",
  a: "Alex",
  b: "Sam",
  c: "Jo",
  d: "Mia",
  e: "Tom",
  f: "Lena",
  g: "Omar",
};
const lookup = (id: string | null | undefined) =>
  id && people[id] ? { _id: id, username: people[id]!, avatar: "" } : undefined;

describe("reactedBy", () => {
  it("names one person", () => {
    expect(reactedBy(["a"], "👍", lookup, "me")).toBe("Alex reacted with 👍");
  });
  it("says You first, and joins with and", () => {
    expect(reactedBy(["a", "me"], "👍", lookup, "me")).toBe("You and Alex reacted with 👍");
    expect(reactedBy(["a", "b", "me"], "❤️", lookup, "me")).toBe("You, Alex and Sam reacted with ❤️");
  });
  it("counts the rest after five", () => {
    expect(reactedBy(["a", "b", "c", "d", "e", "f", "g"], "🎉", lookup, "me")).toBe(
      "Alex, Sam, Jo, Mia, Tom and 2 others reacted with 🎉",
    );
    expect(reactedBy(["a", "b", "c", "d", "e", "f"], "🎉", lookup, "me")).toBe(
      "Alex, Sam, Jo, Mia, Tom and 1 other reacted with 🎉",
    );
  });
  it("calls someone who is gone Someone", () => {
    expect(reactedBy(["zz"], "👍", lookup, "me")).toBe("Someone reacted with 👍");
  });
});
