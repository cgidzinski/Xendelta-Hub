import { useState } from "react";
import { Box, Button, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import AddReactionOutlinedIcon from "@mui/icons-material/AddReactionOutlined";
import { useSnackbar } from "notistack";
import {
  CUSTOM_EMOJI_MAX_PER_SCOPE,
  CUSTOM_EMOJI_NAME_MAX,
  type CustomEmoji,
  type CustomEmojiScope,
} from "@shared/emoji";
import { emojiOfScope, useCustomEmoji, useEmojiActions } from "../../hooks/emoji/useCustomEmoji";
import { useConfirm } from "../ui/ConfirmProvider";
import ResponsiveDialog from "../ui/ResponsiveDialog";
import AddEmojiDialog from "./AddEmojiDialog";

interface Props {
  scope: CustomEmojiScope;
  /** May this person add one? */
  canAdd: boolean;
  /** May this person rename or remove one that `createdBy` added? */
  canChange: (createdBy: string) => boolean;
}

const failure = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

/** The custom emoji of one community or chat: a list with add, rename and remove. */
export default function CustomEmojiManager({ scope, canAdd, canChange }: Props) {
  const { emoji } = useCustomEmoji();
  const { rename, remove } = useEmojiActions();
  const confirm = useConfirm();
  const { enqueueSnackbar } = useSnackbar();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CustomEmoji | undefined>();
  const [newName, setNewName] = useState("");
  const mine = emojiOfScope(emoji, scope);

  const askRemove = async (e: CustomEmoji) => {
    const ok = await confirm({
      title: `Remove :${e.name}:?`,
      message: "It stops working in messages and reactions that use it.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (ok)
      remove.mutate(e._id, {
        onError: (err) => enqueueSnackbar(failure(err, "Couldn't remove it"), { variant: "error" }),
      });
  };
  const saveName = () => {
    if (!editing) return;
    rename.mutate(
      { emojiId: editing._id, name: newName.trim().toLowerCase() },
      {
        onSuccess: () => setEditing(undefined),
        onError: (err) => enqueueSnackbar(failure(err, "Couldn't rename it"), { variant: "error" }),
      },
    );
  };

  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {mine.length} of {CUSTOM_EMOJI_MAX_PER_SCOPE}
        </Typography>
        {canAdd && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddReactionOutlinedIcon />}
            onClick={() => setAdding(true)}
            disabled={mine.length >= CUSTOM_EMOJI_MAX_PER_SCOPE}
          >
            Add emoji
          </Button>
        )}
      </Box>

      {mine.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No custom emoji yet.{canAdd ? " Add a picture and use it as :name: in messages and reactions." : ""}
        </Typography>
      ) : (
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
          {mine.map((e) => (
            <Box key={e._id} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.75 }}>
              <img src={e.url} alt="" width={32} height={32} style={{ objectFit: "contain", flexShrink: 0 }} />
              <Typography noWrap sx={{ flex: 1, minWidth: 0, fontFamily: "monospace" }}>
                :{e.name}:
              </Typography>
              {canChange(e.createdBy) && (
                <>
                  <Tooltip title="Rename">
                    <IconButton
                      size="small"
                      aria-label={`Rename ${e.name}`}
                      onClick={() => {
                        setEditing(e);
                        setNewName(e.name);
                      }}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remove">
                    <IconButton size="small" color="error" aria-label={`Remove ${e.name}`} onClick={() => askRemove(e)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Box>
          ))}
        </Stack>
      )}

      <AddEmojiDialog open={adding} onClose={() => setAdding(false)} scope={scope} />
      <ResponsiveDialog
        open={!!editing}
        onClose={() => setEditing(undefined)}
        title="Rename emoji"
        maxWidth="xs"
        actions={
          <>
            <Button onClick={() => setEditing(undefined)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={saveName}
              disabled={!editing || newName.trim().toLowerCase() === editing.name || rename.isPending}
            >
              Save
            </Button>
          </>
        }
      >
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveName()}
          slotProps={{ htmlInput: { maxLength: CUSTOM_EMOJI_NAME_MAX } }}
          sx={{ mt: 1 }}
        />
      </ResponsiveDialog>
    </Stack>
  );
}
