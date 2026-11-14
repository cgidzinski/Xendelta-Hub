import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, Drawer, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import { useTitle } from "../../../hooks/useTitle";
import { useVisualViewport } from "../../../hooks/useVisualViewport";
import {
  useChannels,
  useCommunities,
  useCommunity,
  useMyCommunityInvites,
} from "../../../hooks/communities/useCommunities";
import { firstChannel, unreadChannelCount } from "../../../utils/communityChat";
import EmptyState from "../../../components/ui/EmptyState";
import { chatShellStyle } from "../Messages/chatLayout";
import ChannelSidebar from "./components/ChannelSidebar";
import CommunityInvitesDialog from "./components/CommunityInvitesDialog";
import CommunityRail from "./components/CommunityRail";
import CreateChannelDialog from "./components/CreateChannelDialog";
import CreateCommunityDialog from "./components/CreateCommunityDialog";
import MembersPanel from "./components/MembersPanel";
import ChannelView from "./ChannelView";
import { communityPath } from "./communityUi";

/**
 * Communities: the rail of communities, the open community's channels, one channel and its people. On a computer they
 * sit side by side; on a phone one shows at a time, and the rail and channels share a screen (the "drawer").
 *   /internal/communities                        the first community
 *   /internal/communities/:communityId           its channels (a phone) or its first channel (a computer)
 *   /internal/communities/:communityId/:channelId  a channel
 */
