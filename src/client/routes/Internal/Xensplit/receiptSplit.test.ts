import { describe, it, expect } from "vitest";
import { splitReceipt } from "./receiptSplit";

const cents = (o: Record<string, number>) => Math.round(Object.values(o).reduce((a, b) => a + b, 0) * 100);

describe("splitReceipt", () => {
  it("gives a line to one person and shares tax and tip in proportion", () => {
    const owed = splitReceipt(
      [
        { name: "Pasta", amount: 20 },
        { name: "Salad", amount: 10 },
      ],
      [["a"], ["b"]],
      3,
      6,
    );
    expect(owed).toEqual({ a: 26, b: 13 });
  });

  it("splits a shared line equally and never loses a cent", () => {
    const owed = splitReceipt([{ name: "Pizza", amount: 10 }], [["a", "b", "c"]], 0.01, 0);
    expect(cents(owed)).toBe(1001);
    expect(Object.values(owed).every((v) => v >= 3.33 && v <= 3.35)).toBe(true);
  });

  it("leaves out lines nobody had", () => {
    expect(splitReceipt([{ name: "Gum", amount: 2 }], [[]], 1, 1)).toEqual({});
    const lines = [
      { name: "Gum", amount: 2 },
      { name: "Tea", amount: 3 },
    ];
    expect(splitReceipt(lines, [[], ["a"]], 0, 0)).toEqual({ a: 3 });
  });

  it("totals to the assigned lines plus tax and tip across awkward amounts", () => {
    const lines = [7.77, 3.33, 9.99, 0.07].map((amount, i) => ({ name: String(i), amount }));
    const owed = splitReceipt(lines, [["a", "b"], ["b", "c"], ["a", "b", "c"], ["c"]], 2.13, 4.57);
    expect(cents(owed)).toBe(777 + 333 + 999 + 7 + 213 + 457);
  });
});
