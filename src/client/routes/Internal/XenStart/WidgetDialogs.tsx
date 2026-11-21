import { Alert, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import type { WidgetRegion, WidgetType } from "@shared/xenstart";
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
