import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { APPS_REGISTRY, toggledPins } from "../../../../constants/apps";
import SectionLabel from "../../../../components/ui/SectionLabel";
import { usePinnedApps } from "../../../../hooks/user/usePinnedApps";
import AppTile from "./AppTile";

interface QuickPanelProps {
  pinnedApps: string[];
  /** Per sub-app: how many things are waiting (from the attention API). */
  counts: Record<string, number>;
}

const gridSx = {
  display: "grid",
  gap: 1.25,
  gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", md: "repeat(6, minmax(0, 1fr))" },
} as const;

/**
 * The pinned apps as big, easy targets (three across on a phone, six on a desktop, as many rows as it takes), under a header
 * with an Edit button. Edit swaps the tiles for every app, each a toggle that pins or unpins it; Done goes back to just the
 * pinned ones. There is no limit on how many are pinned. With none pinned the app shows its default two.
 */
export default function QuickPanel({ pinnedApps, counts }: QuickPanelProps) {
  const navigate = useNavigate();
  const { setPinnedApps, isUpdating } = usePinnedApps();
  const [editing, setEditing] = useState(false);

  const shown = editing ? APPS_REGISTRY : pinnedApps.flatMap((key) => APPS_REGISTRY.filter((a) => a.key === key));

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <SectionLabel>Pinned apps</SectionLabel>
        <Button size="small" onClick={() => setEditing((v) => !v)}>
          {editing ? "Done" : "Edit"}
        </Button>
      </Box>
      {editing && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
          Tap an app to pin it, or tap a pinned one to unpin it.
        </Typography>
      )}
      <Box component="nav" aria-label={editing ? "Choose pinned apps" : "Pinned apps"} sx={gridSx}>
        {shown.map((app) => (
          <AppTile
            key={app.key}
            app={app}
            count={counts[app.key] ?? 0}
            onClick={() => (editing ? void setPinnedApps(toggledPins(pinnedApps, app.key)) : navigate(app.path))}
            pinChoice={editing ? { pinned: pinnedApps.includes(app.key), disabled: isUpdating } : undefined}
          />
        ))}
      </Box>
    </Box>
  );
}
