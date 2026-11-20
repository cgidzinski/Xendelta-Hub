import { describe, expect, it } from "vitest";
import { draftLabel, initialDraft, reduceDraft, remoteAction, type DraftEvent, type DraftState } from "./pageDraft";

const run = (events: DraftEvent[], from: DraftState = initialDraft(3)) => events.reduce(reduceDraft, from);

describe("saving", () => {
  it("starts saved, goes unsaved on an edit, saving when the save starts, and saved with the new revision", () => {
    expect(draftLabel(initialDraft(3))).toBe("Saved");
    const edited = run([{ type: "edit" }]);
    expect(edited).toMatchObject({ dirty: true });
    expect(draftLabel(edited)).toBe("Unsaved changes");
    const saving = run([{ type: "edit" }, { type: "saveStarted" }]);
    expect(saving).toMatchObject({ dirty: false, saving: true });
    expect(draftLabel(saving)).toBe("Saving…");
    const saved = run([{ type: "edit" }, { type: "saveStarted" }, { type: "saved", rev: 4 }]);
    expect(saved).toMatchObject({ dirty: false, saving: false, rev: 4 });
    expect(draftLabel(saved)).toBe("Saved");
  });

  it("stays unsaved when typing goes on during a save", () => {
    const state = run([{ type: "edit" }, { type: "saveStarted" }, { type: "edit" }, { type: "saved", rev: 4 }]);
    expect(state).toMatchObject({ dirty: true, saving: false, rev: 4 });
    expect(draftLabel(state)).toBe("Unsaved changes");
  });

  it("keeps the text unsaved when a save fails, and clears the failure on the next edit", () => {
    const failed = run([{ type: "edit" }, { type: "saveStarted" }, { type: "saveFailed" }]);
    expect(failed).toMatchObject({ dirty: true, saving: false, failed: true });
    expect(draftLabel(failed)).toBe("Couldn't save");
    expect(reduceDraft(failed, { type: "edit" }).failed).toBe(false);
  });

  it("never goes back to an older revision", () => {
    expect(run([{ type: "saved", rev: 2 }]).rev).toBe(3);
  });
});

describe("somebody else saving", () => {
  it("is ignored when it came from this editor or is an old revision", () => {
    const state = initialDraft(3);
    expect(remoteAction(state, { rev: 4, client: "mine" }, "mine")).toBe("ignore");
    expect(remoteAction(state, { rev: 3, client: "other" }, "mine")).toBe("ignore");
    expect(remoteAction(state, { rev: 2, client: "other" }, "mine")).toBe("ignore");
  });

  it("counts the same person's other tab as somebody else, and a save with no editor named too", () => {
    const state = initialDraft(3);
    expect(remoteAction(state, { rev: 4, client: "other-tab" }, "mine")).toBe("reload");
    expect(remoteAction(state, { rev: 4 }, "mine")).toBe("reload");
  });

  it("is taken quietly when nothing is unsaved", () => {
    expect(remoteAction(initialDraft(3), { rev: 4, client: "them" }, "mine")).toBe("reload");
  });

  it("warns when there is unsaved text or a save in flight", () => {
    expect(remoteAction(run([{ type: "edit" }]), { rev: 4, client: "them" }, "mine")).toBe("warn");
    expect(remoteAction(run([{ type: "edit" }, { type: "saveStarted" }]), { rev: 4, client: "them" }, "mine")).toBe(
      "warn",
    );
  });

  it("is remembered as a warning until it is reloaded, kept as ours, or saved over", () => {
    const warned = run([{ type: "edit" }, { type: "remote", rev: 4, by: "them" }]);
    expect(warned.remote).toEqual({ by: "them", rev: 4 });
    expect(reduceDraft(warned, { type: "keepMine" }).remote).toBeNull();
    expect(reduceDraft(warned, { type: "reloaded", rev: 4 })).toMatchObject({ remote: null, dirty: false, rev: 4 });
    expect(run([{ type: "saveStarted" }, { type: "saved", rev: 5 }], warned).remote).toBeNull();
  });

  it("doesn't warn about a revision already known", () => {
    expect(run([{ type: "remote", rev: 3, by: "them" }]).remote).toBeNull();
  });
});
