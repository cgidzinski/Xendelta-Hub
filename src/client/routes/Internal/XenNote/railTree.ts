// Which branches of the rail's notebook tree are open. Kept out of the component so the rule is testable:
// the notebook and section of the current route are open, and whatever else the person opened stays open.

/** The open notebook and section ids of the tree. */
export interface OpenNodes {
  notebooks: ReadonlySet<string>;
  sections: ReadonlySet<string>;
}

export const closedNodes: OpenNodes = { notebooks: new Set(), sections: new Set() };

/** The tree with `id` open if it was closed, and closed if it was open. */
export function toggleOpen(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * The tree with the notebook and the section of the current route open, so a deep link or a page opened from
 * search shows its branch. Nothing is closed: what the person opened by hand stays open.
 */
export function openAtRoute(
  current: OpenNodes,
  notebookId: string | undefined,
  sectionId: string | undefined,
): OpenNodes {
  if ((!notebookId || current.notebooks.has(notebookId)) && (!sectionId || current.sections.has(sectionId))) {
    return current;
  }
  const notebooks = new Set(current.notebooks);
  const sections = new Set(current.sections);
  if (notebookId) notebooks.add(notebookId);
  if (sectionId) sections.add(sectionId);
  return { notebooks, sections };
}
