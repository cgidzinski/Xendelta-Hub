import { generateKeyBetween } from "fractional-indexing";
import { AppError } from "./http";

// Where to put an item among its siblings. Sections in a notebook and pages in a section are kept
// in order by a fractional-index string: a new key is made between its neighbours, so moving or inserting writes only
// the item that moved and never renumbers the rest.

export interface Sibling {
  id: string;
  order: string;
}

export interface Position {
  /** Put it right before this sibling. */
  before?: string;
  /** Put it right after this sibling. */
  after?: string;
}

/** Siblings in display order: by key, then by id so two equal keys (made at the same moment) still have one order. */
export const inOrder = <T extends Sibling>(siblings: T[]): T[] =>
  [...siblings].sort((a, b) =>
    a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

/**
 * The key for an item placed at `position` among `siblings` (not counting the item itself). With no position it goes
 * last. A named sibling that isn't there is a 400.
 */
export function orderFor(siblings: Sibling[], position: Position = {}): string {
  const list = inOrder(siblings);
  let prev: string | null = list[list.length - 1]?.order ?? null;
  let next: string | null = null;

  if (position.after !== undefined || position.before !== undefined) {
    const anchor = position.after ?? position.before;
    const at = list.findIndex((s) => s.id === anchor);
    if (at === -1) throw new AppError(400, "That position isn't in this list");
    if (position.after !== undefined) {
      prev = list[at].order;
      next = list[at + 1]?.order ?? null;
    } else {
      prev = list[at - 1]?.order ?? null;
      next = list[at].order;
    }
  }

  // Two neighbours with the same key can't have anything between them: go after the first instead.
  if (prev !== null && next !== null && prev >= next) next = null;
  return generateKeyBetween(prev, next);
}
