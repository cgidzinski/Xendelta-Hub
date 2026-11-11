import PageContainer from "../../../components/ui/PageContainer";
import { Box, Typography } from "@mui/material";
import { useTitle } from "../../../hooks/useTitle";
import CompactHomeHeader from "./components/CompactHomeHeader";
import PinnedAppsSection from "./components/PinnedAppsSection";
import RecipaintCardBody from "./components/RecipaintCardBody";
import XenBoxCardBody from "./components/XenBoxCardBody";
import XenLinkCardBody from "./components/XenLinkCardBody";
import XenSplitCardBody from "./components/XenSplitCardBody";
import XenBudgetCardBody from "./components/XenBudgetCardBody";
import XenRoutineCardBody from "./components/XenRoutineCardBody";
import XenKitchenCardBody from "./components/XenKitchenCardBody";
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
    xenbudget: <XenBudgetCardBody />,
    xenroutine: <XenRoutineCardBody />,
    xenkitchen: <XenKitchenCardBody />,
  };

  return (
    <Box>
      <PageContainer width="wide">
        <CompactHomeHeader />
        <PinnedAppsSection
          pinnedApps={resolvePinnedApps(profile.pinnedApps)}
          appDetails={appDetails}
        />
      </PageContainer>
    </Box>
  );
}
