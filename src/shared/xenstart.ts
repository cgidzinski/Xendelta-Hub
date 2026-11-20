export const XENSTART_PATH = "/internal/xenstart";
export const QUICK_LINK_LIMIT = 12;
export const SEARCH_ENGINES = ["Google", "DuckDuckGo", "Bing"] as const;
export const HUB_SECTIONS = ["pinned", "attention", "activity"] as const;

export type SearchEngine = (typeof SEARCH_ENGINES)[number];
export type HubSection = (typeof HUB_SECTIONS)[number];

export interface QuickLink {
  id: string;
  label: string;
  url: string;
}

export interface XenStartConfig {
  links: QuickLink[];
  engine: SearchEngine;
  sections: HubSection[];
  revision: number;
}

export const defaultXenStartConfig = (): XenStartConfig => ({
  links: [],
  engine: "Google",
  sections: [],
  revision: 0,
});

export function parseQuickLinkUrl(value: string): URL | null {
  if (!/^https?:\/\//i.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    return url.username || url.password ? null : url;
  } catch {
    return null;
  }
}

const SEARCH_URLS: Record<SearchEngine, string> = {
  Google: "https://www.google.com/search",
  DuckDuckGo: "https://duckduckgo.com/",
  Bing: "https://www.bing.com/search",
};

export function searchUrl(engine: SearchEngine, query: string): string | null {
  const value = query.trim();
  if (!value) return null;
  const url = new URL(SEARCH_URLS[engine]);
  url.searchParams.set("q", value);
  return url.href;
}
