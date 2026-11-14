import { useMemo } from "react";
import { Badge, Box, IconButton, Tooltip, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import TagIcon from "@mui/icons-material/Tag";
import type { Community, CommunityChannel } from "@shared/communities";
import { useAuth } from "../../../contexts/AuthContext";
import { channelConversation } from "../../../utils/communityChat";
import ChatPane from "../Messages/components/ChatPane";
import { senderMetaFor } from "./communityUi";

interface ChannelViewProps {
  community: Community;
  channel: CommunityChannel;
  phone: boolean;
  /** On a phone: open the communities and channels. */
  onOpenDrawer: () => void;
  /** Something unread in another channel, for the dot on the menu button. */
  otherUnread: boolean;
  membersOpen: boolean;
  onToggleMembers: () => void;
}

/** One channel: its header and the shared chat pane, drawn as a row per message. */
export default function ChannelView({
  community,
  channel,
  phone,
  onOpenDrawer,
  otherUnread,
  membersOpen,
  onToggleMembers,
}: ChannelViewProps) {
  const { user } = useAuth();
  const conversation = useMemo(() => channelConversation(community, channel, user.id), [community, channel, user.id]);
  const people = community.members.length;

  const header = ({
    typingNames,
    pins,
    search,
  }: {
    typingNames: string[];
    pins: React.ReactNode;
    search: React.ReactNode;
  }) => {
    const subtitle =
      typingNames.length > 0
        ? `${typingNames.join(", ")} typing…`
        : phone
          ? `${community.name} · ${people} ${people === 1 ? "person" : "people"}`
          : "";
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: { xs: 1, md: 2.5 },
          pt: "env(safe-area-inset-top)",
          minHeight: 56,
          flexShrink: 0,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {phone && (
          <IconButton onClick={onOpenDrawer} aria-label="Open communities and channels" edge="start">
            <Badge variant="dot" color="primary" invisible={!otherUnread}>
              <MenuIcon />
            </Badge>
          </IconButton>
        )}
        <TagIcon sx={{ color: "text.secondary", fontSize: 20 }} />
        <Box sx={{ minWidth: 0, flex: phone ? 1 : "none" }}>
          <Typography noWrap sx={{ fontWeight: 600 }}>
            {channel.name}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", lineHeight: 1.2 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {!phone && (
          <>
            <Box sx={{ width: "1px", height: 20, bgcolor: "divider", mx: 0.5 }} />
            <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
              {typingNames.length > 0 ? subtitle : channel.topic}
            </Typography>
          </>
        )}
        {search}
        {pins}
        <Tooltip title={membersOpen && !phone ? "Hide members" : "Members"}>
          <IconButton
            onClick={onToggleMembers}
            aria-label={membersOpen && !phone ? "Hide members" : "Members"}
            sx={
              membersOpen && !phone
                ? { color: "primary.main", bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.14) }
                : undefined
            }
          >
            <PeopleOutlineIcon />
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  return (
    <ChatPane
      conversationId={channel._id}
      conversation={conversation}
      title={`#${channel.name}`}
      header={header}
      layout="flat"
      canPost={channel.permissions.includes("sendMessages")}
      canModerate={channel.permissions.includes("manageMessages")}
      senderMeta={(id) => senderMetaFor(community, id)}
      canPin={channel.permissions.includes("pinMessages")}
      canPingAll={channel.permissions.includes("mentionEveryone")}
      emojiScope={{ type: "community", id: community._id }}
      communityId={community._id}
      emptyDescription={`This is the start of #${channel.name}.`}
    />
  );
}
