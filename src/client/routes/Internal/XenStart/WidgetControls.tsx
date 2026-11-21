import { TextField, Typography } from "@mui/material";
import {
  CLOCK_FORMATS,
  GRID_DIMENSION_LIMIT,
  quickLinkSlots,
  SEARCH_ENGINES,
  WIDGET_SIZES,
  type WidgetType,
  type XenStartConfig,
} from "@shared/xenstart";

const dimensions = Array.from({ length: GRID_DIMENSION_LIMIT }, (_, index) => index + 1);
const sizeLabels = { small: "Small", medium: "Medium", large: "Large" };
const formatLabels = { locale: "Device default", "12-hour": "12-hour", "24-hour": "24-hour" };

function Control<T extends string | number>({
  label,
  value,
  options,
  labels,
  saving,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels?: Record<T, string>;
  saving: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      disabled={saving}
      sx={{ minWidth: 65 }}
      slotProps={{ select: { native: true } }}
      onChange={(event) => {
        const next = options.find((option) => String(option) === event.target.value);
        if (next !== undefined) onChange(next);
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] ?? option}
        </option>
      ))}
    </TextField>
  );
}

export default function WidgetControls({
  widget,
  config,
  saving,
  update,
}: {
  widget: WidgetType;
  config: XenStartConfig;
  saving: boolean;
  update: (apply: (latest: XenStartConfig) => XenStartConfig) => void;
}) {
  if (widget === "search")
    return (
      <Control
        label="Engine"
        value={config.engine}
        options={SEARCH_ENGINES}
        saving={saving}
        onChange={(engine) => update((latest) => ({ ...latest, engine }))}
      />
    );
  if (widget === "clock")
    return (
      <>
        <Control
          label="Format"
          value={config.clockFormat ?? "locale"}
          options={CLOCK_FORMATS}
          labels={formatLabels}
          saving={saving}
          onChange={(clockFormat) => update((latest) => ({ ...latest, clockFormat }))}
        />
        <Control
          label="Clock size"
          value={config.clockSize ?? "medium"}
          options={WIDGET_SIZES}
          labels={sizeLabels}
          saving={saving}
          onChange={(clockSize) => update((latest) => ({ ...latest, clockSize }))}
        />
      </>
    );
  if (widget !== "links") return null;

  const { columns, rows } = config.appearance;
  const hidden = quickLinkSlots(config.links)
    .slice(rows * columns)
    .filter(Boolean).length;
  return (
    <>
      <Control
        label="Columns"
        value={columns}
        options={dimensions}
        saving={saving}
        onChange={(columns) => update((latest) => ({ ...latest, appearance: { ...latest.appearance, columns } }))}
      />
      <Control
        label="Rows"
        value={rows}
        options={dimensions}
        saving={saving}
        onChange={(rows) => update((latest) => ({ ...latest, appearance: { ...latest.appearance, rows } }))}
      />
      <Control
        label="Tile size"
        value={config.linkTileSize ?? "medium"}
        options={WIDGET_SIZES}
        labels={sizeLabels}
        saving={saving}
        onChange={(linkTileSize) => update((latest) => ({ ...latest, linkTileSize }))}
      />
      {hidden > 0 && (
        <Typography variant="caption" color="text.secondary">
          {hidden} hidden
        </Typography>
      )}
    </>
  );
}
