import { useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import SearchIcon from "@mui/icons-material/Search";
import { useSnackbar } from "notistack";
import type { Community } from "@shared/communities";
import { useAuth } from "../../../../contexts/AuthContext";
import { useCommunityAdmin, usePendingInvites } from "../../../../hooks/communities/useCommunityAdmin";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import SectionCard from "../../../../components/ui/SectionCard";
import { canManageRoleClient, rankOf } from "../../../../utils/communityRoles";
import { roleTextColor } from "../communityUi";
import InvitePeopleDialog from "./InvitePeopleDialog";

const failure = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;
const joined = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/** Everyone in the community, with roles and removal, and the invitations nobody has answered yet. */
export default function MembersTab({ community }: { community: Community }) {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const admin = useCommunityAdmin(community._id);
  const canInvite = community.permissions.includes("invite");
  const canKick = community.permissions.includes("kickMembers");
  const isOwner = community.ownerId === user.id;
  const pending = usePendingInvites(community._id, canInvite).data ?? [];
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; userId: string } | undefined>();

  const people = useMemo(() => new Map(community.people.map((p) => [p._id, p])), [community.people]);
  const rolesById = useMemo(() => new Map(community.roles.map((r) => [r._id, r])), [community.roles]);
  const members = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...community.members]
      .filter((m) => !q || (people.get(m.user_id)?.username ?? "").toLowerCase().includes(q))
      .sort((a, b) => {
        const rank = (m: typeof a) => (m.role === "owner" ? Infinity : rankOf(community, m.user_id));
        return (
          rank(b) - rank(a) ||
          (people.get(a.user_id)?.username ?? "").localeCompare(people.get(b.user_id)?.username ?? "")
        );
      });
  }, [community, people, query]);

  const target = menu ? community.members.find((m) => m.user_id === menu.userId) : undefined;
  const mine = rankOf(community, user.id);
  const manageableRoles = community.roles.filter((r) => !r.everyone && canManageRoleClient(community, user.id, r));
  // Roles can be changed on people below you (never on yourself or the owner).
  const canEditRoles =
    !!target &&
    target.role !== "owner" &&
    target.user_id !== user.id &&
    community.permissions.includes("manageRoles") &&
    (isOwner || rankOf(community, target.user_id) < mine);
  const closeMenu = () => setMenu(undefined);
  const onError = (fallback: string) => (e: unknown) => enqueueSnackbar(failure(e, fallback), { variant: "error" });

  const setRole = (roleId: string) => {
    if (!target) return;
    const has = target.roleIds.includes(roleId);
    admin.setMemberRoles.mutate(
      {
        userId: target.user_id,
        roleIds: has ? target.roleIds.filter((id) => id !== roleId) : [...target.roleIds, roleId],
      },
      { onError: onError("Couldn't change their roles") },
    );
  };
  const makeOwner = async () => {
    if (!target) return;
    const name = people.get(target.user_id)?.username ?? "them";
    closeMenu();
    const ok = await confirm({
      title: `Make ${name} the owner?`,
      message: "You become an ordinary member. Only the new owner can take it back.",
      confirmLabel: "Hand over",
      destructive: true,
    });
    if (ok) admin.makeOwner.mutate(target.user_id, { onError: onError("Couldn't hand the community over") });
  };
  const removeMember = async () => {
    if (!target) return;
    const name = people.get(target.user_id)?.username ?? "them";
    closeMenu();
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: `${name} loses access to ${community.name}. They need a new invitation to return.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (ok) admin.removeMember.mutate(target.user_id, { onError: onError("Couldn't remove them") });
  };

  return (
    <Stack spacing={2}>
      <SectionCard title={`People, ${community.members.length}`}>
        <Stack direction="row" spacing={1.5}>
          <TextField
            fullWidth
            size="small"
            placeholder={`Search ${community.members.length} people`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
              htmlInput: { "aria-label": "Search people" },
            }}
          />
          {canInvite && (
            <Button
              variant="contained"
              startIcon={<PersonAddAltIcon />}
              onClick={() => setInviteOpen(true)}
              sx={{ flexShrink: 0 }}
            >
              Invite people
            </Button>
          )}
        </Stack>

        <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
          {members.map((m) => {
            const person = people.get(m.user_id);
            const roles = m.roleIds
              .map((id) => rolesById.get(id))
              .filter((r): r is NonNullable<typeof r> => !!r)
              .sort((a, b) => b.position - a.position);
            const self = m.user_id === user.id;
            const showMenu =
              m.role !== "owner" &&
              !self &&
              ((community.permissions.includes("manageRoles") && (isOwner || rankOf(community, m.user_id) < mine)) ||
                canKick ||
                isOwner);
            return (
              <Box key={m.user_id} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
                <Avatar src={person?.avatar || undefined} sx={{ width: 36, height: 36 }}>
                  {person?.username[0]?.toUpperCase()}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap variant="body2" sx={{ fontWeight: 500 }}>
                    {person?.username ?? "Someone"}
                    {self && (
                      <Typography component="span" variant="body2" color="text.secondary">
                        {" "}
                        (you)
                      </Typography>
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Joined {joined(m.joinedAt)}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", justifyContent: "flex-end", rowGap: 0.5 }}>
                  {m.role === "owner" && <Chip size="small" variant="outlined" color="warning" label="Owner" />}
                  {roles.map((r) => (
                    <Chip
                      key={r._id}
                      size="small"
                      variant="outlined"
                      label={r.name}
                      sx={{
                        color: (t: Theme) => roleTextColor(t, r.color) ?? t.palette.text.secondary,
                        borderColor: (t: Theme) => roleTextColor(t, r.color) ?? t.palette.divider,
                      }}
                    />
                  ))}
                </Stack>
                {showMenu ? (
                  <IconButton
                    aria-label={`Actions for ${person?.username ?? "member"}`}
                    onClick={(e) => setMenu({ anchor: e.currentTarget, userId: m.user_id })}
                  >
                    <MoreVertIcon />
                  </IconButton>
                ) : (
                  <Box sx={{ width: 40, flexShrink: 0 }} />
                )}
              </Box>
            );
          })}
          {members.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              Nobody matches &ldquo;{query}&rdquo;.
            </Typography>
          )}
        </Stack>
      </SectionCard>

      {canInvite && (
        <SectionCard title="Pending invites" description="Waiting for an answer. They expire after 30 days.">
          {pending.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No pending invitations.
            </Typography>
          ) : (
            <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
              {pending.map((invite) => (
                <Box key={invite.person._id} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
                  <Avatar src={invite.person.avatar || undefined} sx={{ width: 36, height: 36 }}>
                    {invite.person.username[0]?.toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap variant="body2" sx={{ fontWeight: 500 }}>
                      {invite.person.username}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Invited by {people.get(invite.invitedBy)?.username ?? "someone"} on {joined(invite.createdAt)}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    onClick={() =>
                      admin.cancelInvite.mutate(invite.person._id, {
                        onError: onError("Couldn't cancel the invitation"),
                      })
                    }
                  >
                    Cancel
                  </Button>
                </Box>
              ))}
            </Stack>
          )}
        </SectionCard>
      )}

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={closeMenu}>
        {canEditRoles && manageableRoles.length > 0 && (
          <Typography variant="overline" color="text.secondary" sx={{ px: 2, display: "block" }}>
            Roles
          </Typography>
        )}
        {canEditRoles &&
          manageableRoles.map((role) => (
            <MenuItem key={role._id} dense onClick={() => setRole(role._id)} disabled={admin.setMemberRoles.isPending}>
              <ListItemIcon>
                <Checkbox
                  edge="start"
                  size="small"
                  checked={!!target?.roleIds.includes(role._id)}
                  tabIndex={-1}
                  disableRipple
                />
              </ListItemIcon>
              <ListItemText primary={role.name} />
            </MenuItem>
          ))}
        {isOwner && target && target.role !== "owner" && <MenuItem onClick={makeOwner}>Make owner</MenuItem>}
        {canKick && target && target.role !== "owner" && (
          <MenuItem onClick={removeMember} sx={{ color: "error.main" }}>
            Remove from community
          </MenuItem>
        )}
      </Menu>

      <InvitePeopleDialog open={inviteOpen} onClose={() => setInviteOpen(false)} community={community} />
    </Stack>
  );
}
