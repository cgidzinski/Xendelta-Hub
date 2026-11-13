import { Box, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { APPS_REGISTRY } from "../../../../constants/apps";
import AppTile from "./AppTile";

interface QuickPanelProps {
  pinnedApps: string[];
  /** Per sub-app: how many things are waiting (from the attention API). */
  counts: Record<string, number>;
}

/** The pinned apps as big, easy targets: three across on a phone, six on a desktop, as many rows as it takes. */
export default function QuickPanel({ pinnedApps, counts }: QuickPanelProps) {
  const navigate = useNavigate();
  const apps = pinnedApps.flatMap((key) => APPS_REGISTRY.filter((a) => a.key === key));

  if (apps.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        No apps pinned. Press Edit under All apps to choose the ones you want here.
      </Typography>
    );
  }

  return (
    <Box
      component="nav"
      aria-label="Pinned apps"
      sx={{
        display: "grid",
        gap: 1.25,
        gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", md: "repeat(6, minmax(0, 1fr))" },
      }}
    >
      {apps.map((app) => (
        <AppTile key={app.key} app={app} count={counts[app.key] ?? 0} onClick={() => navigate(app.path)} />
      ))}
    </Box>
  );
}
