// When to save a page's text and what to do when somebody else saves it too. Pure, so the rules can be tested; the hook
// (usePageDraft.ts) feeds it events and carries out what it says.
//
// The editor holds what is being typed. A save names the revision it started from; when someone else saves the same page
// the server tells everyone who has it open. If this editor has nothing unsaved it quietly takes their version; if it
// has, it keeps the person's own text and offers to reload instead. Whichever is chosen, the last save wins for now.

export interface DraftState {
  /** The newest revision this editor knows of. */
  rev: number;
  /** Typed since the last save started. */
  dirty: boolean;
  saving: boolean;
  /** The last save failed (a later edit or save clears it). */
  failed: boolean;
  /** Someone else saved a newer revision while this editor had unsaved text; shown as a warning. */
  remote: { by: string; rev: number } | null;
}

export const initialDraft = (rev: number): DraftState => ({
  rev,
  dirty: false,
  saving: false,
  failed: false,
  remote: null,
});

export type DraftEvent =
  | { type: "edit" }
  | { type: "saveStarted" }
  | { type: "saved"; rev: number }
  | { type: "saveFailed" }
  | { type: "reloaded"; rev: number }
  | { type: "keepMine" }
  | { type: "remote"; rev: number; by: string };

export function reduceDraft(state: DraftState, event: DraftEvent): DraftState {
  switch (event.type) {
    case "edit":
      return { ...state, dirty: true, failed: false };
    case "saveStarted":
      return { ...state, dirty: false, saving: true };
    case "saved":
      return { ...state, saving: false, failed: false, rev: Math.max(state.rev, event.rev), remote: null };
    case "saveFailed":
      // The text is still unsaved.
      return { ...state, saving: false, dirty: true, failed: true };
    case "reloaded":
      return { ...state, rev: event.rev, dirty: false, remote: null };
    case "keepMine":
      return { ...state, remote: null };
    case "remote":
      return { ...state, remote: event.rev > state.rev ? { by: event.by, rev: event.rev } : state.remote };
  }
}

/**
 * What to do about a save announced by the server: nothing (it is old, or it came from this very editor), take it
 * quietly, or warn. `client` is the random id each editor sends with its saves, so the same person's other tab or phone
 * counts as somebody else, while this editor's own saves (which can arrive before their reply does) are ignored.
 */
export function remoteAction(
  state: DraftState,
  event: { rev: number; client?: string },
  myClientId: string,
): "ignore" | "reload" | "warn" {
  if (event.client === myClientId || event.rev <= state.rev) return "ignore";
  return state.dirty || state.saving ? "warn" : "reload";
}

/** What the page shows beside the title. */
export type DraftLabel = "Saving…" | "Saved" | "Couldn't save" | "Unsaved changes";

export function draftLabel(state: DraftState): DraftLabel {
  if (state.failed) return "Couldn't save";
  if (state.saving) return "Saving…";
  if (state.dirty) return "Unsaved changes";
  return "Saved";
}
