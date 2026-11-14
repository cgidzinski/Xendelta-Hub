import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Stack, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import { COMMUNITY_NAME_MAX, type Community } from "@shared/communities";
import { useAuth } from "../../../../contexts/AuthContext";
import { useCommunityActions } from "../../../../hooks/communities/useCommunities";
import { useCommunityAdmin } from "../../../../hooks/communities/useCommunityAdmin";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import SectionCard from "../../../../components/ui/SectionCard";
import { hasCommunityPermission } from "../../../../utils/communityChat";

const failure = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

/** The name, and leaving or deleting the community. */
export default function OverviewTab({ community }: { community: Community }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { enqueueSnackbar } = useSnackbar();
  const admin = useCommunityAdmin(community._id);
  const { leave } = useCommunityActions();
  const [name, setName] = useState(community.name);
  const isOwner = community.ownerId === user.id;
  const canRename = hasCommunityPermission(community, "manageCommunity");
  const trimmed = name.trim();

  useEffect(() => setName(community.name), [community.name]);

  const save = () =>
    admin.rename.mutate(trimmed, {
      onSuccess: () => enqueueSnackbar("Saved", { variant: "success" }),
      onError: (e) => enqueueSnackbar(failure(e, "Couldn't rename the community"), { variant: "error" }),
    });

  const leaveIt = async () => {
    const ok = await confirm({
      title: `Leave ${community.name}?`,
      message: "You'll lose access to its channels. Someone has to invite you to come back.",
      confirmLabel: "Leave",
      destructive: true,
    });
    if (!ok) return;
    leave.mutate(community._id, {
      onSuccess: () => navigate("/internal/communities", { replace: true }),
      onError: (e) => enqueueSnackbar(failure(e, "Couldn't leave"), { variant: "error" }),
    });
  };

  const deleteIt = async () => {
    const ok = await confirm({
      title: `Delete ${community.name}?`,
      message: "Its channels and every message in them are deleted for everyone. This can't be undone.",
      confirmLabel: "Delete community",
      destructive: true,
    });
    if (!ok) return;
    admin.remove.mutate(undefined, {
      onSuccess: () => navigate("/internal/communities", { replace: true }),
      onError: (e) => enqueueSnackbar(failure(e, "Couldn't delete the community"), { variant: "error" }),
    });
  };

  return (
    <Stack spacing={2}>
      <SectionCard title="Name">
        <TextField
          size="small"
          label="Community name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canRename && trimmed && trimmed !== community.name && save()}
          disabled={!canRename}
          helperText={canRename ? undefined : "Only people who manage the community can rename it."}
          slotProps={{ htmlInput: { maxLength: COMMUNITY_NAME_MAX } }}
        />
        {canRename && (
          <Stack direction="row" justifyContent="flex-end">
            <Button
              variant="contained"
              onClick={save}
              disabled={!trimmed || trimmed === community.name || admin.rename.isPending}
            >
              Save
            </Button>
          </Stack>
        )}
      </SectionCard>

      <SectionCard title={isOwner ? "Delete this community" : "Leave this community"} danger>
        {isOwner ? (
          <>
            <Typography variant="body2" color="text.secondary">
              Deleting removes every channel and message for everyone. To keep it going without you, hand it to someone
              else first (in Members), then leave.
            </Typography>
            <Stack direction="row" justifyContent="flex-end">
              <Button color="error" variant="outlined" onClick={deleteIt} disabled={admin.remove.isPending}>
                Delete community
              </Button>
            </Stack>
          </>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary">
              You'll lose access to its channels. Someone has to invite you to come back.
            </Typography>
            <Stack direction="row" justifyContent="flex-end">
              <Button color="error" variant="outlined" onClick={leaveIt} disabled={leave.isPending}>
                Leave community
              </Button>
            </Stack>
          </>
        )}
      </SectionCard>
    </Stack>
  );
}
