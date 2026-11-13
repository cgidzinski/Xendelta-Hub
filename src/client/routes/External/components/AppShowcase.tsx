import { Box, Card, Typography } from "@mui/material";
import { APP_GUIDE, GUIDE_APPS, type GuideApp } from "@shared/appGuide";
import { APPS_REGISTRY } from "../../../constants/apps";
import { cardSx } from "../../../components/ui/surfaceStyles";

/** The apps people can use, from the app list and the guide, so a new app shows up here without anyone editing this page. */
export function showcaseApps() {
  return APPS_REGISTRY.filter((a) => (GUIDE_APPS as readonly string[]).includes(a.key));
}

/** Every app as a card: its icon, its name and what it is for. */
export default function AppShowcase() {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
      }}
    >
      {showcaseApps().map((app) => (
        <Card
          key={app.key}
          variant="outlined"
          sx={{ ...cardSx, p: 2.5, display: "flex", flexDirection: "column", gap: 1 }}
        >
          <Box sx={{ color: "primary.main", display: "flex" }}>
            <app.icon />
          </Box>
          <Typography sx={{ fontWeight: 600 }}>{app.label}</Typography>
          <Typography variant="body2" color="text.secondary">
            {APP_GUIDE[app.key as GuideApp].about}
          </Typography>
        </Card>
      ))}
    </Box>
  );
}
