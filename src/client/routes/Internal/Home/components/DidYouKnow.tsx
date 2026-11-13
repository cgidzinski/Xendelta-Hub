import { Box, Button, Card, Stack, Typography } from "@mui/material";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import { useNavigate } from "react-router-dom";
import { pickTips, type GuideApp } from "@shared/appGuide";
import { APPS_REGISTRY } from "../../../../constants/apps";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import SectionLabel from "../../../../components/ui/SectionLabel";
import { useUsedApps } from "../../../../hooks/feed/useFeed";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Ideas shown when the activity feed has nothing in it: one card per tip. They invite people to apps they don't use yet, and
 * only teach tricks for apps they do use. The same three for a whole day (so they don't jump around), different ones tomorrow.
 * With an app filter on, just that app.
 */
export default function DidYouKnow({ app }: { app?: string }) {
  const navigate = useNavigate();
  const known = APPS_REGISTRY.some((a) => a.key === app) ? (app as GuideApp) : undefined;
  const usage = useUsedApps();
  // Wait until we know which apps they use, so the first thing shown isn't a tip they'd never have been given.
  if (!usage.data) return null;
  const tips = pickTips(today(), 3, { used: usage.data, app: known });
  if (tips.length === 0) return null;
  return (
    <Box sx={{ mt: 2 }}>
      <SectionLabel>Did you know?</SectionLabel>
      <Stack spacing={1.25}>
        {tips.map((tip) => (
          <Card key={`${tip.app}:${tip.text}`} variant="outlined" sx={{ ...cardSx, p: 1.75 }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <LightbulbOutlinedIcon fontSize="small" color="primary" sx={{ mt: 0.25 }} />
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                {tip.text}
              </Typography>
              {tip.link && (
                <Button size="small" onClick={() => navigate(tip.link!)} sx={{ flexShrink: 0 }}>
                  {tip.kind === "try" ? "Open" : "Try it"}
                </Button>
              )}
            </Stack>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
