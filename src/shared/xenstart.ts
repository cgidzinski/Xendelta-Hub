export const XENSTART_PATH = "/internal/xenstart";
export const GRID_DIMENSION_LIMIT = 6;
export const QUICK_LINK_LIMIT = GRID_DIMENSION_LIMIT ** 2;

export const DEFAULT_APPEARANCE = {
  rows: 2,
  columns: 6,
  backgroundUrl: "",
  showClock: false,
};

export type XenStartAppearance = typeof DEFAULT_APPEARANCE;
export const SEARCH_ENGINES = ["Google", "DuckDuckGo", "Bing"] as const;
export const HUB_SECTIONS = ["pinned", "attention", "activity"] as const;

export const CLOCK_FORMATS = ["locale", "12-hour", "24-hour"] as const;
export type ClockFormat = (typeof CLOCK_FORMATS)[number];

export const WIDGET_REGIONS = ["top", "center", "left", "right", "bottom"] as const;
export const WIDGET_TYPES = ["search", "links", "clock", ...HUB_SECTIONS] as const;
export type WidgetRegion = (typeof WIDGET_REGIONS)[number];
export type WidgetType = (typeof WIDGET_TYPES)[number];
export type WidgetLayout = Record<WidgetRegion, WidgetType[]>;

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
  appearance: XenStartAppearance;
  layout?: WidgetLayout;
  clockFormat?: ClockFormat;
}

export const defaultXenStartConfig = (): XenStartConfig => ({
  links: [],
  engine: "Google",
  sections: [],
  revision: 0,
  appearance: { ...DEFAULT_APPEARANCE },
});

export function widgetLayout(config: XenStartConfig): WidgetLayout {
  return (
    config.layout ?? {
      top: [],
      center: config.appearance.showClock ? ["clock", "search", "links"] : ["search", "links"],
      left: [],
      right: [],
      bottom: HUB_SECTIONS.filter((widget) => config.sections.includes(widget)),
    }
  );
}

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
