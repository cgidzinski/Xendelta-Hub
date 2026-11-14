import { Avatar, Box, Button, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import EmptyState from "../../../../components/ui/EmptyState";
import { RADIUS } from "../../../../theme";
import { useCommunityActions, useMyCommunityInvites } from "../../../../hooks/communities/useCommunities";
import { initialsOf } from "../communityUi";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after joining, to open the community. */
  onJoined: (communityId: string) => void;
}

/** The invitations waiting for you, each with a Join and a Decline. */
export default function CommunityInvitesDialog({ open, onClose, onJoined }: Props) {
  const invites = useMyCommunityInvites().data ?? [];
  const { respondToInvite } = useCommunityActions();
  const { enqueueSnackbar } = useSnackbar();

  const answer = (communityId: string, accept: boolean) =>
    respondToInvite.mutate(
      { communityId, accept },
      {
        onSuccess: () => accept && onJoined(communityId),
        onError: (e: any) =>
          enqueueSnackbar(e?.response?.data?.message || e?.message || "Couldn't answer the invite", {
            variant: "error",
          }),
      },
    );

  return (
    <ResponsiveDialog open={open} onClose={onClose} title="Invitations" maxWidth="xs">
      {invites.length === 0 ? (
        <EmptyState title="No invitations" description="When someone invites you to a community, it shows up here." />
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {invites.map((invite) => (
            <Box
              key={invite.communityId}
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: RADIUS.lg,
                p: 2,
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Avatar variant="rounded" sx={{ width: 48, height: 48, borderRadius: RADIUS.xl, fontWeight: 600 }}>
                  {initialsOf(invite.communityName)}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 600 }}>
                    {invite.communityName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {invite.invitedBy ? `${invite.invitedBy.username} invited you. ` : ""}
                    {invite.memberCount} {invite.memberCount === 1 ? "person" : "people"}.
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                <Button disabled={respondToInvite.isPending} onClick={() => answer(invite.communityId, false)}>
                  Decline
                </Button>
                <Button
                  variant="contained"
                  disabled={respondToInvite.isPending}
                  onClick={() => answer(invite.communityId, true)}
                >
                  Join {invite.communityName}
                </Button>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </ResponsiveDialog>
  );
}
