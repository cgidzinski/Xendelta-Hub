import { useEffect, useState } from "react";
import { Alert, Box, Button, InputAdornment, MenuItem, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useSnackbar } from "notistack";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { UserSelect } from "../../../../components/UserSelect";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { useAuth } from "../../../../contexts/AuthContext";
import type { SearchedUser } from "../../../../hooks/people/usePeople";
import { noteShareUrl, useXenNoteActions, useXenNoteSharing } from "../../../../hooks/xennote/useXenNote";
import type { XenNoteSharing } from "../../../../types/XenNote";
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
  const [tab, setTab] = useState<"people" | "link">("people");
  // Each time the dialog opens it starts on People.
  useEffect(() => {
    if (noteId) setTab("people");
  }, [noteId]);

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

  const person = (p: { user_id: string; username: string; avatar: string | null }, sub: string) => (
    <>
      <UserAvatar user={p} sx={{ width: 36, height: 36, flex: "none" }}>
        {p.username.charAt(0).toUpperCase()}
      </UserAvatar>
      <Box sx={{ flex: "1 1 180px", minWidth: 0 }}>
        <Typography sx={{ fontWeight: 500, overflowWrap: "anywhere" }}>
          <UserName user={p} />
          {p.user_id === user?.id ? " (you)" : ""}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {sub}
        </Typography>
      </Box>
    </>
  );
  // One row per person. The name block shrinks and truncates; the role and Remove never do, and on a phone they wrap
  // under the name instead of running off the edge.
  const row = (key: string, who: React.ReactNode, controls?: React.ReactNode) => (
    <Box key={key} sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5, py: 1, minHeight: 56 }}>
      {who}
      {controls && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: "none", ml: "auto" }}>{controls}</Box>
      )}
    </Box>
  );

  // Built from the loaded data, so nothing reads it while the request is still in flight.
  const renderPeopleTab = (d: XenNoteSharing) => (
    <Stack spacing={2.5}>
      {manage && (
        <Stack spacing={1.5}>
          <UserSelect
            value={picked}
            onChange={setPicked}
            label="Add people"
            excludeUserIds={[d.owner.user_id, ...d.members.map((m) => m.user_id)]}
          />
          <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
            <TextField
              select
              size="small"
              label="As"
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              sx={{ width: 130 }}
            >
              <MenuItem value="viewer">Viewer</MenuItem>
              <MenuItem value="editor">Editor</MenuItem>
            </TextField>
            <Typography variant="caption" color="text.secondary" sx={{ flex: "1 1 200px" }}>
              {ROLE_HELP[role]}
            </Typography>
            <Button
              variant="contained"
              onClick={addPeople}
              disabled={picked.length === 0 || actions.addNoteMembers.isPending}
            >
              Add
            </Button>
          </Box>
        </Stack>
      )}
      <Box>
        {row("owner", person(d.owner, "Owner"))}
        {d.members.map((m) => {
          return row(
            m.user_id,
            person(m, m.role === "editor" ? "Editor" : "Viewer"),
            manage ? (
              <>
                {manage && (
                  <TextField
                    select
                    size="small"
                    value={m.role}
                    onChange={(e) => changeRole(m.user_id, e.target.value as "editor" | "viewer")}
                    sx={{ width: 130 }}
                    slotProps={{ htmlInput: { "aria-label": `Role of ${m.username}` } }}
                  >
                    <MenuItem value="viewer">Viewer</MenuItem>
                    <MenuItem value="editor">Editor</MenuItem>
                  </TextField>
                )}
                <Button size="small" color="error" onClick={() => removeOne(m.user_id, m.username)}>
                  Remove
                </Button>
              </>
            ) : undefined,
          );
        })}
        {manage && d.members.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>
            Only you can open this note. Add someone above to share it.
          </Typography>
        )}
      </Box>
      {d.notebook && (
        <Typography variant="caption" color="text.secondary">
          Everyone in the notebook “{d.notebook.name}” can also open this note.
        </Typography>
      )}
    </Stack>
  );

  const linkTab = manage ? (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        {token ? <LinkIcon color="primary" /> : <LockOutlinedIcon color="action" />}
        <TextField
          select
          size="small"
          value={token ? "link" : "people"}
          onChange={(e) => linkAction(e.target.value === "link" ? "enable" : "disable")}
          disabled={actions.shareNote.isPending}
          sx={{ flex: 1, maxWidth: 320 }}
          slotProps={{ htmlInput: { "aria-label": "General access" } }}
        >
          <MenuItem value="people">Only the people added</MenuItem>
          <MenuItem value="link">Anyone with the link</MenuItem>
        </TextField>
      </Box>
      <Typography variant="body2" color="text.secondary">
        {token
          ? "Anyone who has the link can read this note. They can't change it."
          : "Nobody else can open it. Turn on the link to share without adding people."}
      </Typography>
      {token && (
        <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
          <TextField
            fullWidth
            size="small"
            value={noteShareUrl(token)}
            onFocus={(e) => e.target.select()}
            slotProps={{
              htmlInput: { "aria-label": "Link" },
              input: {
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <Button
                      size="small"
                      onClick={() => {
                        navigator.clipboard.writeText(noteShareUrl(token));
                        enqueueSnackbar("Link copied", { variant: "success" });
                      }}
                    >
                      Copy
                    </Button>
                  </InputAdornment>
                ),
              },
            }}
          />
          <Button size="small" onClick={() => linkAction("rotate")}>
            Make a new link
          </Button>
        </Stack>
      )}
    </Stack>
  ) : (
    <Alert severity="info" variant="outlined">
      Only the person who owns this note can change who it is shared with.
    </Alert>
  );

  const leaveSelf = data?.members.find((m) => m.user_id === user?.id);

  return (
    <ResponsiveDialog
      open={!!noteId}
      onClose={onClose}
      maxWidth={false}
      slotProps={{ paper: { sx: { maxWidth: 680 } } }}
      title="Share"
      actions={
        <>
          {!manage && leaveSelf && (
            <Button color="error" onClick={() => removeOne(leaveSelf.user_id, leaveSelf.username)}>
              Leave this note
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      {isLoading || !data ? (
        <Typography color="text.secondary">Loading…</Typography>
      ) : (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2.5, borderBottom: 1, borderColor: "divider" }}>
            <Tab value="people" label={`People (${data.members.length + 1})`} />
            <Tab
              value="link"
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  Link
                  {token && (
                    <Box aria-label="On" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "success.main" }} />
                  )}
                </Box>
              }
            />
          </Tabs>
          <Box sx={{ minHeight: 280 }}>{tab === "people" ? renderPeopleTab(data) : linkTab}</Box>
        </>
      )}
    </ResponsiveDialog>
  );
}
