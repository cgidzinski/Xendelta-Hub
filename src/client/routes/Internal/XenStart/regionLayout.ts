import { CENTER_REGIONS, regionStyle, type RegionStyles, type WidgetRegion } from "@shared/xenstart";

export function desktopGrid(styles: RegionStyles) {
  return {
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr)",
    gridTemplateAreas: '"left top right" "left center right" "left bottom right"',
    gridTemplateRows: CENTER_REGIONS.map((region) => {
      const { height } = regionStyle(region, styles);
      return height === null ? "auto" : `minmax(min-content, ${height}fr)`;
    }).join(" "),
  };
}

export function regionSizing(region: WidgetRegion, styles: RegionStyles) {
  const { alignment, paddingTop } = regionStyle(region, styles);
  return { justifyContent: `safe ${alignment}`, paddingTop };
}
