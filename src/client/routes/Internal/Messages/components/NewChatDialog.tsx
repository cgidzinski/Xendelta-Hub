import { useEffect, useState } from "react";
import { Alert, Button, TextField } from "@mui/material";
import { useSnackbar } from "notistack";
import { rosterKeyOf } from "@shared/chat";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import PeoplePicker from "../../../../components/PeoplePicker";
import type { SearchedUser } from "../../../../hooks/people/usePeople";
import { useChatActions, useConversations } from "../../../../hooks/chat/useChat";
import { useAuth } from "../../../../contexts/AuthContext";

interface NewChatDialogProps {
  open: boolean;
  onClose: () => void;
  onOpened: (conversationId: string) => void;
  /** Pre-select someone (a "Message" button on a person). */
  initial?: SearchedUser[];
}

/** Start a chat. One person opens the chat you already have with them; more people (or a name) start a new group. */
export default function NewChatDialog({ open, onClose, onOpened, initial }: NewChatDialogProps) {
  const [people, setPeople] = useState<SearchedUser[]>([]);
  const [name, setName] = useState("");
  const { startChat } = useChatActions();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const { conversations } = useConversations();

  useEffect(() => {
    if (open) {
      setPeople(initial ?? []);
      setName("");
    }
  }, [open, initial]);

  // With exactly one other person and no name this is their existing chat.
  const existing =
    people.length === 1 && !name.trim()
      ? conversations.find(
          (c) =>
            !c.name &&
            c.members.length === 2 &&
            rosterKeyOf(c.members.map((m) => m.user_id)) === rosterKeyOf([user.id, people[0]._id]),
        )
      : undefined;
  const isGroup = people.length > 1 || !!name.trim();

  const submit = async () => {
    try {
      const { conversation } = await startChat.mutateAsync({
        userIds: people.map((p) => p._id),
        name: name.trim() || undefined,
      });
      onClose();
      onOpened(conversation._id);
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message || e?.message || "Couldn't start the chat", { variant: "error" });
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title="New chat"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={people.length === 0 || startChat.isPending}>
            {existing || people.length === 1
              ? `Open chat with ${people[0].username}`
              : isGroup
                ? "Start group"
                : "Start chat"}
          </Button>
        </>
      }
    >
      <PeoplePicker value={people} onChange={setPeople} autoFocus />
      {people.length === 1 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          {existing
            ? `You already have a chat with ${people[0].username}. This opens it. Pick more people to start a new group.`
            : "Pick more people to start a group."}
        </Alert>
      )}
      {people.length > 1 && (
        <TextField
          sx={{ mt: 2 }}
          size="small"
          fullWidth
          label="Group name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
      )}
    </ResponsiveDialog>
  );
}
