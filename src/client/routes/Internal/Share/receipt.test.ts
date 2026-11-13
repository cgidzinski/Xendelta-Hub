import { describe, it, expect } from "vitest";
import { MAX_RECEIPT_IMAGES, receiptImages, receiptPath } from "./receipt";

const file = (name: string, type: string) => new File(["x"], name, { type });

describe("receipt sharing", () => {
  it("goes to the group's expenses or the book's items, flagged", () => {
    expect(receiptPath("xensplit", "g1")).toBe("/internal/xensplit/groups/g1/expenses?receipt=1");
    expect(receiptPath("xenbudget", "b1")).toBe("/internal/xenbudget/books/b1/items?receipt=1");
  });

  it("takes only the photos, and no more than the forms hold", () => {
    const shared = [file("a.jpg", "image/jpeg"), file("n.pdf", "application/pdf"), file("b.png", "image/png")];
    expect(receiptImages(shared, MAX_RECEIPT_IMAGES).map((f) => f.name)).toEqual(["a.jpg", "b.png"]);
    const many = Array.from({ length: 15 }, (_, i) => file(`p${i}.jpg`, "image/jpeg"));
    expect(receiptImages(many, MAX_RECEIPT_IMAGES)).toHaveLength(10);
    expect(receiptImages([], 10)).toEqual([]);
  });
});
