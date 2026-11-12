import { useEffect, useState } from "react";
import { Alert, Button } from "@mui/material";
import { useSnackbar } from "notistack";
import type { ChatConversation } from "@shared/chat";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import PeoplePicker from "../../../../components/PeoplePicker";
import type { SearchedUser } from "../../../../hooks/people/usePeople";
import { useChatActions } from "../../../../hooks/chat/useChat";

interface AddPeopleDialogProps {
  open: boolean;
  onClose: () => void;
  conversation: ChatConversation;
}

/** Add people to a chat. Anyone added can read the whole history, and the dialog says so. */
export default function AddPeopleDialog({ open, onClose, conversation }: AddPeopleDialogProps) {
  const [people, setPeople] = useState<SearchedUser[]>([]);
  const { addMembers } = useChatActions();
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    if (open) setPeople([]);
  }, [open]);

  const submit = async () => {
    try {
      await addMembers.mutateAsync({ conversationId: conversation._id, userIds: people.map((p) => p._id) });
      onClose();
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message || e?.message || "Couldn't add them", { variant: "error" });
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title="Add people"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={people.length === 0 || addMembers.isPending}>
            {people.length > 0 ? `Add ${people.length} ${people.length === 1 ? "person" : "people"}` : "Add"}
          </Button>
        </>
      }
    >
      <PeoplePicker
        value={people}
        onChange={setPeople}
        excludeIds={conversation.members.map((m) => m.user_id)}
        autoFocus
      />
      <Alert severity="warning" sx={{ mt: 2 }}>
        They&apos;ll see the whole conversation, including messages from before they joined.
        {conversation.members.length === 2 && !conversation.name ? " This chat becomes a group." : ""}
      </Alert>
    </ResponsiveDialog>
  );
}
