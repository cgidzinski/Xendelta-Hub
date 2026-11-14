import { useEffect, useState } from "react";
import { Button, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import type { Community } from "@shared/communities";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import PeoplePicker from "../../../../components/PeoplePicker";
import type { SearchedUser } from "../../../../hooks/people/usePeople";
import { useCommunityAdmin, usePendingInvites } from "../../../../hooks/communities/useCommunityAdmin";
import { COMMUNITY_MAX_INVITES_AT_ONCE } from "@shared/communities";

interface Props {
  open: boolean;
  onClose: () => void;
  community: Community;
}

/** Invite people who already have an account. They get a notification and choose whether to join. */
export default function InvitePeopleDialog({ open, onClose, community }: Props) {
  const [people, setPeople] = useState<SearchedUser[]>([]);
  const { enqueueSnackbar } = useSnackbar();
  const admin = useCommunityAdmin(community._id);
  const pending = usePendingInvites(community._id, open).data ?? [];

  useEffect(() => {
    if (open) setPeople([]);
  }, [open]);

  const submit = () =>
    admin.invite.mutate(
      people.map((p) => p._id),
      {
        onSuccess: ({ invited }) => {
          enqueueSnackbar(invited === 1 ? "Invitation sent" : `${invited} invitations sent`, { variant: "success" });
          onClose();
        },
        onError: (e: any) =>
          enqueueSnackbar(e?.response?.data?.message || e?.message || "Couldn't send the invitations", {
            variant: "error",
          }),
      },
    );

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title={`Invite people to ${community.name}`}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={people.length === 0 || admin.invite.isPending}>
            {people.length > 0 ? `Send ${people.length} ${people.length === 1 ? "invite" : "invites"}` : "Send invites"}
          </Button>
        </>
      }
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        They get a notification and choose whether to join. You can pick up to {COMMUNITY_MAX_INVITES_AT_ONCE} at a
        time.
      </Typography>
      <PeoplePicker
        value={people}
        onChange={(next) => setPeople(next.slice(0, COMMUNITY_MAX_INVITES_AT_ONCE))}
        excludeIds={[...community.members.map((m) => m.user_id), ...pending.map((i) => i.person._id)]}
        autoFocus
      />
    </ResponsiveDialog>
  );
}
