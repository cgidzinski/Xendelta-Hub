import { Avatar, Box, Button, Typography } from "@mui/material";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import type { Community } from "@shared/communities";
import type { Theme } from "@mui/material/styles";
import { memberGroups, roleTextColor } from "../communityUi";

/** Who is in the community, in sections: the owner, each role, then everyone else. */
export default function MembersPanel({ community, onInvite }: { community: Community; onInvite?: () => void }) {
  const people = new Map(community.people.map((p) => [p._id, p]));
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
      {memberGroups(community).map((group) => (
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
          {group.ids.map((id) => {
            const person = people.get(id);
            return (
              <Box key={id} sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 1, height: 40 }}>
                <Avatar src={person?.avatar || undefined} sx={{ width: 28, height: 28, fontSize: 13 }}>
                  {person?.username[0]?.toUpperCase()}
                </Avatar>
                <Typography
                  noWrap
                  variant="body2"
                  sx={{
                    color: (t: Theme) => roleTextColor(t, group.color) ?? t.palette.text.primary,
                    fontWeight: group.color ? 500 : 400,
                  }}
                >
                  {person?.username ?? "Someone"}
                </Typography>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
