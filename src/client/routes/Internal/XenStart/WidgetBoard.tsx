import type { ReactNode } from "react";
import { Box, ButtonBase, IconButton, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import {
  WIDGET_REGIONS,
  type RegionStyles,
  type WidgetLayout,
  type WidgetRegion,
  type WidgetType,
} from "@shared/xenstart";
import { RADIUS } from "../../../theme";
import { desktopGrid, regionSizing } from "./regionLayout";

export const widgetNames: Record<WidgetType, string> = {
  search: "Search",
  links: "Quick links",
  clock: "Clock",
  today: "Today",
  pinned: "Pinned apps",
  attention: "Needs attention",
  activity: "Activity",
};

export const regionNames: Record<WidgetRegion, string> = {
  top: "Top",
  center: "Center",
  left: "Left",
  right: "Right",
  bottom: "Bottom",
};

interface Props {
  layout: WidgetLayout;
  styles?: RegionStyles;
  editing: boolean;
  saving: boolean;
  canAdd: boolean;
  onAdd: (region: WidgetRegion) => void;
  onRemove: (widget: WidgetType, region: WidgetRegion) => void;
  renderControls: (widget: WidgetType) => ReactNode;
  renderWidget: (widget: WidgetType, region: WidgetRegion) => ReactNode;
}

export default function WidgetBoard({
  layout,
  styles = {},
  editing,
  saving,
  canAdd,
  onAdd,
  onRemove,
  renderControls,
  renderWidget,
}: Props) {
  return (
    <Box
      sx={(theme) => ({
        display: "grid",
        alignItems: "start",
        gap: { xs: 2, md: 2.5 },
        gridTemplateColumns: "minmax(0, 1fr)",
        [theme.breakpoints.up("md")]: { ...desktopGrid(styles), flexGrow: 1 },
      })}
    >
      {WIDGET_REGIONS.map((region) => {
        const { paddingTop, justifyContent } = regionSizing(region, styles);
        if (!editing && !layout[region].length) return null;
        return (
          <Stack
            key={region}
            component="section"
            aria-label={`${regionNames[region]} widgets`}
            spacing={2}
            useFlexGap
            sx={{
              minWidth: 0,
              gridArea: { md: region },
              alignSelf: { md: "stretch" },
              justifyContent: { md: justifyContent },
              pt: { md: `${paddingTop}px` },
            }}
          >
            {editing && (
              <Typography variant="overline" color="text.secondary">
                {regionNames[region]}
              </Typography>
            )}
            {layout[region].map((widget) => (
              <Box
                key={widget}
                sx={
                  editing
                    ? {
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: RADIUS.lg,
                        bgcolor: "background.paper",
                        p: 1.25,
                        minWidth: 0,
                      }
                    : { minWidth: 0, "&:empty": { display: "none" } }
                }
              >
                {editing && (
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.75}
                    useFlexGap
                    flexWrap="wrap"
                    sx={{ mb: 1.25 }}
                  >
                    <Typography variant="subtitle2" sx={{ mr: "auto" }}>
                      {widgetNames[widget]}
                    </Typography>
                    {renderControls(widget)}
                    <IconButton
                      id={`xenstart-remove-${widget}`}
                      aria-label={`Remove ${widgetNames[widget]} widget`}
                      onClick={() => onRemove(widget, region)}
                      disabled={saving}
                      size="small"
                    >
                      <RemoveCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                )}
                {renderWidget(widget, region)}
              </Box>
            ))}
            {editing && (
              <ButtonBase
                id={`xenstart-add-${region}`}
                aria-label={`Add widget to ${regionNames[region]}`}
                disabled={saving || !canAdd}
                onClick={() => onAdd(region)}
                sx={{
                  width: "100%",
                  minHeight: 76,
                  bgcolor: "background.paper",
                  color: "text.secondary",
                  border: "1px dashed",
                  borderColor: "divider",
                  borderRadius: RADIUS.lg,
                  "&:hover": { bgcolor: "action.hover" },
                  "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
                  "&.Mui-disabled": { opacity: 0.5 },
                }}
              >
                <AddIcon />
              </ButtonBase>
            )}
          </Stack>
        );
      })}
    </Box>
  );
}
