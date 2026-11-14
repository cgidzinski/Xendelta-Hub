import { useState } from "react";
import { Button, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import { COMMUNITY_NAME_MAX } from "@shared/communities";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useCommunityActions } from "../../../../hooks/communities/useCommunities";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (communityId: string) => void;
}

/** Make a community. The maker owns it, and it starts with a general channel. */
export default function CreateCommunityDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const { enqueueSnackbar } = useSnackbar();
  const { createCommunity } = useCommunityActions();
  const trimmed = name.trim();

  const close = () => {
    setName("");
    onClose();
  };
  const submit = () => {
    if (!trimmed || createCommunity.isPending) return;
    createCommunity.mutate(
      { name: trimmed },
      {
        onSuccess: (community) => {
          setName("");
          onCreated(community._id);
        },
        onError: (e: any) =>
          enqueueSnackbar(e?.response?.data?.message || e?.message || "Couldn't create the community", {
            variant: "error",
          }),
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={close}
      title="Create a community"
      maxWidth="xs"
      actions={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={!trimmed || createCommunity.isPending}>
            Create community
          </Button>
        </>
      }
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        A community is a place for a group, with its own channels, roles and people. You will own it, and it starts with
        a general channel.
      </Typography>
      <TextField
        autoFocus
        fullWidth
        size="small"
        label="Community name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        slotProps={{ htmlInput: { maxLength: COMMUNITY_NAME_MAX } }}
      />
    </ResponsiveDialog>
  );
}
