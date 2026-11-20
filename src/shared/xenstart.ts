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
export const WIDGET_TYPES = ["search", "links", "clock", "today", ...HUB_SECTIONS] as const;
export type WidgetRegion = (typeof WIDGET_REGIONS)[number];
export type WidgetType = (typeof WIDGET_TYPES)[number];
export type WidgetLayout = Record<WidgetRegion, WidgetType[]>;

export const CENTER_REGIONS = ["top", "center", "bottom"] as const;
export const REGION_ALIGNMENTS = ["start", "center", "end"] as const;
export const REGION_HEIGHT_SHARES = [1, 2, 3, 4] as const;
export const REGION_PADDING_STEP = 8;
export const MAX_REGION_PADDING = 160;

export interface RegionStyle {
  height?: (typeof REGION_HEIGHT_SHARES)[number] | null;
  alignment?: (typeof REGION_ALIGNMENTS)[number];
  paddingTop?: number;
}

export type RegionStyles = Partial<Record<WidgetRegion, RegionStyle>>;

export function regionStyle(region: WidgetRegion, styles: RegionStyles = {}): Required<RegionStyle> {
  return {
    height: region === "top" || region === "bottom" ? 1 : null,
    alignment: region === "bottom" ? "end" : "start",
    paddingTop: 0,
    ...styles[region],
  };
}

export function withRegionStyle(styles: RegionStyles, region: WidgetRegion, style: RegionStyle): RegionStyles {
  const defaults = regionStyle(region);
  const overrides: RegionStyle = {};
  if (style.height !== undefined && style.height !== defaults.height) overrides.height = style.height;
  if (style.alignment !== undefined && style.alignment !== defaults.alignment) overrides.alignment = style.alignment;
  if (style.paddingTop !== undefined && style.paddingTop !== defaults.paddingTop)
    overrides.paddingTop = style.paddingTop;
  const next = { ...styles };
  if (Object.keys(overrides).length) next[region] = overrides;
  else delete next[region];
  return next;
}

export function mergeRegionStyles(base: RegionStyles, draft: RegionStyles, latest: RegionStyles): RegionStyles {
  let next = latest;
  for (const region of WIDGET_REGIONS) {
    const original = regionStyle(region, base);
    const edited = regionStyle(region, draft);
    const current = regionStyle(region, latest);
    next = withRegionStyle(next, region, {
      height: edited.height === original.height ? current.height : edited.height,
      alignment: edited.alignment === original.alignment ? current.alignment : edited.alignment,
      paddingTop: edited.paddingTop === original.paddingTop ? current.paddingTop : edited.paddingTop,
    });
  }
  return next;
}

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
  regionStyles?: RegionStyles;
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
