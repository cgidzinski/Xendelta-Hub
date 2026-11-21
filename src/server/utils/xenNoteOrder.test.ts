import { describe, expect, it } from "vitest";
import { inOrder, orderFor } from "./xenNoteOrder";

const keys = (items: Array<{ id: string; order: string }>) => inOrder(items).map((i) => i.id);

describe("orderFor", () => {
  it("starts a list", () => {
    expect(orderFor([])).toBe("a0");
  });

  it("goes last by default", () => {
    const items = [{ id: "a", order: "a0" }];
    items.push({ id: "b", order: orderFor(items) });
    items.push({ id: "c", order: orderFor(items) });
    expect(keys(items)).toEqual(["a", "b", "c"]);
  });

  it("goes first, before the first one", () => {
    const items = [
      { id: "a", order: "a0" },
      { id: "b", order: "a1" },
    ];
    items.push({ id: "x", order: orderFor(items, { before: "a" }) });
    expect(keys(items)).toEqual(["x", "a", "b"]);
  });

  it("goes between two, before or after either", () => {
    const items = [
      { id: "a", order: "a0" },
      { id: "b", order: "a1" },
    ];
    items.push({ id: "mid", order: orderFor(items, { after: "a" }) });
    items.push({ id: "mid2", order: orderFor(items, { before: "b" }) });
    expect(keys(items)).toEqual(["a", "mid", "mid2", "b"]);
  });

  it("goes after the last one", () => {
    const items = [
      { id: "a", order: "a0" },
      { id: "b", order: "a1" },
    ];
    items.push({ id: "z", order: orderFor(items, { after: "b" }) });
    expect(keys(items)).toEqual(["a", "b", "z"]);
  });

  it("keeps working after many insertions in the same gap", () => {
    const items = [
      { id: "a", order: "a0" },
      { id: "b", order: "a1" },
    ];
    for (let i = 0; i < 40; i++) items.push({ id: `n${i}`, order: orderFor(items, { after: "a" }) });
    expect(keys(items)[0]).toBe("a");
    expect(keys(items).at(-1)).toBe("b");
    expect(new Set(items.map((i) => i.order)).size).toBe(items.length);
  });

  it("refuses a position that is not in the list", () => {
    expect(() => orderFor([{ id: "a", order: "a0" }], { after: "nope" })).toThrow(/isn't in this list/);
  });

  it("still gives a key when two neighbours share one", () => {
    const items = [
      { id: "a", order: "a0" },
      { id: "b", order: "a0" },
    ];
    expect(orderFor(items, { after: "a" })).toBeTypeOf("string");
  });

  it("breaks ties between equal keys by id", () => {
    expect(
      keys([
        { id: "b", order: "a0" },
        { id: "a", order: "a0" },
      ]),
    ).toEqual(["a", "b"]);
  });
});
