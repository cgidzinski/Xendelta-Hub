import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { xensplitKeys } from "./xensplit/keys";
import { xenbudgetKeys } from "./xenbudget/keys";
import { xendriveKeys } from "./xendrive/keys";
import { xennoteKeys } from "./xennote/keys";
import { chatKeys } from "./chat/keys";
import { peopleKeys } from "./people/keys";

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

  it("XenDrive keys: everything sits under [xendrive], and a folder key is a prefix of its search variants", () => {
    expect(xendriveKeys.all).toEqual(["xendrive"]);
    expect(xendriveKeys.browse()).toEqual(["xendrive", "browse", null, "", "folder", false, ""]);
    expect(xendriveKeys.browse("f1", "tax")).toEqual(["xendrive", "browse", "f1", "tax", "folder", false, ""]);
    // files apps stored for the person are a different listing
    expect(xendriveKeys.browse("f1", "", "folder", false, "all")).toEqual([
      "xendrive",
      "browse",
      "f1",
      "",
      "folder",
      false,
      "all",
    ]);
    expect(xendriveKeys.browse("f1").slice(0, 2)).toEqual([...xendriveKeys.browseAll()]);
    expect(xendriveKeys.file("x")).toEqual(["xendrive", "file", "x"]);
    expect(xendriveKeys.publicFolder("t", "f")).toEqual(["xendrive", "public-folder", "t", "f"]);
  });

  it("XenNote keys sit under [xennote], and the notes key is a prefix of every filtered variant", () => {
    expect(xennoteKeys.all).toEqual(["xennote"]);
    expect(xennoteKeys.notes({ label: "a" }).slice(0, 2)).toEqual([...xennoteKeys.notesAll()]);
    expect(xennoteKeys.notebooks()).toEqual(["xennote", "notebooks"]);
    expect(xennoteKeys.publicNote("t")).toEqual(["xennote", "public-note", "t"]);
  });

  it("chat keys nest under one root, so one invalidation reaches all of them", () => {
    expect(chatKeys.conversations()).toEqual(["chat", "conversations"]);
    expect(chatKeys.messages("c1")).toEqual(["chat", "messages", "c1"]);
    for (const key of [chatKeys.conversation("c1"), chatKeys.messages("c1"), chatKeys.unread()]) {
      expect(key.slice(0, 1)).toEqual([...chatKeys.all]);
    }
  });

  it("people keys nest under one root, so one invalidation reaches all of them", () => {
    expect(peopleKeys.known()).toEqual(["people", "known"]);
    expect(peopleKeys.search("ab")).toEqual(["people", "search", "ab"]);
    expect(peopleKeys.profile("u1")).toEqual(["people", "profile", "u1"]);
    for (const key of [peopleKeys.known(), peopleKeys.search("ab"), peopleKeys.profile("u1")]) {
      expect(key.slice(0, 1)).toEqual([...peopleKeys.all]);
    }
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
          /\["(xensplit|xenbudget|xendrive|xennote|chat|people)"[,\]]/.test(readFileSync(full, "utf8"))
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
