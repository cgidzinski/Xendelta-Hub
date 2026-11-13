import { describe, it, expect } from "vitest";
import { convertAmount, convertTemp } from "./units";

const c = (q: string, u: string, s: "original" | "metric" | "us") => convertAmount(q, u, s);

describe("convertAmount to metric", () => {
  it("turns spoons and cups into ml, rounded to a figure a cook would measure", () => {
    expect(c("1", "tsp", "metric")).toEqual({ quantity: "5", unit: "ml" });
    expect(c("1", "tbsp", "metric")).toEqual({ quantity: "15", unit: "ml" });
    expect(c("1", "cup", "metric")).toEqual({ quantity: "240", unit: "ml" });
    expect(c("½", "cup", "metric")).toEqual({ quantity: "120", unit: "ml" });
    expect(c("1 1/2", "cups", "metric")).toEqual({ quantity: "350", unit: "ml" });
    expect(c("¼", "tsp", "metric")).toEqual({ quantity: "1", unit: "ml" });
  });

  it("switches to litres from a litre up", () => {
    expect(c("4", "cups", "metric")).toEqual({ quantity: "950", unit: "ml" });
    expect(c("5", "cups", "metric")).toEqual({ quantity: "1.18", unit: "L" });
    expect(c("2", "quarts", "metric")).toEqual({ quantity: "1.89", unit: "L" });
  });

  it("turns ounces and pounds into grams or kilograms", () => {
    expect(c("1", "oz", "metric")).toEqual({ quantity: "30", unit: "g" });
    expect(c("8", "oz", "metric")).toEqual({ quantity: "230", unit: "g" });
    expect(c("1", "lb", "metric")).toEqual({ quantity: "450", unit: "g" });
    expect(c("3", "pounds", "metric")).toEqual({ quantity: "1.36", unit: "kg" });
  });

  it("converts a range using one unit for both ends", () => {
    expect(c("1-2", "cups", "metric")).toEqual({ quantity: "240–470", unit: "ml" });
    expect(c("2–3", "tbsp", "metric")).toEqual({ quantity: "30–45", unit: "ml" });
  });

  it("leaves metric units alone", () => {
    expect(c("200", "g", "metric")).toEqual({ quantity: "200", unit: "g" });
    expect(c("500", "ml", "metric")).toEqual({ quantity: "500", unit: "ml" });
  });
});

describe("convertAmount to US", () => {
  it("turns grams into ounces and pounds", () => {
    expect(c("100", "g", "us")).toEqual({ quantity: "3½", unit: "oz" });
    expect(c("500", "g", "us")).toEqual({ quantity: "1⅛", unit: "lb" });
    expect(c("1", "kg", "us")).toEqual({ quantity: "2¼", unit: "lb" });
  });

  it("turns millilitres into the nearest spoon or cup", () => {
    expect(c("5", "ml", "us")).toEqual({ quantity: "1", unit: "tsp" });
    expect(c("30", "ml", "us")).toEqual({ quantity: "2", unit: "tbsp" });
    expect(c("250", "ml", "us")).toEqual({ quantity: "1", unit: "cup" });
    expect(c("500", "ml", "us")).toEqual({ quantity: "2⅛", unit: "cups" });
    expect(c("1", "l", "us")).toEqual({ quantity: "4¼", unit: "cups" });
  });

  it("leaves US units alone", () => {
    expect(c("2", "cups", "us")).toEqual({ quantity: "2", unit: "cups" });
  });
});

describe("convertAmount leaves what it can't convert", () => {
  it("as written, or not a measure, or not a number", () => {
    expect(c("1", "cup", "original")).toEqual({ quantity: "1", unit: "cup" });
    expect(c("3", "cloves", "metric")).toEqual({ quantity: "3", unit: "cloves" });
    expect(c("2", "cans", "us")).toEqual({ quantity: "2", unit: "cans" });
    expect(c("a pinch", "tsp", "metric")).toEqual({ quantity: "a pinch", unit: "tsp" });
    expect(c("", "cup", "metric")).toEqual({ quantity: "", unit: "cup" });
    expect(c("0", "cup", "metric")).toEqual({ quantity: "0", unit: "cup" });
    expect(c("1", "", "metric")).toEqual({ quantity: "1", unit: "" });
  });

  it("reads unit spellings and case", () => {
    expect(c("1", "Tablespoon", "metric").unit).toBe("ml");
    expect(c("2", "TBSP.", "metric").quantity).toBe("30");
    expect(c("1", "fl oz", "metric")).toEqual({ quantity: "30", unit: "ml" });
    expect(c("12", "Ounces", "metric")).toEqual({ quantity: "340", unit: "g" });
  });
});

describe("convertTemp", () => {
  it("converts to the nearest 5 degrees", () => {
    expect(convertTemp(350, "F", "metric")).toEqual({ temp: 175, unit: "C" });
    expect(convertTemp(425, "F", "metric")).toEqual({ temp: 220, unit: "C" });
    expect(convertTemp(180, "C", "us")).toEqual({ temp: 355, unit: "F" });
  });
  it("keeps the unit it was written in, or when it already matches", () => {
    expect(convertTemp(350, "F", "original")).toEqual({ temp: 350, unit: "F" });
    expect(convertTemp(350, "F", "us")).toEqual({ temp: 350, unit: "F" });
    expect(convertTemp(180, "C", "metric")).toEqual({ temp: 180, unit: "C" });
  });
});
