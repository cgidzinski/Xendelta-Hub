import { useEffect, useState } from "react";
import { Autocomplete, Box, Button, TextField } from "@mui/material";
import { useSnackbar } from "notistack";
import {
  COMMUNITY_CATEGORY_MAX,
  COMMUNITY_CHANNEL_NAME_MAX,
  COMMUNITY_CHANNEL_TOPIC_MAX,
  type CommunityChannel,
} from "@shared/communities";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useCommunityAdmin } from "../../../../hooks/communities/useCommunityAdmin";

interface Props {
  open: boolean;
  onClose: () => void;
  communityId: string;
  channel: CommunityChannel | undefined;
  categories: string[];
}

/** Rename a channel, change its topic, or move it to another category. */
export default function EditChannelDialog({ open, onClose, communityId, channel, categories }: Props) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState("");
  const admin = useCommunityAdmin(communityId);
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    if (channel) {
      setName(channel.name);
      setTopic(channel.topic);
      setCategory(channel.category);
    }
  }, [channel]);

  const trimmed = name.trim();
  const changed =
    !!channel && (trimmed !== channel.name || topic.trim() !== channel.topic || category.trim() !== channel.category);
  const submit = () => {
    if (!channel || !trimmed || !changed) return;
    admin.updateChannel.mutate(
      { channelId: channel._id, name: trimmed, topic: topic.trim(), category: category.trim() },
      {
        onSuccess: onClose,
        onError: (e: any) =>
          enqueueSnackbar(e?.response?.data?.message || e?.message || "Couldn't save the channel", {
            variant: "error",
          }),
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title="Edit channel"
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={!trimmed || !changed || admin.updateChannel.isPending}>
            Save
          </Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="Channel name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          slotProps={{ htmlInput: { maxLength: COMMUNITY_CHANNEL_NAME_MAX } }}
        />
        <TextField
          fullWidth
          size="small"
          label="Topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          slotProps={{ htmlInput: { maxLength: COMMUNITY_CHANNEL_TOPIC_MAX } }}
        />
        <Autocomplete
          freeSolo
          size="small"
          options={categories}
          inputValue={category}
          onInputChange={(_e, value) => setCategory(value.slice(0, COMMUNITY_CATEGORY_MAX))}
          renderInput={(params) => <TextField {...params} label="Category (empty for none)" />}
        />
      </Box>
    </ResponsiveDialog>
  );
}
