import { useState } from "react";
import { Box, Button, ButtonBase, MenuItem, Slider, Stack, TextField, Typography } from "@mui/material";
import {
  CENTER_REGIONS,
  MAX_REGION_PADDING,
  REGION_ALIGNMENTS,
  REGION_HEIGHT_SHARES,
  REGION_PADDING_STEP,
  WIDGET_REGIONS,
  regionStyle,
  withRegionStyle,
  type RegionStyle,
  type RegionStyles,
  type WidgetRegion,
} from "@shared/xenstart";
import { RADIUS } from "../../../theme";
import { desktopGrid, regionSizing } from "./regionLayout";
import { regionNames } from "./WidgetBoard";

const alignmentLabels = { start: "Top", center: "Center", end: "Bottom" };

interface Props {
  styles: RegionStyles;
  onChange: (styles: RegionStyles) => void;
  saving: boolean;
}

export default function RegionLayoutSettings({ styles, onChange, saving }: Props) {
  const [selected, setSelected] = useState<WidgetRegion>("center");
  const style = regionStyle(selected, styles);
  const apply = (change: Partial<RegionStyle>) => onChange(withRegionStyle(styles, selected, { ...style, ...change }));

  return (
    <Stack spacing={2}>
      <Box
        role="group"
        aria-label="Desktop layout preview"
        sx={{ display: "grid", ...desktopGrid(styles), height: 160, gap: 0.5 }}
      >
        {WIDGET_REGIONS.map((region) => {
          const { justifyContent, paddingTop } = regionSizing(region, styles);
          return (
            <ButtonBase
              key={region}
              aria-pressed={selected === region}
              onClick={() => setSelected(region)}
              sx={{
                gridArea: region,
                flexDirection: "column",
                minWidth: 0,
                justifyContent,
                pt: `${paddingTop / 8}px`,
                border: "1px solid",
                borderColor: selected === region ? "primary.main" : "divider",
                borderRadius: RADIUS.md,
                color: selected === region ? "primary.main" : "text.secondary",
                bgcolor: selected === region ? "action.selected" : "background.paper",
                "&:hover": { bgcolor: "action.hover" },
                "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main" },
              }}
            >
              <Typography variant="caption">{regionNames[region]}</Typography>
            </ButtonBase>
          );
        })}
      </Box>
      <Stack>
        <Typography variant="subtitle2">{regionNames[selected]} region</Typography>
        <Typography variant="caption" color="text.secondary">
          The desktop layout updates as you make changes. Save settings to keep them.
        </Typography>
      </Stack>
      {(CENTER_REGIONS as readonly WidgetRegion[]).includes(selected) && (
        <TextField
          select
          size="small"
          label="Height"
          helperText="Auto fits the content. Shares divide the available height."
          value={style.height === null ? "auto" : String(style.height)}
          disabled={saving}
          onChange={(event) => {
            const next = REGION_HEIGHT_SHARES.find((share) => String(share) === event.target.value);
            apply({ height: next ?? null });
          }}
        >
          <MenuItem value="auto">Auto</MenuItem>
          {REGION_HEIGHT_SHARES.map((share) => (
            <MenuItem key={share} value={String(share)}>
              {share} {share === 1 ? "share" : "shares"}
            </MenuItem>
          ))}
        </TextField>
      )}
      <TextField
        select
        size="small"
        label="Vertical alignment"
        value={style.alignment}
        disabled={saving}
        onChange={(event) => {
          const alignment = REGION_ALIGNMENTS.find((option) => option === event.target.value);
          if (alignment) apply({ alignment });
        }}
      >
        {REGION_ALIGNMENTS.map((option) => (
          <MenuItem key={option} value={option}>
            {alignmentLabels[option]}
          </MenuItem>
        ))}
      </TextField>
      <Box>
        <Typography id="xenstart-region-padding" variant="body2">
          Top padding · {style.paddingTop} px
        </Typography>
        <Slider
          aria-labelledby="xenstart-region-padding"
          getAriaValueText={(value) => `${value} pixels`}
          value={style.paddingTop}
          step={REGION_PADDING_STEP}
          min={0}
          max={MAX_REGION_PADDING}
          disabled={saving}
          onChange={(_, value) => {
            if (typeof value === "number") apply({ paddingTop: value });
          }}
        />
      </Box>
      <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap">
        <Button disabled={saving || !styles[selected]} onClick={() => onChange(withRegionStyle(styles, selected, {}))}>
          Reset region
        </Button>
        <Button disabled={saving || !Object.keys(styles).length} onClick={() => onChange({})}>
          Reset layout
        </Button>
      </Stack>
    </Stack>
  );
}