export default function Communities() {
  const { communityId, channelId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const viewport = useVisualViewport();
  const landscape = useMediaQuery("(orientation: landscape)");

  const communitiesQuery = useCommunities();
  const communities = useMemo(() => communitiesQuery.data ?? [], [communitiesQuery.data]);
  const inviteCount = (useMyCommunityInvites().data ?? []).length;
  const communityQuery = useCommunity(communityId);
  const channelsQuery = useChannels(communityId);
  const community = communityQuery.data;
  const channels = useMemo(() => channelsQuery.data ?? [], [channelsQuery.data]);
  const channel = channels.find((c) => c._id === channelId);

  useTitle(community?.name ?? "Communities");

  const [createOpen, setCreateOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [addChannel, setAddChannel] = useState<{ category: string } | undefined>();
  const [membersOpen, setMembersOpen] = useState(true);
  const [membersDrawer, setMembersDrawer] = useState(false);

  // On a phone the screen is pinned to the visible area (see chatLayout.ts), so the page behind it must not scroll.
  useEffect(() => {
    if (!phone) return;
    const html = document.documentElement;
    const body = document.body;
    const before = [html.style.overflow, body.style.overflow];
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      [html.style.overflow, body.style.overflow] = before;
    };
  }, [phone]);

  // No community in the address: open the first one.
  useEffect(() => {
    if (!communityId && communities.length > 0) navigate(communityPath(communities[0]!._id), { replace: true });
  }, [communityId, communities, navigate]);

  // A community you are no longer in (left, removed, deleted): back to the list.
  useEffect(() => {
    if (communityId && communitiesQuery.isSuccess && !communities.some((c) => c._id === communityId)) {
      navigate("/internal/communities", { replace: true });
    }
  }, [communityId, communitiesQuery.isSuccess, communities, navigate]);

  // A computer shows a channel next to the list, so a community opens on its first unread (else first) channel.
  useEffect(() => {
    if (phone || !communityId || channelId || !channelsQuery.isSuccess) return;
    const first = firstChannel(channels);
    if (first) navigate(communityPath(communityId, first._id), { replace: true });
  }, [phone, communityId, channelId, channelsQuery.isSuccess, channels, navigate]);

  // A channel that has gone (deleted, or closed to you): back to the community.
  useEffect(() => {
    if (communityId && channelId && channelsQuery.isSuccess && !channel) {
      navigate(communityPath(communityId), { replace: true });
    }
  }, [communityId, channelId, channelsQuery.isSuccess, channel, navigate]);

  const openCommunity = (id: string) => navigate(communityPath(id));
  const openChannel = (id: string) => navigate(communityPath(communityId, id));
  const showDrawerScreen = phone && !channelId;
  const otherUnread = unreadChannelCount(channels.filter((c) => c._id !== channelId)) > 0;

  const rail = (compact: boolean) => (
    <CommunityRail
      communities={communities}
      selectedId={communityId}
      inviteCount={inviteCount}
      compact={compact}
      onSelect={openCommunity}
      onMessages={() => navigate("/internal/messages")}
      onInvites={() => setInvitesOpen(true)}
      onCreate={() => setCreateOpen(true)}
    />
  );

  const sidebar = community ? (
    <ChannelSidebar
      community={community}
      channels={channels}
      selectedId={channelId}
      onSelect={openChannel}
      onAddChannel={(category) => setAddChannel({ category })}
    />
  ) : null;

  const noCommunities = communitiesQuery.isSuccess && communities.length === 0;
  const unavailable = !!communityId && communityQuery.isError;

  let main;
  if (noCommunities) {
    main = (
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}>
        <EmptyState
          icon={<GroupsOutlinedIcon />}
          title="No communities yet"
          description="Make one for your group, or wait for an invitation."
          action={
            <Button variant="contained" onClick={() => setCreateOpen(true)}>
              Create a community
            </Button>
          }
        />
      </Box>
    );
  } else if (unavailable) {
    main = (
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}>
        <EmptyState
          title="This community isn't available"
          description="It may have been deleted, or you may no longer be in it."
          action={<Button onClick={() => navigate("/internal/communities")}>Back to communities</Button>}
        />
      </Box>
    );
  } else if (community && channel) {
    main = (
      <ChannelView
        key={channel._id}
        community={community}
        channel={channel}
        phone={phone}
        onOpenDrawer={() => navigate(communityPath(communityId))}
        otherUnread={otherUnread}
        membersOpen={membersOpen}
        onToggleMembers={() => (phone ? setMembersDrawer(true) : setMembersOpen((v) => !v))}
      />
    );
  } else {
    main = (
      <Box
        sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}
        aria-busy={!channelsQuery.isError && !channelsQuery.isSuccess}
      >
        {channelsQuery.isSuccess && channels.length === 0 && (
          <EmptyState
            title="No channels you can see"
            description="Ask someone who runs this community to open one up."
          />
        )}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        ...chatShellStyle({
          phone,
          inThread: phone && !!channelId,
          viewport,
          landscape,
          zIndex: theme.zIndex.modal - 10,
        }),
      }}
    >
      {showDrawerScreen ? (
        <>
          {rail(true)}
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", bgcolor: "background.paper" }}>
            {sidebar ?? <Box sx={{ flex: 1 }} aria-busy={communityQuery.isLoading} />}
          </Box>
        </>
      ) : (
        <>
          {!phone && rail(false)}
          {!phone && sidebar && (
            <Box
              sx={{
                width: 240,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                borderRight: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                minHeight: 0,
              }}
            >
              {sidebar}
            </Box>
          )}
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", bgcolor: "background.paper" }}>{main}</Box>
          {!phone && community && channel && membersOpen && (
            <Box
              sx={{
                width: 220,
                flexShrink: 0,
                borderLeft: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                minHeight: 0,
              }}
            >
              <MembersPanel community={community} />
            </Box>
          )}
        </>
      )}

      {phone && community && (
        <Drawer
          anchor="right"
          open={membersDrawer}
          onClose={() => setMembersDrawer(false)}
          slotProps={{ paper: { sx: { width: 280 } } }}
        >
          <MembersPanel community={community} />
        </Drawer>
      )}

      <CreateCommunityDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          openCommunity(id);
        }}
      />
      <CommunityInvitesDialog
        open={invitesOpen}
        onClose={() => setInvitesOpen(false)}
        onJoined={(id) => {
          setInvitesOpen(false);
          openCommunity(id);
        }}
      />
      {community && (
        <CreateChannelDialog
          open={!!addChannel}
          onClose={() => setAddChannel(undefined)}
          communityId={community._id}
          categories={[...new Set(channels.map((c) => c.category).filter(Boolean))]}
          initialCategory={addChannel?.category ?? ""}
          onCreated={(id) => {
            setAddChannel(undefined);
            openChannel(id);
          }}
        />
      )}
    </Box>
  );
}
