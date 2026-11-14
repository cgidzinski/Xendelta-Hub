import { useEffect, useState } from "react";
import { Autocomplete, Box, Button, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import { COMMUNITY_CATEGORY_MAX, COMMUNITY_CHANNEL_NAME_MAX, COMMUNITY_CHANNEL_TOPIC_MAX } from "@shared/communities";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useCommunityActions } from "../../../../hooks/communities/useCommunities";

interface Props {
  open: boolean;
  onClose: () => void;
  communityId: string;
  /** The category headings the community already has. */
  categories: string[];
  /** The category to start with (the one whose + was pressed). */
  initialCategory: string;
  onCreated: (channelId: string) => void;
}

/** Add a channel: a name, an optional topic, and the category it sits under. */
export default function CreateChannelDialog({
  open,
  onClose,
  communityId,
  categories,
  initialCategory,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const { enqueueSnackbar } = useSnackbar();
  const { createChannel } = useCommunityActions();
  const trimmed = name.trim();

  useEffect(() => {
    if (open) setCategory(initialCategory);
  }, [open, initialCategory]);

  const close = () => {
    setName("");
    setTopic("");
    onClose();
  };
  const submit = () => {
    if (!trimmed || createChannel.isPending) return;
    createChannel.mutate(
      { communityId, name: trimmed, topic: topic.trim() || undefined, category: category.trim() || undefined },
      {
        onSuccess: (channel) => {
          setName("");
          setTopic("");
          onCreated(channel._id);
        },
        onError: (e: any) =>
          enqueueSnackbar(e?.response?.data?.message || e?.message || "Couldn't add the channel", { variant: "error" }),
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={close}
      title="Add a channel"
      maxWidth="xs"
      actions={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={!trimmed || createChannel.isPending}>
            Add channel
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
          onKeyDown={(e) => e.key === "Enter" && submit()}
          slotProps={{ htmlInput: { maxLength: COMMUNITY_CHANNEL_NAME_MAX } }}
        />
        <TextField
          fullWidth
          size="small"
          label="Topic (optional)"
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
          renderInput={(params) => <TextField {...params} label="Category (optional)" />}
        />
        <Typography variant="caption" color="text.secondary">
          Who can see or post here is set under Channels, in the community settings.
        </Typography>
      </Box>
    </ResponsiveDialog>
  );
}
