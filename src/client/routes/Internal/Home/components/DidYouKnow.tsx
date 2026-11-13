import { Box, Button, Stack, Typography } from "@mui/material";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import { useNavigate } from "react-router-dom";
import { pickTips, type GuideApp } from "@shared/appGuide";
import { APPS_REGISTRY } from "../../../../constants/apps";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Ideas for what to try, shown when the activity feed has nothing in it. The same three for a whole day (so they don't jump
 * around), different ones tomorrow. With an app filter on, tips for just that app.
 */
export default function DidYouKnow({ app }: { app?: string }) {
  const navigate = useNavigate();
  const known = APPS_REGISTRY.some((a) => a.key === app) ? (app as GuideApp) : undefined;
  const tips = pickTips(today(), 3, known);
  if (tips.length === 0) return null;
  return (
    <Box sx={{ px: 2, pb: 2.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <LightbulbOutlinedIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2">Did you know?</Typography>
      </Stack>
      <Stack spacing={1.25}>
        {tips.map((tip) => (
          <Typography key={`${tip.app}:${tip.text}`} variant="body2" color="text.secondary">
            {tip.text}
            {tip.link && (
              <Button size="small" onClick={() => navigate(tip.link!)} sx={{ ml: 0.5, minWidth: 0 }}>
                Try it
              </Button>
            )}
          </Typography>
        ))}
      </Stack>
      <Button size="small" onClick={() => navigate("/internal/whats-new")} sx={{ mt: 1.5 }}>
        See all apps and what's new
      </Button>
    </Box>
  );
}
