import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Box, Button, Drawer, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { useTitle } from "../../../hooks/useTitle";
import { useVisualViewport } from "../../../hooks/useVisualViewport";
import {
  useChannels,
  useCommunities,
  useCommunity,
  useMyCommunityInvites,
} from "../../../hooks/communities/useCommunities";
import { firstChannel, unreadChannelCount } from "../../../utils/communityChat";
import { rememberChatPlace } from "../../../utils/chatLastPlace";
import { useChatUnread, useConversations } from "../../../hooks/chat/useChat";
import { useAuth } from "../../../contexts/AuthContext";
import EmptyState from "../../../components/ui/EmptyState";
import { chatShellStyle } from "../Messages/chatLayout";
import ConversationList from "../Messages/components/ConversationList";
import NewChatDialog from "../Messages/components/NewChatDialog";
import Thread from "../Messages/Thread";
import ChannelSidebar from "../Communities/components/ChannelSidebar";
import CommunityInvitesDialog from "../Communities/components/CommunityInvitesDialog";
import CommunityRail from "../Communities/components/CommunityRail";
import CreateChannelDialog from "../Communities/components/CreateChannelDialog";
import CreateCommunityDialog from "../Communities/components/CreateCommunityDialog";
import MembersPanel from "../Communities/components/MembersPanel";
import InvitePeopleDialog from "../Communities/settings/InvitePeopleDialog";
import ChannelView from "../Communities/ChannelView";
import { communityPath } from "../Communities/communityUi";

/**
 * Chat: the rail (direct messages, then each community), the list beside it (your DMs and group chats, or the open
 * community's channels), and the open conversation or channel with its people. On a computer they sit side by side; on a
 * phone one shows at a time, and the rail and list share a screen (the "drawer").
 *   /internal/messages                              direct messages: the list
 *   /internal/messages/:conversationId              a DM or group chat
 *   /internal/communities                           the first community
 *   /internal/communities/:communityId              its channels (a phone) or its first channel (a computer)
 *   /internal/communities/:communityId/:channelId   a channel
 */
export default function Chat() {
  const { communityId, channelId, conversationId } = useParams();
  const { pathname } = useLocation();
  const direct = pathname.startsWith("/internal/messages");
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

  useTitle(direct ? "Direct messages" : (community?.name ?? "Communities"));
  const dmUnread = useChatUnread().count > 0;
  const { user } = useAuth();
  // Chats with something unread, newest first, shown on the rail under the direct messages tile.
  const allChats = useConversations().conversations;
  const unreadChats = useMemo(
    () =>
      allChats
        .filter((c) => c.unread > 0 && !c.muted && c._id !== conversationId)
        .sort((a, b) => (b.lastMessage?.at ?? "").localeCompare(a.lastMessage?.at ?? "")),
    [allChats, conversationId],
  );
  const [newChatOpen, setNewChatOpen] = useState(false);

  // The Chat button reopens the last DM or channel.
  useEffect(() => rememberChatPlace(pathname), [pathname]);

  const [createOpen, setCreateOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [addChannel, setAddChannel] = useState<{ category: string } | undefined>();
  const [membersOpen, setMembersOpen] = useState(true);
  const [membersDrawer, setMembersDrawer] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

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
    if (!direct && !communityId && communities.length > 0)
      navigate(communityPath(communities[0]!._id), { replace: true });
  }, [direct, communityId, communities, navigate]);

  // A community you are no longer in (left, removed, deleted): back to the list.
  useEffect(() => {
    if (!direct && communityId && communitiesQuery.isSuccess && !communities.some((c) => c._id === communityId)) {
      navigate("/internal/communities", { replace: true });
    }
  }, [direct, communityId, communitiesQuery.isSuccess, communities, navigate]);

  // A computer shows a channel next to the list, so a community opens on its first unread (else first) channel.
  useEffect(() => {
    if (direct || phone || !communityId || channelId || !channelsQuery.isSuccess) return;
    const first = firstChannel(channels);
    if (first) navigate(communityPath(communityId, first._id), { replace: true });
  }, [direct, phone, communityId, channelId, channelsQuery.isSuccess, channels, navigate]);

  // A channel that has gone (deleted, or closed to you): back to the community.
  useEffect(() => {
    if (!direct && communityId && channelId && channelsQuery.isSuccess && !channel) {
      navigate(communityPath(communityId), { replace: true });
    }
  }, [direct, communityId, channelId, channelsQuery.isSuccess, channel, navigate]);

  const openCommunity = (id: string) => navigate(communityPath(id));
  const openChannel = (id: string) => navigate(communityPath(communityId, id));
  const openConversation = (id: string) => navigate(`/internal/messages/${id}`);
  const open = direct ? !!conversationId : !!channelId;
  const showDrawerScreen = phone && !open;
  const otherUnread = unreadChannelCount(channels.filter((c) => c._id !== channelId)) > 0;

  const rail = (compact: boolean) => (
    <CommunityRail
      communities={communities}
      selectedId={direct ? undefined : communityId}
      directSelected={direct}
      directUnread={dmUnread && !direct}
      unreadChats={unreadChats}
      meId={user.id}
      selectedChatId={conversationId}
      onOpenChat={openConversation}
      inviteCount={inviteCount}
      compact={compact}
      onSelect={openCommunity}
      onMessages={() => navigate("/internal/messages")}
      onInvites={() => setInvitesOpen(true)}
      onCreate={() => setCreateOpen(true)}
    />
  );

  const directSidebar = (
    <ConversationList selectedId={conversationId} onSelect={openConversation} onNewChat={() => setNewChatOpen(true)} />
  );
  const sidebar = direct ? (
    directSidebar
  ) : community ? (
    <ChannelSidebar
      community={community}
      channels={channels}
      selectedId={channelId}
      onSelect={openChannel}
      onAddChannel={(category) => setAddChannel({ category })}
      onOpenSettings={() => navigate(`${communityPath(community._id)}/settings`)}
      onInvite={() => setInviteOpen(true)}
    />
  ) : null;

  const noCommunities = communitiesQuery.isSuccess && communities.length === 0;
  const unavailable = !direct && !!communityId && communityQuery.isError;

  let main;
  if (direct) {
    main = conversationId ? (
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <Thread key={conversationId} conversationId={conversationId} onBack={() => navigate("/internal/messages")} />
      </Box>
    ) : (
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <EmptyState
          icon={<ChatBubbleOutlineIcon />}
          title="Select a chat"
          description="Pick a conversation, or start a new one."
        />
      </Box>
    );
  } else if (noCommunities) {
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
          inThread: phone && open,
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
                width: direct ? 340 : 240,
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
          {!phone && !direct && community && channel && membersOpen && (
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
              <MembersPanel community={community} onInvite={() => setInviteOpen(true)} />
            </Box>
          )}
        </>
      )}

      {phone && !direct && community && (
        <Drawer
          anchor="right"
          open={membersDrawer}
          onClose={() => setMembersDrawer(false)}
          slotProps={{ paper: { sx: { width: 280 } } }}
        >
          <MembersPanel community={community} onInvite={() => setInviteOpen(true)} />
        </Drawer>
      )}

      <NewChatDialog open={newChatOpen} onClose={() => setNewChatOpen(false)} onOpened={openConversation} />
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
      {community && <InvitePeopleDialog open={inviteOpen} onClose={() => setInviteOpen(false)} community={community} />}
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
