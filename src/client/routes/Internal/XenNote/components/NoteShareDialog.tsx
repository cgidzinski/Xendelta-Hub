import { useState } from "react";
import { Alert, Box, Button, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LinkIcon from "@mui/icons-material/Link";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useSnackbar } from "notistack";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import SectionLabel from "../../../../components/ui/SectionLabel";
import { UserSelect } from "../../../../components/UserSelect";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { useAuth } from "../../../../contexts/AuthContext";
import type { SearchedUser } from "../../../../hooks/people/usePeople";
import { noteShareUrl, useXenNoteActions, useXenNoteSharing } from "../../../../hooks/xennote/useXenNote";
import UserAvatar from "../../../../components/user/UserAvatar";
import UserName from "../../../../components/user/UserName";

interface NoteShareDialogProps {
  /** The note to share; null keeps the dialog closed. */
  noteId: string | null;
  onClose: () => void;
}

const ROLE_HELP: Record<"editor" | "viewer", string> = {
  editor: "Can read and change this note",
  viewer: "Can read this note only",
};

/** Who can open a note: chosen people (as editors or viewers), and optionally anyone who has its link. */
export default function NoteShareDialog({ noteId, onClose }: NoteShareDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { user } = useAuth();
  const actions = useXenNoteActions();
  const { data, isLoading } = useXenNoteSharing(noteId ?? undefined);
  const [picked, setPicked] = useState<SearchedUser[]>([]);
  const [role, setRole] = useState<"editor" | "viewer">("viewer");

  const err = (e: unknown) => enqueueSnackbar((e as Error)?.message || "Something went wrong", { variant: "error" });
  const manage = !!data?.can_manage;
  const token = data?.share?.enabled ? data.share.token : null;

  const addPeople = async () => {
    if (!noteId || picked.length === 0) return;
    try {
      await actions.addNoteMembers.mutateAsync({ id: noteId, userIds: picked.map((p) => p._id), role });
      setPicked([]);
    } catch (e) {
      err(e);
    }
  };
  const changeRole = async (userId: string, next: "editor" | "viewer") => {
    if (!noteId) return;
    try {
      await actions.setNoteMemberRole.mutateAsync({ id: noteId, userId, role: next });
    } catch (e) {
      err(e);
    }
  };
  const removeOne = async (userId: string, username: string) => {
    if (!noteId) return;
    const self = userId === user?.id;
    const ok = await confirm({
      title: self ? "Leave this note?" : `Stop sharing with ${username}?`,
      message: self ? "It will disappear from your notes." : "They won't be able to open this note any more.",
      confirmLabel: self ? "Leave" : "Remove",
    });
    if (!ok) return;
    try {
      await actions.removeNoteMember.mutateAsync({ id: noteId, userId });
      if (self) onClose();
    } catch (e) {
      err(e);
    }
  };
  const linkAction = async (action: "enable" | "rotate" | "disable") => {
    if (!noteId) return;
    if (action !== "enable") {
      const ok = await confirm(
        action === "disable"
          ? {
              title: "Stop sharing the link?",
              message: "The link stops working right away.",
              confirmLabel: "Stop sharing",
            }
          : { title: "Make a new link?", message: "The old link stops working.", confirmLabel: "Make a new link" },
      );
      if (!ok) return;
    }
    try {
      await actions.shareNote.mutateAsync({ id: noteId, action });
    } catch (e) {
      err(e);
    }
  };

  const person = (p: { user_id: string; username: string; avatar: string | null }) => (
    <>
      <UserAvatar user={p} sx={{ width: 32, height: 32 }}>
        {p.username.charAt(0).toUpperCase()}
      </UserAvatar>
      <Typography sx={{ flex: 1 }} noWrap>
        <UserName user={p} />
        {p.user_id === user?.id ? " (you)" : ""}
      </Typography>
    </>
  );

  return (
    <ResponsiveDialog
      open={!!noteId}
      onClose={onClose}
      maxWidth="sm"
      title="Share"
      actions={<Button onClick={onClose}>Done</Button>}
    >
      {isLoading || !data ? (
        <Typography color="text.secondary">Loading…</Typography>
      ) : (
        <Stack spacing={2.5}>
          <Box>
            <SectionLabel>People with access</SectionLabel>
            {manage && (
              <Stack spacing={1.5} sx={{ mb: 2 }}>
                <UserSelect
                  value={picked}
                  onChange={setPicked}
                  label="Add people"
                  excludeUserIds={[data.owner.user_id, ...data.members.map((m) => m.user_id)]}
                />
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <TextField
                    select
                    size="small"
                    label="As"
                    value={role}
                    onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                    sx={{ minWidth: 120 }}
                  >
                    <MenuItem value="viewer">Viewer</MenuItem>
                    <MenuItem value="editor">Editor</MenuItem>
                  </TextField>
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                    {ROLE_HELP[role]}
                  </Typography>
                  <Button
                    variant="contained"
                    onClick={addPeople}
                    disabled={picked.length === 0 || actions.addNoteMembers.isPending}
                  >
                    Add
                  </Button>
                </Stack>
              </Stack>
            )}
            <Stack spacing={1}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                {person(data.owner)}
                <Typography variant="body2" color="text.secondary">
                  Owner
                </Typography>
              </Box>
              {data.members.map((m) => {
                const self = m.user_id === user?.id;
                return (
                  <Box key={m.user_id} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    {person(m)}
                    {manage ? (
                      <TextField
                        select
                        size="small"
                        value={m.role}
                        onChange={(e) => changeRole(m.user_id, e.target.value as "editor" | "viewer")}
                        sx={{ minWidth: 120 }}
                        slotProps={{ htmlInput: { "aria-label": `Role of ${m.username}` } }}
                      >
                        <MenuItem value="viewer">Viewer</MenuItem>
                        <MenuItem value="editor">Editor</MenuItem>
                      </TextField>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ textTransform: "capitalize" }}>
                        {m.role}
                      </Typography>
                    )}
                    {(manage || self) && (
                      <Button size="small" color="error" onClick={() => removeOne(m.user_id, m.username)}>
                        {self && !manage ? "Leave" : "Remove"}
                      </Button>
                    )}
                  </Box>
                );
              })}
            </Stack>
            {data.notebook && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
                Everyone in the notebook “{data.notebook.name}” can also open this note.
              </Typography>
            )}
          </Box>

          {manage ? (
            <Box>
              <SectionLabel>General access</SectionLabel>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                {token ? <LinkIcon color="primary" /> : <LockOutlinedIcon color="action" />}
                <TextField
                  select
                  size="small"
                  value={token ? "link" : "people"}
                  onChange={(e) => linkAction(e.target.value === "link" ? "enable" : "disable")}
                  disabled={actions.shareNote.isPending}
                  sx={{ flex: 1 }}
                  slotProps={{ htmlInput: { "aria-label": "General access" } }}
                >
                  <MenuItem value="people">Only the people above</MenuItem>
                  <MenuItem value="link">Anyone with the link</MenuItem>
                </TextField>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                {token
                  ? "Anyone who has the link can read this note. They can't change it."
                  : "Nobody else can open it."}
              </Typography>
              {token && (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mt: 1.5 }}>
                  <TextField
                    size="small"
                    value={noteShareUrl(token)}
                    slotProps={{ input: { readOnly: true } }}
                    sx={{ flex: 1, minWidth: 200 }}
                  />
                  <Tooltip title="Copy link">
                    <IconButton
                      aria-label="Copy link"
                      onClick={() => {
                        navigator.clipboard.writeText(noteShareUrl(token));
                        enqueueSnackbar("Link copied", { variant: "success" });
                      }}
                    >
                      <ContentCopyIcon />
                    </IconButton>
                  </Tooltip>
                  <Button size="small" onClick={() => linkAction("rotate")}>
                    New link
                  </Button>
                </Stack>
              )}
            </Box>
          ) : (
            <Alert severity="info" variant="outlined">
              Only the person who owns this note can change who it is shared with.
            </Alert>
          )}
        </Stack>
      )}
    </ResponsiveDialog>
  );
}
