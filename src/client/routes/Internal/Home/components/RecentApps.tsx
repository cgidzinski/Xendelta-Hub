import { Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { APPS_REGISTRY } from "../../../../constants/apps";
import SectionLabel from "../../../../components/ui/SectionLabel";
import { readRecentApps } from "../../../../utils/recentApps";
import AppTile from "./AppTile";

const gridSx = {
  display: "grid",
  gap: 1.25,
  gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", md: "repeat(6, minmax(0, 1fr))" },
} as const;

/** The apps opened most recently on this device that are not already pinned, so the way back into them is one tap. */
export default function RecentApps({ pinnedApps }: { pinnedApps: string[] }) {
  const navigate = useNavigate();
  const apps = readRecentApps()
    .filter((key) => !pinnedApps.includes(key))
    .flatMap((key) => APPS_REGISTRY.filter((a) => a.key === key))
    .slice(0, 3);
  if (apps.length === 0) return null;
  return (
    <Box>
      <SectionLabel>Recently opened</SectionLabel>
      <Box component="nav" aria-label="Recently opened apps" sx={{ ...gridSx, mt: 0.5 }}>
        {apps.map((app) => (
          <AppTile key={app.key} app={app} onClick={() => navigate(app.path)} />
        ))}
      </Box>
    </Box>
  );
}
