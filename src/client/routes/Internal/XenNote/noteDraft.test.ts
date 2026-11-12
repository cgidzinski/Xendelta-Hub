import { describe, it, expect } from "vitest";
import {
  changeType,
  checklistProgress,
  draftFromNote,
  emptyDraft,
  hostOf,
  isDirty,
  isEmptyDraft,
  moveItem,
  toInput,
} from "./noteDraft";
import type { XenNote } from "../../../types/XenNote";

describe("changeType", () => {
  it("text -> checklist turns lines into items and empties the text", () => {
    const d = changeType(emptyDraft({ body: "milk\n- eggs\n\nbread" }), "checklist");
    expect(d.type).toBe("checklist");
    expect(d.checklist.map((i) => i.text)).toEqual(["milk", "eggs", "bread"]);
    expect(d.body).toBe("");
  });

  it("checklist -> text turns items into lines, marking ticked ones, and empties the list", () => {
    const d = changeType(
      emptyDraft({
        type: "checklist",
        checklist: [
          { text: "a", done: false },
          { text: "b", done: true },
        ],
      }),
      "text",
    );
    expect(d.body).toBe("a\n[x] b");
    expect(d.checklist).toEqual([]);
  });

  it("other switches keep what was written", () => {
    const d = changeType(emptyDraft({ body: "caption" }), "image");
    expect(d).toMatchObject({ type: "image", body: "caption" });
    expect(changeType(d, "image")).toBe(d);
  });
});

describe("toInput", () => {
  it("sends only what belongs to the type", () => {
    const text = toInput(emptyDraft({ type: "text", body: "hi", checklist: [{ text: "x", done: false }] }));
    expect(text).toMatchObject({ type: "text", body: "hi" });
    expect(text.checklist).toBeUndefined();

    const list = toInput(
      emptyDraft({
        type: "checklist",
        body: "stale",
        checklist: [
          { text: "a", done: true },
          { text: "  ", done: false },
        ],
      }),
    );
    expect(list.body).toBe("");
    expect(list.checklist).toEqual([{ text: "a", done: true }]);

    const link = toInput(emptyDraft({ type: "link", link: { url: "https://x.y", title: "T", description: "" } }));
    expect(link.link?.url).toBe("https://x.y");
  });

  it("normalises labels", () => {
    expect(toInput(emptyDraft({ labels: [" Work ", "work", "Home"] })).labels).toEqual(["Work", "Home"]);
  });
});

describe("isEmptyDraft / isDirty", () => {
  it("an untouched draft is empty; any content makes it worth saving", () => {
    expect(isEmptyDraft(emptyDraft())).toBe(true);
    expect(isEmptyDraft(emptyDraft({ title: " " }))).toBe(true);
    expect(isEmptyDraft(emptyDraft({ title: "a" }))).toBe(false);
    expect(isEmptyDraft(emptyDraft({ type: "checklist", checklist: [{ text: "x", done: false }] }))).toBe(false);
    expect(isEmptyDraft(emptyDraft({ pendingImages: [new File(["x"], "a.png")] }))).toBe(false);
  });

  it("notices a change, and photos waiting to upload", () => {
    const a = emptyDraft({ title: "a" });
    expect(isDirty(a, { ...a })).toBe(false);
    expect(isDirty(a, { ...a, title: "b" })).toBe(true);
    expect(isDirty(a, { ...a, pendingImages: [new File(["x"], "a.png")] })).toBe(true);
  });
});

describe("draftFromNote / hostOf", () => {
  it("copies a saved note into an editable draft", () => {
    const note = {
      type: "checklist",
      title: "T",
      body: "",
      checklist: [{ _id: "1", text: "a", done: true }],
      link: { url: "", title: "", description: "" },
      color: "blue",
      pinned: true,
      archived: false,
      labels: ["x"],
      notebook_id: "nb",
    } as unknown as XenNote;
    const d = draftFromNote(note);
    expect(d).toMatchObject({ type: "checklist", color: "blue", pinned: true, notebook_id: "nb", labels: ["x"] });
    d.checklist[0].done = false; // editing the draft must not touch the note
    expect(note.checklist[0].done).toBe(true);
  });

  it("shows a link's host without www, and the raw text when it isn't an address", () => {
    expect(hostOf("https://www.example.com/a/b")).toBe("example.com");
    expect(hostOf("not a url")).toBe("not a url");
  });
});

describe("moveItem", () => {
  it("moves an item to a new position", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("leaves the list alone for a no-op or out-of-range move", () => {
    const list = ["a", "b"];
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(moveItem(list, 0, 5)).toBe(list);
    expect(moveItem(list, -1, 0)).toBe(list);
  });
});

describe("checklistProgress", () => {
  it("counts ticked items out of those with text", () => {
    expect(
      checklistProgress([
        { text: "a", done: true },
        { text: "b", done: false },
        { text: "  ", done: true },
      ]),
    ).toEqual({ done: 1, total: 2 });
  });
});
