import { useMemo } from "react";
import { Badge, Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined";
import MicOffIcon from "@mui/icons-material/MicOff";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import type { Community, CommunityChannel } from "@shared/communities";
import EmptyState from "../../../components/ui/EmptyState";
import { useCall } from "../../../contexts/CallContext";
import { useChatCall } from "../../../hooks/calls/useChatCall";
import UserAvatar from "../../../components/user/UserAvatar";

interface Props {
  community: Community;
  channel: CommunityChannel;
  phone: boolean;
  onOpenDrawer: () => void;
  otherUnread: boolean;
  membersOpen: boolean;
  onToggleMembers: () => void;
}

/** A voice channel: who is in the room, and a button to join. Once you are in, the call itself takes over the screen. */
export default function VoiceRoom({
  community,
  channel,
  phone,
  onOpenDrawer,
  otherUnread,
  membersOpen,
  onToggleMembers,
}: Props) {
  const { enabled, active, join, leave, setExpanded } = useCall();
  const { call, people } = useChatCall(channel._id, enabled);
  const inHere = active?.conversationId === channel._id;
  const names = useMemo(() => new Map(people.map((p) => [p._id, p])), [people]);
  const canJoin = channel.permissions.includes("sendMessages");

  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", height: "100%" }}>
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
        <VolumeUpOutlinedIcon sx={{ color: "text.secondary", fontSize: 20 }} />
        <Typography noWrap sx={{ fontWeight: 600, flex: 1 }}>
          {channel.name}
        </Typography>
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

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
        }}
      >
        {!enabled ? (
          <EmptyState title="Voice isn't set up here" description="Ask whoever runs this hub to turn on calls." />
        ) : (
          <Box sx={{ textAlign: "center", maxWidth: 520, width: "100%" }}>
            <Typography variant="h6" sx={{ mb: 0.5 }}>
              {channel.name}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {channel.topic ||
                (call?.participants.length
                  ? `${call.participants.length} in ${community.name} voice right now`
                  : "Nobody is here yet. Join to start talking.")}
            </Typography>
            {call && call.participants.length > 0 && (
              <Box sx={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 2, mb: 3 }}>
                {call.participants.map((p) => {
                  const person = names.get(p.userId);
                  return (
                    <Box key={p.userId} sx={{ width: 84, textAlign: "center" }}>
                      <Badge
                        overlap="circular"
                        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                        invisible={!p.muted}
                        badgeContent={<MicOffIcon sx={{ fontSize: 14 }} aria-label="Muted" />}
                        sx={{
                          "& .MuiBadge-badge": {
                            bgcolor: "background.paper",
                            color: "error.main",
                            p: 0.25,
                            minWidth: 0,
                          },
                        }}
                      >
                        <UserAvatar user={person} sx={{ width: 56, height: 56, mx: "auto" }}>
                          {person?.username[0]?.toUpperCase()}
                        </UserAvatar>
                      </Badge>
                      <Typography variant="caption" noWrap sx={{ display: "block", mt: 0.5 }}>
                        {person?.username ?? "Someone"}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}
            {inHere ? (
              <Box sx={{ display: "flex", justifyContent: "center", gap: 1 }}>
                <Button variant="contained" onClick={() => setExpanded(true)}>
                  Open call
                </Button>
                <Button variant="outlined" color="error" onClick={() => void leave()}>
                  Disconnect
                </Button>
              </Box>
            ) : canJoin ? (
              <Box sx={{ display: "flex", justifyContent: "center", gap: 1 }}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<VolumeUpOutlinedIcon />}
                  disabled={!!active}
                  onClick={() => void join(channel._id, false)}
                >
                  Join voice
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<VideocamOutlinedIcon />}
                  disabled={!!active}
                  onClick={() => void join(channel._id, true)}
                >
                  Join with video
                </Button>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                You can see who is here but not join.
              </Typography>
            )}
            {active && !inHere && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                Leave your current call first.
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
