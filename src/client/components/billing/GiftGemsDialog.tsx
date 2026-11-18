import { useEffect, useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import { GIFT_NOTE_MAX, formatWholeGems } from "@shared/billing";
import ResponsiveDialog from "../ui/ResponsiveDialog";
import { useConfirm } from "../ui/ConfirmProvider";
import { useGiftGems } from "../../hooks/billing/useGiftGems";
import { useUserProfile } from "../../hooks/user/useUserProfile";
import type { SearchedUser } from "../../hooks/people/usePeople";
import { UserSelect } from "../UserSelect";

interface GiftGemsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Who the gems go to. Leave it out to let the person choose (from the Inventory). */
  person?: { _id: string; username: string };
}

/** Give some of your gems to another person, with an optional note. It asks once more before sending: gifts can't be undone. */
export default function GiftGemsDialog({ open, onClose, person: fixedPerson }: GiftGemsDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { profile } = useUserProfile();
  const gift = useGiftGems();
  const [chosen, setChosen] = useState<SearchedUser[]>([]);
  const person = fixedPerson ?? chosen[0];
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  // Start clean each time it opens, so a second gift doesn't keep the last person.
  useEffect(() => {
    if (open) setChosen([]);
  }, [open]);
  const gems = Number(amount);
  const have = profile?.gems ?? 0;
  const problem =
    amount === ""
      ? null
      : !Number.isInteger(gems) || gems < 1
        ? "Give whole gems, at least 1"
        : gems > have
          ? `You have ${formatWholeGems(have)}`
          : null;

  const submit = async () => {
    if (!person) return;
    const ok = await confirm({
      title: "Give gems",
      message: `Give ${formatWholeGems(gems)} to ${person.username}? Gifts can't be taken back.`,
      confirmLabel: "Give",
      destructive: false,
    });
    if (!ok) return;
    try {
      await gift.mutateAsync({ toUserId: person._id, gems, note: note.trim() || undefined });
      enqueueSnackbar(`Gave ${formatWholeGems(gems)} to ${person.username}`, { variant: "success" });
      setAmount("");
      setNote("");
      setChosen([]);
      onClose();
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't give gems", { variant: "error" });
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title={person ? `Give gems to ${person.username}` : "Give gems"}
      maxWidth="xs"
      fullWidth
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" disabled={!person || !amount || !!problem || gift.isPending} onClick={submit}>
            Give
          </Button>
        </>
      }
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The gems move from your balance to theirs. It is a handy way to pay a friend back.
      </Typography>
      {!fixedPerson && (
        <Box sx={{ mb: 2 }}>
          <UserSelect
            value={chosen}
            onChange={(users) => setChosen(users.slice(-1))}
            excludeUserIds={profile ? [profile._id] : []}
            label="Who to give them to"
            placeholder="Search for a person..."
          />
        </Box>
      )}
      <TextField
        autoFocus={!!fixedPerson}
        fullWidth
        label="Gems"
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={!!problem}
        helperText={problem ?? `You have ${formatWholeGems(have)}`}
        slotProps={{ htmlInput: { min: 1, step: 1, inputMode: "numeric" } }}
        sx={{ mb: 2 }}
      />
      <TextField
        fullWidth
        label="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, GIFT_NOTE_MAX))}
        helperText={`${note.length}/${GIFT_NOTE_MAX}`}
      />
    </ResponsiveDialog>
  );
}
