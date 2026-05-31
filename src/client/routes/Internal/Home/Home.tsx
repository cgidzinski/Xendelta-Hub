import { Box, Container, Typography } from "@mui/material";
import { useTitle } from "../../../hooks/useTitle";
import TopStatsCards from "./components/TopStatsCards";
import PinnedAppsSection from "./components/PinnedAppsSection";
import RecipaintCardBody from "./components/RecipaintCardBody";
import XenBoxCardBody from "./components/XenBoxCardBody";
import XenLinkCardBody from "./components/XenLinkCardBody";
import XenSplitCardBody from "./components/XenSplitCardBody";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { usePinnedApps } from "../../../hooks/user/usePinnedApps";

export default function Home() {
  useTitle("Home");
  const { profile, isLoading, isError } = useUserProfile();
  const { togglePinnedApp, isUpdating } = usePinnedApps();

  if (isLoading) {
    return <Typography sx={{ mt: 8, textAlign: "center" }}>Loading...</Typography>;
  }
  if (isError || !profile) {
    return <Typography sx={{ mt: 8, textAlign: "center", color: "error.main" }}>Failed to load profile.</Typography>;
  }

  // App detail bodies for each pinned card
  const appDetails: Record<string, React.ReactNode> = {
    recipaint: <RecipaintCardBody />,
    xenbox: <XenBoxCardBody />,
    xenlink: <XenLinkCardBody />,
    xensplit: <XenSplitCardBody />,
  };

  return (
    <Box>
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            Welcome back, {profile.username}!
          </Typography>
        </Box>
        <TopStatsCards />
        <PinnedAppsSection
          pinnedApps={profile.pinnedApps}
          appDetails={appDetails}
        />
      </Container>
    </Box>
  );
}
