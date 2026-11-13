import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { APPS_REGISTRY, toggledPins } from "../../../../constants/apps";
import SectionLabel from "../../../../components/ui/SectionLabel";
import { usePinnedApps } from "../../../../hooks/user/usePinnedApps";
import AppTile from "./AppTile";

interface AllAppsProps {
  pinnedApps: string[];
  counts: Record<string, number>;
}

/**
 * Every app as a block, like the pinned ones. Tapping opens the app. Edit switches to choosing: tapping a block pins or unpins
 * it, with no limit on how many are pinned. Pinned apps are the tiles at the top of Home and the first group in the sidebar.
 */
export default function AllApps({ pinnedApps, counts }: AllAppsProps) {
  const navigate = useNavigate();
  const { setPinnedApps, isUpdating } = usePinnedApps();
  const [editing, setEditing] = useState(false);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <SectionLabel>All apps</SectionLabel>
        <Button size="small" onClick={() => setEditing((v) => !v)}>
          {editing ? "Done" : "Edit"}
        </Button>
      </Box>
      {editing && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
          Tap an app to pin it to the top of Home, or tap a pinned one to unpin it.
        </Typography>
      )}
      <Box
        sx={{
          display: "grid",
          gap: 1.25,
          gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", md: "repeat(6, minmax(0, 1fr))" },
        }}
      >
        {APPS_REGISTRY.map((app) => (
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
