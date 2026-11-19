import { Box, Button, Card, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { APP_GUIDE, type GuideApp } from "@shared/appGuide";
import { BRAND_NAME } from "@shared/brand";
import { useAuth } from "../../../contexts/AuthContext";
import { APPS_REGISTRY } from "../../../constants/apps";
import { cardSx } from "../../../components/ui/surfaceStyles";
import { rememberReturnTo } from "../../../utils/returnTo";

/**
 * Shown at the bottom of a public page to someone who isn't signed in: what the app is, and a way in.
 * Signed-in visitors already know, so it renders nothing for them.
 */
export default function PublicJoinCard({ app }: { app: Exclude<GuideApp, "hub"> }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  if (isAuthenticated) return null;
  // After signing in or up, come back to the link they were looking at
  const goTo = (path: string) => {
    rememberReturnTo(`${window.location.pathname}${window.location.search}`);
    navigate(path);
  };
  const label = APPS_REGISTRY.find((a) => a.key === app)?.label ?? app;
  return (
    <Card variant="outlined" sx={{ ...cardSx, p: 3, mt: 4, textAlign: "center" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        {label} is part of {BRAND_NAME}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 520, mx: "auto" }}>
        {APP_GUIDE[app].about}
      </Typography>
      <Box>
        <Stack direction="row" spacing={1} justifyContent="center">
          <Button variant="contained" onClick={() => goTo("/signup")}>
            Sign up
          </Button>
          <Button onClick={() => goTo("/login")}>Sign in</Button>
        </Stack>
      </Box>
    </Card>
  );
}
