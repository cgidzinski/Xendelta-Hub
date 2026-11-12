import { useEffect, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloseIcon from "@mui/icons-material/Close";
import { useSnackbar } from "notistack";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import { UserSelect } from "../../../../components/UserSelect";
import type { SearchedUser } from "../../../../hooks/useUserSearch";
import { useAuth } from "../../../../contexts/AuthContext";
import {
  bookShareUrlFor,
  useAddKitchenBookMembers,
  useDeleteKitchenBook,
  useRemoveKitchenBookMember,
  useSetKitchenBookRole,
  useShareKitchenBook,
  useUpdateKitchenBook,
  type BookRole,
  type KitchenBook,
} from "../../../../hooks/xenkitchen/useKitchen";
import { AppearancePicker } from "./CategoryDialog";
import UserName from "../../../../components/user/UserName";

export const ROLE_LABELS: Record<BookRole, { label: string; help: string }> = {
  owner: { label: "Owner", help: "Manages people, the public link, and can delete the book" },
  editor: { label: "Editor", help: "Adds and edits recipes and categories" },
  viewer: { label: "Viewer", help: "Can read and copy recipes, and star favorites" },
};

type TabKey = "general" | "people" | "link";

interface Props {
  book: KitchenBook | null;
  open: boolean;
  onClose: () => void;
  initialTab?: TabKey;
  /** Called after leaving or deleting, so the page can switch away from the book. */
  onGone?: () => void;
}

export default function BookDialog({ book, open, onClose, initialTab = "general", onGone }: Props) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const [tab, setTab] = useState<TabKey>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  if (!book) return null;
  const owner = book.my_role === "owner";

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle sx={{ fontWeight: 700, pb: 0 }}>{book.name}</DialogTitle>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ px: 2, borderBottom: "1px solid", borderColor: "divider" }}
      >
        <Tab value="general" label="General" />
        <Tab value="people" label={`People (${book.members.length})`} />
        {owner && <Tab value="link" label="Public link" />}
      </Tabs>
      <DialogContent sx={{ minHeight: 320 }}>
        {tab === "general" && (
          <GeneralTab
            book={book}
            onGone={() => {
              onClose();
              onGone?.();
            }}
          />
        )}
        {tab === "people" && (
          <PeopleTab
            book={book}
            onGone={() => {
              onClose();
              onGone?.();
            }}
          />
        )}
        {tab === "link" && owner && <LinkTab book={book} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}

function GeneralTab({ book, onGone }: { book: KitchenBook; onGone: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const update = useUpdateKitchenBook();
  const remove = useDeleteKitchenBook();
  const owner = book.my_role === "owner";
  const [name, setName] = useState(book.name);
  const [description, setDescription] = useState(book.description);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    setName(book.name);
    setDescription(book.description);
  }, [book._id, book.name, book.description]);

  const save = (patch: Parameters<typeof update.mutate>[0]["patch"]) =>
    update.mutate({ id: book._id, patch }, { onError: () => enqueueSnackbar("Couldn't save", { variant: "error" }) });

  if (!owner) {
    return (
      <Stack spacing={1.5} sx={{ pt: 2 }}>
        <Typography variant="body2">{book.description || "No description."}</Typography>
        <Typography variant="body2" color="text.secondary">
          You're {book.my_role === "editor" ? "an editor" : "a viewer"} here. {ROLE_LABELS[book.my_role].help}. Only the
          owner can rename or delete the book.
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={2.5} sx={{ pt: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <AppearancePicker icon={book.icon} color={book.color} onChange={save} />
        <TextField
          label="Name"
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const n = name.trim();
            if (n && n !== book.name) save({ name: n });
            else setName(book.name);
          }}
          slotProps={{ htmlInput: { maxLength: 60 } }}
        />
      </Stack>
      <TextField
        label="Description"
        fullWidth
        multiline
        minRows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => {
          if (description !== book.description) save({ description });
        }}
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />

      <Card variant="outlined" sx={{ ...cardSx, p: 2, borderColor: "error.main" }}>
        <Typography variant="subtitle2" color="error" sx={{ mb: 0.5 }}>
          Delete this book
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Deletes its {book.item_count} item{book.item_count === 1 ? "" : "s"} and their photos for everyone in it. Type
          the book's name to confirm.
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField
            size="small"
            placeholder={book.name}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            fullWidth
          />
          <Button
            color="error"
            variant="contained"
            disabled={confirmText.trim() !== book.name || deleting}
            onClick={async () => {
              setDeleting(true);
              try {
                await remove.mutateAsync(book._id);
                enqueueSnackbar("Book deleted", { variant: "success" });
                onGone();
              } catch {
                enqueueSnackbar("Couldn't delete the book", { variant: "error" });
              } finally {
                setDeleting(false);
              }
            }}
          >
            Delete
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}

