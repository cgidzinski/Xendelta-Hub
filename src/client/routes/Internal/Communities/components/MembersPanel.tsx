import { Avatar, Box, Button, Typography } from "@mui/material";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import type { Community } from "@shared/communities";
import type { Theme } from "@mui/material/styles";
import { memberGroups, roleTextColor } from "../communityUi";
import { PresenceBadge } from "../../../../components/presence/PresenceDot";
import { usePresence } from "../../../../hooks/presence/usePresence";

/** Who is in the community, in sections: the owner, each role, then everyone else. */
export default function MembersPanel({ community, onInvite }: { community: Community; onInvite?: () => void }) {
  const people = new Map(community.people.map((p) => [p._id, p]));
  const { of } = usePresence();
  const groups = memberGroups(community);
  // Online people sit under their role; everyone who is offline is gathered at the end, dimmed.
  const online = groups
    .map((g) => ({ ...g, ids: g.ids.filter((id) => of(id).status !== "offline") }))
    .filter((g) => g.ids.length > 0);
  const offline = groups.flatMap((g) =>
    g.ids.filter((id) => of(id).status === "offline").map((id) => ({ id, color: g.color })),
  );
  const row = (id: string, color: string, dim: boolean) => {
    const person = people.get(id);
    const { customStatus } = of(id);
    return (
      <Box
        key={id}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          px: 1,
          height: customStatus ? 48 : 40,
          opacity: dim ? 0.5 : 1,
        }}
      >
        <PresenceBadge userId={id} size={9}>
          <Avatar src={person?.avatar || undefined} sx={{ width: 28, height: 28, fontSize: 13 }}>
            {person?.username[0]?.toUpperCase()}
          </Avatar>
        </PresenceBadge>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            noWrap
            variant="body2"
            sx={{
              color: (t: Theme) => roleTextColor(t, color) ?? t.palette.text.primary,
              fontWeight: color ? 500 : 400,
            }}
          >
            {person?.username ?? "Someone"}
          </Typography>
          {customStatus && (
            <Typography noWrap variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
              {`${customStatus.emoji} ${customStatus.text}`.trim()}
            </Typography>
          )}
        </Box>
      </Box>
    );
  };
  return (
    <Box component="aside" aria-label="Members" sx={{ p: 1.5, overflowY: "auto", height: "100%" }}>
      {onInvite && community.permissions.includes("invite") && (
        <Button
          fullWidth
          variant="outlined"
          size="small"
          startIcon={<PersonAddAltIcon />}
          onClick={onInvite}
          sx={{ mb: 1.5 }}
        >
          Invite people
        </Button>
      )}
      {online.map((group) => (
        <Box key={group.key} sx={{ mb: 1.5 }}>
          <Typography
            variant="overline"
            sx={{
              display: "block",
              px: 1,
              lineHeight: 2,
              color: (t: Theme) => roleTextColor(t, group.color) ?? t.palette.text.secondary,
            }}
          >
            {group.label}, {group.ids.length}
          </Typography>
          {group.ids.map((id) => row(id, group.color, false))}
        </Box>
      ))}
      {offline.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", px: 1, lineHeight: 2 }}>
            Offline, {offline.length}
          </Typography>
          {offline.map((x) => row(x.id, x.color, true))}
        </Box>
      )}
    </Box>
  );
}
