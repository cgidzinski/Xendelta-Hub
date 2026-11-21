import { createContext } from "react";

/** What the links and tags inside a page's text need from the screen around the editor. */
export interface PageLinksValue {
  /** The notebook the page is in (link suggestions list its pages first), when the person is in it. */
  notebookId: string | null;
  /** Open a page; `beside` opens it next to this one instead of replacing it. */
  onOpenPage: (id: string, options?: { beside?: boolean }) => void;
  /** Show the pages with this tag. */
  onOpenTag: (tag: string) => void;
  /** Make a page with this name in the open section and answer its id (null when it couldn't be made). */
  onCreatePage: (title: string) => Promise<string | null>;
  /** The tags used in this notebook, for suggestions after "#". */
  tags: () => string[];
}

export const PublicPageLinksContext = createContext<ReadonlyMap<string, string> | null>(null);

export const PageLinksContext = createContext<PageLinksValue>({
  notebookId: null,
  onOpenPage: () => undefined,
  onOpenTag: () => undefined,
  onCreatePage: async () => null,
  tags: () => [],
});
