import { useState } from "react";
import {
  Alert,
  Button,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  GRID_DIMENSION_LIMIT,
  SEARCH_ENGINES,
  type SearchEngine,
  type WidgetRegion,
  type WidgetType,
  type XenStartConfig,
} from "@shared/xenstart";
import ResponsiveDialog from "../../../components/ui/ResponsiveDialog";
import { regionNames, widgetNames } from "./WidgetBoard";

interface DialogProps {
  error: string;
  saving: boolean;
  onClose: () => void;
}

export function WidgetPicker({
  region,
  available,
  error,
  saving,
  onClose,
  onAdd,
}: DialogProps & {
  region: WidgetRegion;
  available: WidgetType[];
  onAdd: (widget: WidgetType) => void;
}) {
  return (
    <ResponsiveDialog open title={`Add widget to ${regionNames[region]}`} maxWidth="xs" onClose={onClose}>
      {error && <Alert severity="error">{error}</Alert>}
      {available.length ? (
        <List disablePadding>
          {available.map((widget) => (
            <ListItemButton key={widget} disabled={saving} onClick={() => onAdd(widget)}>
              <ListItemText primary={widgetNames[widget]} />
            </ListItemButton>
          ))}
        </List>
      ) : (
        <Typography variant="body2">All widgets are already on the page.</Typography>
      )}
    </ResponsiveDialog>
  );
}

export interface WidgetPreferences {
  engine: SearchEngine;
  rows: number;
  columns: number;
}

export function WidgetSettings({
  widget,
  config,
  linkCount,
  error,
  saving,
  onClose,
  onRemove,
  onSave,
}: DialogProps & {
  widget: WidgetType;
  config: XenStartConfig;
  linkCount: number;
  onRemove: () => void;
  onSave: (preferences: WidgetPreferences) => void;
}) {
  const [engine, setEngine] = useState(config.engine);
  const [rows, setRows] = useState(config.appearance.rows);
  const [columns, setColumns] = useState(config.appearance.columns);
  const slots = rows * columns;
  const hiddenCount = Math.max(0, linkCount - slots);
  const hasPreferences = widget === "search" || widget === "links";

  return (
    <ResponsiveDialog
      open
      maxWidth="xs"
      title={`${widgetNames[widget]} settings`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onRemove} disabled={saving} sx={{ mr: "auto" }}>
            Remove from page
          </Button>
          <Button onClick={onClose}>{hasPreferences ? "Cancel" : "Done"}</Button>
          {hasPreferences && (
            <Button type="submit" form="xenstart-widget-settings" variant="contained" disabled={saving}>
              Save settings
            </Button>
          )}
        </>
      }
    >
      <Stack
        component="form"
        id="xenstart-widget-settings"
        spacing={2}
        sx={{ pt: 1 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving && hasPreferences) onSave({ engine, rows, columns });
        }}
      >
        {error && <Alert severity="error">{error}</Alert>}
        {widget === "search" && (
          <TextField
            select
            label="Search engine"
            value={engine}
            disabled={saving}
            onChange={(event) => setEngine(event.target.value as SearchEngine)}
          >
            {SEARCH_ENGINES.map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </TextField>
        )}
        {widget === "links" && (
          <>
            <Stack direction="row" spacing={2}>
              {[
                { label: "Rows", value: rows, change: setRows },
                { label: "Columns", value: columns, change: setColumns },
              ].map(({ label, value, change }) => (
                <TextField
                  key={label}
                  select
                  fullWidth
                  label={label}
                  value={value}
                  disabled={saving}
                  onChange={(event) => change(Number(event.target.value))}
                >
                  {Array.from({ length: GRID_DIMENSION_LIMIT }, (_, index) => index + 1).map((count) => (
                    <MenuItem key={count} value={count}>
                      {count}
                    </MenuItem>
                  ))}
                </TextField>
              ))}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {hiddenCount
                ? `${slots} visible slots. ${hiddenCount} saved ${hiddenCount === 1 ? "link stays" : "links stay"} hidden until there’s room again.`
                : `${slots} slots. Tiles wrap into fewer columns in narrow regions.`}
            </Typography>
          </>
        )}
        {!hasPreferences && (
          <Typography variant="body2" color="text.secondary">
            You can add this widget to any region after removing it from the page.
          </Typography>
        )}
      </Stack>
    </ResponsiveDialog>
  );
}
