import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Avatar, Button, Tab, Tabs } from "@mui/material";
import { useTitle } from "../../../../hooks/useTitle";
import { useChannels, useCommunity } from "../../../../hooks/communities/useCommunities";
import PageContainer from "../../../../components/ui/PageContainer";
import DetailHeader from "../../../../components/ui/DetailHeader";
import EmptyState from "../../../../components/ui/EmptyState";
import { RADIUS } from "../../../../theme";
import { communityPath, initialsOf, settingsTabs } from "../communityUi";
import ChannelsTab from "./ChannelsTab";
import MembersTab from "./MembersTab";
import OverviewTab from "./OverviewTab";
import RolesTab from "./RolesTab";

/**
 * A community's settings: overview, channels, roles and members. Each tab shows only to people who can use it.
 *   /internal/communities/:communityId/settings/:tab
 */
export default function CommunitySettings() {
  const { communityId, tab } = useParams();
  const navigate = useNavigate();
  const communityQuery = useCommunity(communityId);
  const channelsQuery = useChannels(communityId);
  const community = communityQuery.data;
  useTitle(community ? `${community.name} settings` : "Community settings");

  const tabs = community ? settingsTabs(community) : [];
  const current = tabs.find((t) => t.key === tab)?.key ?? "overview";

  // An address for a tab you can't open (or no tab) settles on one you can.
  useEffect(() => {
    if (community && tab !== current) navigate(`${communityPath(communityId)}/settings/${current}`, { replace: true });
  }, [community, tab, current, communityId, navigate]);

  if (communityQuery.isError) {
    return (
      <PageContainer width="narrow">
        <EmptyState
          title="This community isn't available"
          description="It may have been deleted, or you may no longer be in it."
          action={<Button onClick={() => navigate("/internal/communities")}>Back to communities</Button>}
        />
      </PageContainer>
    );
  }
  if (!community || !communityId)
    return (
      <PageContainer width="narrow">
        <div aria-busy />
      </PageContainer>
    );

  const channels = channelsQuery.data ?? [];
  return (
    <PageContainer width="narrow">
      <DetailHeader
        title={community.name}
        subtitle="Community settings"
        leading={
          <Avatar variant="rounded" sx={{ width: 40, height: 40, borderRadius: RADIUS.xl, fontWeight: 600 }}>
            {initialsOf(community.name)}
          </Avatar>
        }
        onBack={() => navigate(communityPath(communityId))}
        backLabel="Back to the community"
        tabs={
          <Tabs
            value={current}
            onChange={(_e, value: string) => navigate(`${communityPath(communityId)}/settings/${value}`)}
            variant="scrollable"
            scrollButtons={false}
          >
            {tabs.map((t) => (
              <Tab key={t.key} value={t.key} label={t.label} />
            ))}
          </Tabs>
        }
      />
      {current === "overview" && <OverviewTab community={community} />}
      {current === "channels" && <ChannelsTab community={community} channels={channels} />}
      {current === "roles" && <RolesTab community={community} />}
      {current === "members" && <MembersTab community={community} />}
    </PageContainer>
  );
}