function PeopleTab({ book, onGone }: { book: KitchenBook; onGone: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { user } = useAuth();
  const add = useAddKitchenBookMembers();
  const setRole = useSetKitchenBookRole();
  const remove = useRemoveKitchenBookMember();
  const [picked, setPicked] = useState<SearchedUser[]>([]);
  const [newRole, setNewRole] = useState<"editor" | "viewer">("editor");
  const owner = book.my_role === "owner";
  const err = (e: any) => enqueueSnackbar(e?.response?.data?.message ?? "Something went wrong", { variant: "error" });

  const changeRole = async (userId: string, username: string, role: BookRole) => {
    if (
      role === "owner" &&
      !(await confirm({
        title: `Make ${username} the owner?`,
        message: "They'll manage people and the public link and can delete the book. You'll become an editor.",
        confirmLabel: "Hand over",
        destructive: false,
      }))
    )
      return;
    setRole.mutate({ id: book._id, userId, role }, { onError: err });
  };

  const removeOne = async (userId: string, username: string) => {
    const self = userId === user?.id;
    if (
      !(await confirm({
        title: self ? `Leave "${book.name}"?` : `Remove ${username}?`,
        message: self
          ? "You'll lose access to its recipes unless someone adds you again."
          : "They'll lose access to this book's recipes.",
        confirmLabel: self ? "Leave" : "Remove",
      }))
    )
      return;
    remove.mutate(
      { id: book._id, userId },
      {
        onSuccess: () => {
          if (self) {
            enqueueSnackbar("You left the book", { variant: "success" });
            onGone();
          }
        },
        onError: err,
      },
    );
  };

  return (
    <Box sx={{ pt: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Everyone here sees every recipe in this book, including ones added later. Favorites stay personal.
      </Typography>

      {owner && (
        <Card variant="outlined" sx={{ ...cardSx, p: 2, mb: 2 }}>
          <Stack spacing={1.5}>
            <UserSelect
              value={picked}
              onChange={setPicked}
              label="Add people"
              excludeUserIds={book.members.map((m) => m.user_id)}
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                select
                size="small"
                label="As"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "editor" | "viewer")}
                sx={{ minWidth: 140 }}
              >
                <MenuItem value="editor">Editor</MenuItem>
                <MenuItem value="viewer">Viewer</MenuItem>
              </TextField>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                {ROLE_LABELS[newRole].help}
              </Typography>
              <Button
                variant="contained"
                disabled={!picked.length || add.isPending}
                onClick={() =>
                  add.mutate(
                    { id: book._id, userIds: picked.map((u) => u._id), role: newRole },
                    {
                      onSuccess: () => {
                        setPicked([]);
                        enqueueSnackbar("Added — they'll get a notification", { variant: "success" });
                      },
                      onError: err,
                    },
                  )
                }
              >
                Add
              </Button>
            </Stack>
          </Stack>
        </Card>
      )}

      <List dense disablePadding>
        {book.members.map((m) => {
          const self = m.user_id === user?.id;
          return (
            <ListItem
              key={m.user_id}
              disableGutters
              secondaryAction={
                <Stack direction="row" spacing={0.5} alignItems="center">
                  {owner && m.role !== "owner" ? (
                    <TextField
                      select
                      size="small"
                      value={m.role}
                      onChange={(e) => changeRole(m.user_id, m.username, e.target.value as BookRole)}
                      sx={{ minWidth: 110 }}
                      slotProps={{ htmlInput: { "aria-label": `Role for ${m.username}` } }}
                    >
                      <MenuItem value="editor">Editor</MenuItem>
                      <MenuItem value="viewer">Viewer</MenuItem>
                      <MenuItem value="owner">Make owner</MenuItem>
                    </TextField>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
                      {ROLE_LABELS[m.role].label}
                    </Typography>
                  )}
                  {m.role !== "owner" && (owner || self) && (
                    <Tooltip title={self ? "Leave book" : "Remove"}>
                      <IconButton
                        size="small"
                        onClick={() => removeOne(m.user_id, m.username)}
                        aria-label={self ? "Leave book" : `Remove ${m.username}`}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              }
            >
              <ListItemAvatar>
                <Avatar src={m.avatar || undefined} sx={{ width: 36, height: 36 }}>
                  {m.username[0]?.toUpperCase()}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <>
                    <UserName user={m} />
                    {self && " (you)"}
                  </>
                }
              />
            </ListItem>
          );
        })}
      </List>

      {!owner && (
        <Button color="error" sx={{ mt: 2 }} onClick={() => user && removeOne(user.id, user.username ?? "")}>
          Leave this book
        </Button>
      )}
    </Box>
  );
}

function LinkTab({ book }: { book: KitchenBook }) {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const share = useShareKitchenBook();
  const url = book.share.token ? bookShareUrlFor(book.share.token) : "";
  const run = (action: "enable" | "disable" | "rotate") =>
    share.mutate(
      { id: book._id, action },
      {
        onSuccess: () => {
          if (action === "rotate")
            enqueueSnackbar("New link made — the old one no longer works", { variant: "success" });
        },
        onError: () => enqueueSnackbar("Couldn't update the link", { variant: "error" }),
      },
    );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      enqueueSnackbar("Link copied", { variant: "success" });
    } catch {
      enqueueSnackbar("Couldn't copy — select the link and copy it", { variant: "warning" });
    }
  };

  return (
    <Box sx={{ pt: 2 }}>
      <FormControlLabel
        control={
          <Switch
            checked={book.share.enabled}
            disabled={share.isPending}
            onChange={(e) => run(e.target.checked ? "enable" : "disable")}
          />
        }
        label="Anyone with the link can browse this book"
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        A read-only page of every recipe in the book — no account needed. To let someone add or edit, add them under
        People instead.
      </Typography>
      {book.share.enabled && url && (
        <Stack spacing={1.5}>
          <TextField
            value={url}
            fullWidth
            size="small"
            onFocus={(e) => e.target.select()}
            slotProps={{
              input: {
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton edge="end" onClick={copy} aria-label="Copy link">
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <Stack direction="row" spacing={1}>
            <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={copy}>
              Copy link
            </Button>
            <Button
              color="inherit"
              startIcon={<RefreshIcon />}
              onClick={async () => {
                if (
                  await confirm({
                    title: "Reset the link?",
                    message: "Anyone with the current link will lose access.",
                    confirmLabel: "Reset link",
                  })
                )
                  run("rotate");
              }}
            >
              Reset link
            </Button>
          </Stack>
        </Stack>
      )}
    </Box>
  );
}
