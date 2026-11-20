import type { ReactNode } from "react";
import { Box, ButtonBase, IconButton, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { WIDGET_REGIONS, type WidgetLayout, type WidgetRegion, type WidgetType } from "@shared/xenstart";
import { RADIUS } from "../../../theme";

export const widgetNames: Record<WidgetType, string> = {
  search: "Search",
  links: "Quick links",
  clock: "Clock",
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
  editing: boolean;
  saving: boolean;
  canAdd: boolean;
  onAdd: (region: WidgetRegion) => void;
  onEdit: (widget: WidgetType, region: WidgetRegion) => void;
  renderWidget: (widget: WidgetType, region: WidgetRegion) => ReactNode;
}

export default function WidgetBoard({ layout, editing, saving, canAdd, onAdd, onEdit, renderWidget }: Props) {
  const left = editing || layout.left.length > 0;
  const right = editing || layout.right.length > 0;
  const center = editing || layout.center.length > 0;
  const middle = [
    ...(left ? [["left", "minmax(0, 1fr)"]] : []),
    ...(center ? [["center", "minmax(0, 2.5fr)"]] : []),
    ...(right ? [["right", "minmax(0, 1fr)"]] : []),
  ];
  const edges = (["top", "bottom"] as const).filter((region) => editing || layout[region].length > 0);
  const areas = [
    ...(edges.includes("top") ? ['"' + middle.map(() => "top").join(" ") + '"'] : []),
    '"' + middle.map(([name]) => name).join(" ") + '"',
    ...(edges.includes("bottom") ? ['"' + middle.map(() => "bottom").join(" ") + '"'] : []),
  ];
  const template = middle.length ? areas.join(" ") : edges.map((region) => `"${region}"`).join(" ");

  return (
    <Box
      sx={{
        display: "grid",
        alignItems: "start",
        gap: { xs: 2, md: 2.5 },
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          md: middle.map(([, width]) => width).join(" ") || "minmax(0, 1fr)",
        },
        gridTemplateAreas: { md: template || undefined },
        mx: "auto",
        maxWidth: left || right ? 1280 : 800,
      }}
    >
      {WIDGET_REGIONS.map((region) => {
        if (!editing && !layout[region].length) return null;
        return (
          <Stack
            key={region}
            component="section"
            aria-label={`${regionNames[region]} widgets`}
            spacing={2}
            sx={{ minWidth: 0, gridArea: { md: region } }}
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
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">{widgetNames[widget]}</Typography>
                    <IconButton
                      id={`xenstart-edit-${widget}`}
                      aria-label={`Edit ${widgetNames[widget]} widget`}
                      onClick={() => onEdit(widget, region)}
                      disabled={saving}
                    >
                      <EditOutlinedIcon fontSize="small" />
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
