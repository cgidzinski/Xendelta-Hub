import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { xensplitKeys } from "./xensplit/keys";
import { xenbudgetKeys } from "./xenbudget/keys";
import { xenboxKeys } from "./xenbox/keys";

describe("query keys", () => {
  it("XenSplit keys are the arrays the screens always used", () => {
    expect(xensplitKeys.groups()).toEqual(["xensplit", "groups"]);
    expect(xensplitKeys.group("g1")).toEqual(["xensplit", "group", "g1"]);
    expect(xensplitKeys.groupLog("g1")).toEqual(["xensplit", "group", "g1", "log"]);
    expect(xensplitKeys.balances("g1")).toEqual(["xensplit", "balances", "g1"]);
    expect(xensplitKeys.expenseImageUrls("g1", "e1")).toEqual(["xensplit", "expense-image-urls", "g1", "e1"]);
    expect(xensplitKeys.rate("CAD", "USD")).toEqual(["xensplit", "rate", "CAD", "USD"]);
  });

  it("the log key sits under the group key, so invalidating a group refreshes its log", () => {
    expect(xensplitKeys.groupLog("g1").slice(0, 3)).toEqual([...xensplitKeys.group("g1")]);
  });

  it("XenBudget keys are the arrays the screens always used", () => {
    expect(xenbudgetKeys.books()).toEqual(["xenbudget", "books"]);
    expect(xenbudgetKeys.book("b1")).toEqual(["xenbudget", "book", "b1"]);
    expect(xenbudgetKeys.items("b1")).toEqual(["xenbudget", "items", "b1"]);
    expect(xenbudgetKeys.items("b1", { q: 1 })).toEqual(["xenbudget", "items", "b1", { q: 1 }]);
    expect(xenbudgetKeys.summary("b1", { p: 1 })).toEqual(["xenbudget", "summary", "b1", { p: 1 }]);
    expect(xenbudgetKeys.budgetStatus("b1", "CAD", "a", "b", true)).toEqual([
      "xenbudget",
      "budget-status",
      "b1",
      "CAD",
      "a",
      "b",
      true,
    ]);
    expect(xenbudgetKeys.forBook("recurring", "b1")).toEqual(["xenbudget", "recurring", "b1"]);
    expect(xenbudgetKeys.all).toEqual(["xenbudget"]);
  });

  it("a book's list key is a prefix of its parameterised variants", () => {
    expect(xenbudgetKeys.summary("b1", { p: 1 }).slice(0, 3)).toEqual([...xenbudgetKeys.summary("b1")]);
  });

  it("XenBox file keys", () => {
    expect(xenboxKeys.files()).toEqual(["xenboxFiles"]);
    expect(xenboxKeys.files("cat")).toEqual(["xenboxFiles", "cat"]);
  });

  it("no screen spells these keys out by hand again", () => {
    const root = join(__dirname, "..");
    const bad: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (
          /\.tsx?$/.test(name) &&
          !/keys\.ts$|\.test\./.test(name) &&
          /\["(xensplit|xenbudget|xenboxFiles)"[,\]]/.test(readFileSync(full, "utf8"))
        )
          bad.push(relative(root, full));
      }
    };
    walk(root);
    // constants/apps.ts holds app ids, not query keys.
    expect(
      bad.filter((f) => !f.endsWith("apps.ts")),
      "use the keys.ts factory for the app",
    ).toEqual([]);
  });
});
