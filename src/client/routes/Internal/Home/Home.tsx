import PageContainer from "../../../components/ui/PageContainer";
import { Box, Typography } from "@mui/material";
import { useTitle } from "../../../hooks/useTitle";
import CompactHomeHeader from "./components/CompactHomeHeader";
import QuickPanel from "./components/QuickPanel";
import AttentionStrip from "./components/AttentionStrip";
import ActivityFeed from "./components/ActivityFeed";
import HomeLinks from "./components/HomeLinks";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { useAttention } from "../../../hooks/feed/useFeed";
import { resolvePinnedApps } from "../../../constants/apps";

/** Home is a feed: pinned apps to jump into, what needs the person now, then what happened in their spaces. */
export default function Home() {
  useTitle("Home");
  const { profile, isLoading, isError } = useUserProfile();
  const attention = useAttention();

  if (isLoading) {
    return <Typography sx={{ mt: 8, textAlign: "center" }}>Loading...</Typography>;
  }
  if (isError || !profile) {
    return <Typography sx={{ mt: 8, textAlign: "center", color: "error.main" }}>Failed to load profile.</Typography>;
  }

  return (
    <PageContainer width="default">
      <CompactHomeHeader />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <QuickPanel
          pinnedApps={resolvePinnedApps(profile.pinnedApps)}
          counts={attention.data?.counts ?? {}}
          totals={attention.data?.totals ?? {}}
        />
        <AttentionStrip cards={attention.data?.cards ?? []} />
        <ActivityFeed />
        <HomeLinks />
      </Box>
    </PageContainer>
  );
}
