import { Box, Container, Typography } from "@mui/material";
import { useTitle } from "../../../hooks/useTitle";
import CompactHomeHeader from "./components/CompactHomeHeader";
import PinnedAppsSection from "./components/PinnedAppsSection";
import RecipaintCardBody from "./components/RecipaintCardBody";
import XenBoxCardBody from "./components/XenBoxCardBody";
import XenLinkCardBody from "./components/XenLinkCardBody";
import XenSplitCardBody from "./components/XenSplitCardBody";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { usePinnedApps } from "../../../hooks/user/usePinnedApps";
import { resolvePinnedApps } from "../../../constants/apps";

export default function Home() {
  useTitle("Home");
  const { profile, isLoading, isError } = useUserProfile();
  const { togglePinnedApp: _togglePinnedApp, isUpdating: _isUpdating } = usePinnedApps();

  if (isLoading) {
    return <Typography sx={{ mt: 8, textAlign: "center" }}>Loading...</Typography>;
  }
  if (isError || !profile) {
    return <Typography sx={{ mt: 8, textAlign: "center", color: "error.main" }}>Failed to load profile.</Typography>;
  }

  const appDetails: Record<string, React.ReactNode> = {
    recipaint: <RecipaintCardBody />,
    xenbox: <XenBoxCardBody />,
    xenlink: <XenLinkCardBody />,
    xensplit: <XenSplitCardBody />,
  };

  return (
    <Box>
      <Container maxWidth="xl" sx={{ mt: 3 }}>
        <CompactHomeHeader />
        <PinnedAppsSection
          pinnedApps={resolvePinnedApps(profile.pinnedApps)}
          appDetails={appDetails}
        />
      </Container>
    </Box>
  );
}
