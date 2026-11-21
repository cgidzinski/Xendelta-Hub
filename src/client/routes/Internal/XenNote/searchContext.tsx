import { createContext, useContext, useState, type ReactNode } from "react";

interface XenNoteSearchValue {
  query: string;
  setQuery: (q: string) => void;
}

const XenNoteSearchContext = createContext<XenNoteSearchValue | null>(null);

/** What the rail search has typed, shared with the results that open in the main window. */
export function XenNoteSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  return <XenNoteSearchContext.Provider value={{ query, setQuery }}>{children}</XenNoteSearchContext.Provider>;
}

export function useXenNoteSearch(): XenNoteSearchValue {
  const value = useContext(XenNoteSearchContext);
  if (!value) throw new Error("useXenNoteSearch must be used within a XenNoteSearchProvider");
  return value;
}
