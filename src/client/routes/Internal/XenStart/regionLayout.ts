import { CENTER_REGIONS, regionStyle, type RegionStyles, type WidgetRegion } from "@shared/xenstart";

export function desktopGrid(styles: RegionStyles) {
  const heights = CENTER_REGIONS.map((region) => regionStyle(region, styles).height);
  const autoOnly = heights.every((height) => height === null);
  return {
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr)",
    gridTemplateAreas: '"left top right" "left center right" "left bottom right"' + (autoOnly ? ' "left . right"' : ""),
    gridTemplateRows:
      heights.map((height) => (height === null ? "max-content" : `minmax(min-content, ${height}fr)`)).join(" ") +
      (autoOnly ? " minmax(0, 1fr)" : ""),
  };
}

const flexAlignment = { start: "flex-start", center: "center", end: "flex-end" } as const;

export function regionSizing(region: WidgetRegion, styles: RegionStyles) {
  const { alignment, paddingTop } = regionStyle(region, styles);
  return { justifyContent: flexAlignment[alignment], paddingTop };
}
