import { useState } from "react";
import {
  Avatar,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { UserSelect } from "../../../../components/UserSelect";
import type { SearchedUser } from "../../../../hooks/useUserSearch";
import type { Routine } from "../../../../hooks/xenroutine/useRoutines";

interface Props {
  open: boolean;
  routine: Routine | null;
  onClose: () => void;
  onAdd: (userIds: string[]) => Promise<void> | void;
  onRemove: (userId: string) => Promise<void> | void;
}

export default function ShareDialog({ open, routine, onClose, onAdd, onRemove }: Props) {
  const [picked, setPicked] = useState<SearchedUser[]>([]);
  if (!routine) return null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Share “{routine.name}”</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          People you add can see this routine and its history, mark it done or postpone it, and get their own reminders.
          Only you can edit or delete it.
        </Typography>
        <UserSelect
          value={picked}
          onChange={setPicked}
          label="Add people"
          excludeUserIds={routine.members.map((m) => m.user_id)}
        />
        <Button
          variant="outlined"
          size="small"
          disabled={picked.length === 0}
          onClick={async () => {
            await onAdd(picked.map((u) => u._id));
            setPicked([]);
          }}
        >
          Share
        </Button>
        <List dense sx={{ mt: 1 }}>
          {routine.members.map((m) => (
            <ListItem
              key={m.user_id}
              secondaryAction={
                m.role === "owner" ? (
                  <Chip size="small" label="Owner" />
                ) : (
                  <IconButton edge="end" aria-label={`Remove ${m.username}`} onClick={() => onRemove(m.user_id)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                )
              }
            >
              <ListItemAvatar>
                <Avatar src={m.avatar || undefined} sx={{ width: 32, height: 32 }}>
                  {m.username[0]?.toUpperCase()}
                </Avatar>
              </ListItemAvatar>
              <ListItemText primary={m.username} />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
