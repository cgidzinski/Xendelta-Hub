import { Badge, Box, ButtonBase, Divider, Tooltip } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import type { Community } from "@shared/communities";
import { RADIUS } from "../../../../theme";
import { initialsOf } from "../communityUi";

interface CommunityRailProps {
  communities: Community[];
  selectedId?: string;
  /** Invites waiting for an answer. */
  inviteCount: number;
  /** Narrower on a phone, where it sits beside the channel list. */
  compact?: boolean;
  onSelect: (communityId: string) => void;
  onMessages: () => void;
  onInvites: () => void;
  onCreate: () => void;
}

const tile = (size: number) =>
  ({
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: RADIUS.xl,
    border: 1,
    borderColor: "divider",
    bgcolor: "background.paper",
    color: "text.secondary",
    fontSize: size > 44 ? 15 : 14,
    fontWeight: 600,
    "&:hover": { bgcolor: "action.hover" },
  }) as const;

/** The column of communities: your messages, each community, pending invites, and a button to make one. */
export default function CommunityRail({
  communities,
  selectedId,
  inviteCount,
  compact,
  onSelect,
  onMessages,
  onInvites,
  onCreate,
}: CommunityRailProps) {
  const size = compact ? 44 : 48;
  return (
    <Box
      component="nav"
      aria-label="Communities"
      sx={{
        width: compact ? 64 : 72,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1.25,
        py: compact ? 1.75 : 1.5,
        borderRight: 1,
        borderColor: "divider",
        bgcolor: compact ? "background.default" : "background.paper",
        overflowY: "auto",
      }}
    >
      <Tooltip title="Messages" placement="right">
        <ButtonBase aria-label="Messages" onClick={onMessages} sx={tile(size)}>
          <ChatBubbleOutlineIcon />
        </ButtonBase>
      </Tooltip>
      <Divider flexItem sx={{ mx: 2 }} />

      {communities.map((community) => {
        const selected = community._id === selectedId;
        const unread = !selected && community.unreadChannels > 0;
        return (
          <Box key={community._id} sx={{ position: "relative" }}>
            {selected && (
              <Box
                sx={{
                  position: "absolute",
                  left: compact ? -10 : -12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 4,
                  height: 28,
                  borderRadius: "0 4px 4px 0",
                  bgcolor: "primary.main",
                }}
              />
            )}
            <Tooltip title={community.name} placement="right">
              <ButtonBase
                onClick={() => onSelect(community._id)}
                aria-label={unread ? `${community.name}, unread` : community.name}
                aria-current={selected ? "true" : undefined}
                sx={{
                  ...tile(size),
                  ...(selected && {
                    color: "primary.main",
                    borderColor: "primary.main",
                    bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.14),
                  }),
                  ...(unread && { color: "text.primary" }),
                }}
              >
                {initialsOf(community.name)}
              </ButtonBase>
            </Tooltip>
            {unread && (
              <Box
                sx={{
                  position: "absolute",
                  right: -3,
                  bottom: -3,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                  border: 2,
                  borderColor: compact ? "background.default" : "background.paper",
                }}
              />
            )}
          </Box>
        );
      })}

      {inviteCount > 0 && (
        <>
          <Divider flexItem sx={{ mx: 2 }} />
          <Tooltip title="Invitations" placement="right">
            <Badge badgeContent={inviteCount} color="primary" overlap="rectangular">
              <ButtonBase
                onClick={onInvites}
                aria-label={`${inviteCount} community ${inviteCount === 1 ? "invite" : "invites"}`}
                sx={{
                  ...tile(size),
                  border: 1,
                  borderStyle: "dashed",
                  borderColor: "primary.main",
                  color: "primary.main",
                }}
              >
                <PersonAddAltIcon />
              </ButtonBase>
            </Badge>
          </Tooltip>
        </>
      )}

      <Tooltip title="Create a community" placement="right">
        <ButtonBase
          onClick={onCreate}
          aria-label="Create a community"
          sx={{ ...tile(size), borderStyle: compact ? "dashed" : "solid" }}
        >
          <AddIcon />
        </ButtonBase>
      </Tooltip>
    </Box>
  );
}
