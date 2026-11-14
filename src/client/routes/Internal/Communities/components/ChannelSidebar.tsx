import { Box, ButtonBase, IconButton, Tooltip, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import TagIcon from "@mui/icons-material/Tag";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import type { Community, CommunityChannel } from "@shared/communities";
import { RADIUS } from "../../../../theme";
import { groupChannels, hasCommunityPermission } from "../../../../utils/communityChat";

interface ChannelSidebarProps {
  community: Community;
  channels: CommunityChannel[];
  selectedId?: string;
  onSelect: (channelId: string) => void;
  /** Add a channel, under this category when one is given. */
  onAddChannel: (category: string) => void;
}

function Row({ channel, selected, onSelect }: { channel: CommunityChannel; selected: boolean; onSelect: () => void }) {
  const unread = channel.unread > 0 && !channel.muted;
  const closed = channel.overrides.length > 0 && !channel.permissions.includes("sendMessages");
  return (
    <ButtonBase
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      aria-label={unread ? `${channel.name}, ${channel.unread} unread` : channel.name}
      sx={{
        display: "flex",
        justifyContent: "flex-start",
        gap: 1.25,
        width: "100%",
        height: 40,
        px: 1.5,
        borderRadius: RADIUS.lg,
        fontSize: 14,
        textAlign: "left",
        color: selected ? "primary.main" : unread ? "text.primary" : "text.secondary",
        fontWeight: selected ? 500 : unread ? 600 : 400,
        bgcolor: selected ? (t: Theme) => alpha(t.palette.primary.main, 0.14) : "transparent",
        "&:hover": { bgcolor: selected ? undefined : "action.hover" },
      }}
    >
      {closed ? <LockOutlinedIcon sx={{ fontSize: 18 }} /> : <TagIcon sx={{ fontSize: 18 }} />}
      <Box
        component="span"
        sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {channel.name}
      </Box>
      {channel.muted && <VolumeOffIcon sx={{ fontSize: 16 }} aria-label="Muted" />}
      {unread && !selected && (
        <Box
          component="span"
          sx={{
            minWidth: 20,
            height: 20,
            px: 0.75,
            borderRadius: 10,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            fontSize: 11,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {channel.unread > 99 ? "99+" : channel.unread}
        </Box>
      )}
    </ButtonBase>
  );
}

/** The community's name and its channels, under their category headings. */
export default function ChannelSidebar({
  community,
  channels,
  selectedId,
  onSelect,
  onAddChannel,
}: ChannelSidebarProps) {
  const canAdd = hasCommunityPermission(community, "manageChannels");
  const groups = groupChannels(channels);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <Box
        sx={{
          height: 56,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          px: 2,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography noWrap sx={{ fontWeight: 600, fontSize: 16 }}>
          {community.name}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: 1, py: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
        {groups.map((group) => (
          <Box key={group.category || "__none"} sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
            {group.category && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  pl: 1.5,
                  pr: 0.5,
                  pt: 1.5,
                  pb: 0.5,
                }}
              >
                <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                  {group.category}
                </Typography>
                {canAdd && (
                  <Tooltip title={`Add a channel to ${group.category}`}>
                    <IconButton
                      size="small"
                      aria-label={`Add a channel to ${group.category}`}
                      onClick={() => onAddChannel(group.category)}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            )}
            {group.channels.map((channel) => (
              <Row
                key={channel._id}
                channel={channel}
                selected={channel._id === selectedId}
                onSelect={() => onSelect(channel._id)}
              />
            ))}
          </Box>
        ))}
        {canAdd && (
          <ButtonBase
            onClick={() => onAddChannel("")}
            sx={{
              mt: 1,
              justifyContent: "flex-start",
              gap: 1.25,
              height: 40,
              px: 1.5,
              borderRadius: RADIUS.lg,
              fontSize: 14,
              color: "text.secondary",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <AddIcon sx={{ fontSize: 18 }} /> Add a channel
          </ButtonBase>
        )}
      </Box>
    </Box>
  );
}
