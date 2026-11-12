import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useSnackbar } from "notistack";
import { NOTE_COLORS, type NoteColor } from "@shared/xennote/notes";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { UserSelect } from "../../../../components/UserSelect";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { useAuth } from "../../../../contexts/AuthContext";
import type { SearchedUser } from "../../../../hooks/people/usePeople";
import { notebookShareUrl, useXenNoteActions } from "../../../../hooks/xennote/useXenNote";
import type { NoteRole, XenNotebook } from "../../../../types/XenNote";
import { NOTE_COLOR_LABELS, swatchColor } from "../noteColors";
import UserName from "../../../../components/user/UserName";

interface NotebookDialogProps {
  /** The notebook to manage; null starts a new one. */
  notebook: XenNotebook | null;
  open: boolean;
  onClose: () => void;
  /** Called after the notebook is deleted or the person leaves it, so the board can step back. */
  onGone?: () => void;
  /** Which tab to open on (the board's Share button opens People). */
  initialTab?: "general" | "people" | "link";
}

const ROLE_HELP: Record<"editor" | "viewer", string> = {
  editor: "Can read, add, edit and delete notes",
  viewer: "Can read notes only",
};

/** Create a notebook, or manage one: its name and colour, who can see it, and its public link. */
export default function NotebookDialog({
  notebook,
  open,
  onClose,
  onGone,
  initialTab = "general",
}: NotebookDialogProps) {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { user } = useAuth();
  const actions = useXenNoteActions();
  const [tab, setTab] = useState<"general" | "people" | "link">("general");
  const [name, setName] = useState("");
  const [color, setColor] = useState<NoteColor>("default");
  const [picked, setPicked] = useState<SearchedUser[]>([]);
  const [newRole, setNewRole] = useState<"editor" | "viewer">("editor");

  // The notebook prop is the board's snapshot; mutations return the live copy.
  const [live, setLive] = useState<XenNotebook | null>(notebook);
  // Start fresh when the dialog opens (or is pointed at another notebook), not on every refetch of the
  // board behind it: a collaborator's live update must not throw away a half-typed name or the open tab.
  useEffect(() => {
    if (open) {
      setLive(notebook);
      setName(notebook?.name ?? "");
      setColor(notebook?.color ?? "default");
      setTab(initialTab);
      setPicked([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, notebook?._id]);

  // The people list and counts do follow the board while it is open
  useEffect(() => {
    if (open && notebook) setLive(notebook);
  }, [open, notebook]);

  const owner = !live || live.my_role === "owner";
  const err = (e: unknown) => enqueueSnackbar((e as Error)?.message || "Something went wrong", { variant: "error" });

  const saveGeneral = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      if (!live) {
        await actions.createNotebook.mutateAsync({ name: trimmed, color });
        enqueueSnackbar("Notebook created", { variant: "success" });
        onClose();
      } else {
        setLive(await actions.updateNotebook.mutateAsync({ id: live._id, name: trimmed, color }));
        enqueueSnackbar("Saved", { variant: "success" });
      }
    } catch (e) {
      err(e);
    }
  };

  const remove = async () => {
    if (!live) return;
    const ok = await confirm({
      title: `Delete "${live.name}"?`,
      message: `All ${live.note_count} notes in it are deleted for everyone, with their photos. This can't be undone.`,
      confirmLabel: "Delete notebook",
    });
    if (!ok) return;
    try {
      await actions.deleteNotebook.mutateAsync(live._id);
      enqueueSnackbar("Notebook deleted", { variant: "success" });
      onClose();
      onGone?.();
    } catch (e) {
      err(e);
    }
  };

  const addPeople = async () => {
    if (!live || picked.length === 0) return;
    try {
      setLive(await actions.addMembers.mutateAsync({ id: live._id, userIds: picked.map((p) => p._id), role: newRole }));
      setPicked([]);
    } catch (e) {
      err(e);
    }
  };

  const changeRole = async (userId: string, username: string, role: NoteRole) => {
    if (!live) return;
    if (
      role === "owner" &&
      !(await confirm({
        title: `Make ${username} the owner?`,
        message: "They'll manage people and the public link, and can delete the notebook. You'll become an editor.",
        confirmLabel: "Hand over",
        destructive: false,
      }))
    )
      return;
    try {
      setLive(await actions.setRole.mutateAsync({ id: live._id, userId, role }));
    } catch (e) {
      err(e);
    }
  };

  const removeOne = async (userId: string, username: string) => {
    if (!live) return;
    const self = userId === user?.id;
    const ok = await confirm({
      title: self ? `Leave "${live.name}"?` : `Remove ${username}?`,
      message: self
        ? "You'll lose access to its notes unless someone adds you again."
        : "They'll lose access to this notebook's notes.",
      confirmLabel: self ? "Leave" : "Remove",
    });
    if (!ok) return;
    try {
      await actions.removeMember.mutateAsync({ id: live._id, userId });
      if (self) {
        onClose();
        onGone?.();
      } else {
        setLive({ ...live, members: live.members.filter((m) => m.user_id !== userId) });
      }
    } catch (e) {
      err(e);
    }
  };

  const shareAction = async (action: "enable" | "rotate" | "disable") => {
    if (!live) return;
    try {
      setLive(await actions.shareNotebook.mutateAsync({ id: live._id, action }));
    } catch (e) {
      err(e);
    }
  };

  const shareToken = live?.share?.enabled ? live.share.token : null;

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      title={live ? live.name : "New notebook"}
      actions={<Button onClick={onClose}>Done</Button>}
    >
      {live && (
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab value="general" label="General" />
          <Tab value="people" label={`People (${live.members.length})`} />
          {owner && <Tab value="link" label="Link" />}
        </Tabs>
      )}

      {tab === "general" && (
        <Stack spacing={2}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus={!live}
            disabled={!owner}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          <Box>
            <Typography variant="caption" color="text.secondary">
              Colour
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
              {NOTE_COLORS.map((c) => (
                <IconButton
                  key={c}
                  aria-label={`${NOTE_COLOR_LABELS[c]} colour`}
                  aria-pressed={color === c}
                  disabled={!owner}
                  onClick={() => setColor(c)}
                  size="small"
                  sx={{
                    width: 28,
                    height: 28,
                    bgcolor: swatchColor(theme, c) ?? "background.paper",
                    border: 2,
                    borderColor: color === c ? "text.primary" : "divider",
                  }}
                />
              ))}
            </Box>
          </Box>
          {owner && (
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button variant="contained" onClick={saveGeneral} disabled={!name.trim()}>
                {live ? "Save" : "Create notebook"}
              </Button>
              {live && (
                <Button color="error" onClick={remove} sx={{ ml: "auto" }}>
                  Delete notebook
                </Button>
              )}
            </Box>
          )}
          {live && !owner && <Alert severity="info">Only the owner can rename or delete this notebook.</Alert>}
        </Stack>
      )}

      {live && tab === "people" && (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Everyone here sees every note in this notebook, including ones added later. Private notes stay private.
          </Typography>
          {owner && (
            <Stack spacing={1.5}>
              <UserSelect
                value={picked}
                onChange={setPicked}
                label="Add people"
                excludeUserIds={live.members.map((m) => m.user_id)}
              />
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  select
                  size="small"
                  label="As"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as "editor" | "viewer")}
                  sx={{ minWidth: 120 }}
                >
                  <MenuItem value="editor">Editor</MenuItem>
                  <MenuItem value="viewer">Viewer</MenuItem>
                </TextField>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  {ROLE_HELP[newRole]}
                </Typography>
                <Button
                  variant="contained"
                  onClick={addPeople}
                  disabled={picked.length === 0 || actions.addMembers.isPending}
                >
                  Add
                </Button>
              </Stack>
            </Stack>
          )}
          <Stack spacing={1}>
            {live.members.map((m) => {
              const self = m.user_id === user?.id;
              return (
                <Box key={m.user_id} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Avatar src={m.avatar ?? undefined} sx={{ width: 32, height: 32 }}>
                    {m.username.charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography sx={{ flex: 1 }} noWrap>
                    <UserName user={m} />
                    {self ? " (you)" : ""}
                  </Typography>
                  {owner && m.role !== "owner" ? (
                    <TextField
                      select
                      size="small"
                      value={m.role}
                      onChange={(e) => changeRole(m.user_id, m.username, e.target.value as NoteRole)}
                      sx={{ minWidth: 120 }}
                      aria-label={`Role of ${m.username}`}
                    >
                      <MenuItem value="editor">Editor</MenuItem>
                      <MenuItem value="viewer">Viewer</MenuItem>
                      <MenuItem value="owner">Owner</MenuItem>
                    </TextField>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ textTransform: "capitalize" }}>
                      {m.role}
                    </Typography>
                  )}
                  {((owner && m.role !== "owner") || (self && m.role !== "owner")) && (
                    <Button size="small" color="error" onClick={() => removeOne(m.user_id, m.username)}>
                      {self ? "Leave" : "Remove"}
                    </Button>
                  )}
                </Box>
              );
            })}
          </Stack>
        </Stack>
      )}

      {live && tab === "link" && owner && (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            A public link lets anyone with it read this notebook's notes. They can't change anything or see who is in
            it.
          </Typography>
          {shareToken ? (
            <>
              <TextField
                fullWidth
                label="Link"
                value={notebookShareUrl(shareToken)}
                slotProps={{
                  input: {
                    readOnly: true,
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="Copy link"
                          edge="end"
                          onClick={() => {
                            navigator.clipboard.writeText(notebookShareUrl(shareToken));
                            enqueueSnackbar("Link copied", { variant: "success" });
                          }}
                        >
                          <ContentCopyIcon />
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button variant="outlined" onClick={() => shareAction("rotate")}>
                  Make a new link
                </Button>
                <Button variant="outlined" color="error" onClick={() => shareAction("disable")}>
                  Stop sharing
                </Button>
              </Box>
            </>
          ) : (
            <Box>
              <Button variant="contained" onClick={() => shareAction("enable")}>
                Create link
              </Button>
            </Box>
          )}
        </Stack>
      )}
    </ResponsiveDialog>
  );
}
