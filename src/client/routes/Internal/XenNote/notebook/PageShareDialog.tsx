import { useState } from "react";
import { Box, Button, InputAdornment, MenuItem, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { UserSelect } from "../../../../components/UserSelect";
import UserAvatar from "../../../../components/user/UserAvatar";
import UserName from "../../../../components/user/UserName";
import { useAuth } from "../../../../contexts/AuthContext";
import { usePagePeople, usePageSharingActions } from "../../../../hooks/xennote/usePageSharing";
import type { SearchedUser } from "../../../../hooks/people/usePeople";

type Role = "editor" | "viewer";

export default function PageShareDialog({
  pageId,
  title,
  onClose,
  onLeave,
}: {
  pageId: string;
  title: string;
  onClose: () => void;
  onLeave: () => void;
}) {
  const { data, isPending, error, refetch } = usePagePeople(pageId);
  const actions = usePageSharingActions(pageId);
  const confirm = useConfirm();
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState<"people" | "link">("people");
  const [picked, setPicked] = useState<SearchedUser[]>([]);
  const [role, setRole] = useState<Role>("viewer");
  const token = data?.token;
  const shareUrl = token ? `${window.location.origin}/n/p/${token}` : "";
  const busy = actions.add.isPending || actions.change.isPending || actions.remove.isPending || actions.share.isPending;
  const fail = (e: Error) => enqueueSnackbar(e.message || "Couldn't change sharing", { variant: "error" });

  const remove = async (userId: string, username: string) => {
    const self = userId === user?.id;
    const ok = await confirm({
      title: self ? "Leave this page?" : `Stop sharing with ${username}?`,
      message: self ? "You'll lose direct access to this page." : "They'll lose direct access to this page.",
      confirmLabel: self ? "Leave" : "Remove",
    });
    if (!ok) return;
    actions.remove.mutate(userId, {
      onError: fail,
      onSuccess: (remaining) => {
        if (self && !remaining) onLeave();
      },
    });
  };

  const changeLink = async (action: "enable" | "disable" | "rotate") => {
    if (action !== "enable") {
      const ok = await confirm({
        title: action === "rotate" ? "Make a new link?" : "Stop sharing the link?",
        message: "The current link will stop working.",
        confirmLabel: action === "rotate" ? "Make a new link" : "Stop sharing",
      });
      if (!ok) return;
    }
    actions.share.mutate(action, { onError: fail });
  };

  const self = data?.members.find((member) => member.user_id === user?.id);
  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      title={`Share “${title}”`}
      fullWidth
      maxWidth="sm"
      actions={
        <>
          {self && !data?.can_manage && (
            <Button color="error" disabled={busy} onClick={() => void remove(self.user_id, self.username)}>
              Leave this page
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      {isPending ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <ErrorDisplay error={error} title="Couldn't load sharing" onRetry={() => refetch()} />
      ) : (
        data && (
          <>
            {data.can_manage && (
              <Tabs
                value={tab}
                onChange={(_, value) => setTab(value)}
                aria-label="Share options"
                sx={{ mb: 2.5, borderBottom: 1, borderColor: "divider" }}
              >
                <Tab value="people" label="People" />
                <Tab value="link" label="Link" />
              </Tabs>
            )}
            {tab === "link" && data.can_manage ? (
              <Stack spacing={2}>
                <TextField
                  select
                  size="small"
                  label="General access"
                  value={token ? "link" : "people"}
                  disabled={busy}
                  onChange={(e) => void changeLink(e.target.value === "link" ? "enable" : "disable")}
                >
                  <MenuItem value="people">Only people with access</MenuItem>
                  <MenuItem value="link">Anyone with the link</MenuItem>
                </TextField>
                {token && (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Anyone with this link can read this page.
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      value={shareUrl}
                      onFocus={(e) => e.target.select()}
                      slotProps={{
                        htmlInput: { "aria-label": "Public link" },
                        input: {
                          readOnly: true,
                          endAdornment: (
                            <InputAdornment position="end">
                              <Button
                                size="small"
                                onClick={() => {
                                  void navigator.clipboard
                                    .writeText(shareUrl)
                                    .then(() => enqueueSnackbar("Link copied", { variant: "success" }), fail);
                                }}
                              >
                                Copy
                              </Button>
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                    <Button
                      size="small"
                      disabled={busy}
                      onClick={() => void changeLink("rotate")}
                      sx={{ alignSelf: "start" }}
                    >
                      Make a new link
                    </Button>
                  </>
                )}
              </Stack>
            ) : (
              <Stack spacing={2}>
                {data.can_manage && (
                  <>
                    <UserSelect
                      value={picked}
                      onChange={setPicked}
                      label="Add people"
                      excludeUserIds={[...(user?.id ? [user.id] : []), ...data.members.map((m) => m.user_id)]}
                    />
                    <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
                      <TextField
                        select
                        size="small"
                        label="As"
                        value={role}
                        onChange={(e) => setRole(e.target.value as Role)}
                        sx={{ width: 130 }}
                      >
                        <MenuItem value="viewer">Viewer</MenuItem>
                        <MenuItem value="editor">Editor</MenuItem>
                      </TextField>
                      <Typography variant="caption" color="text.secondary" sx={{ flex: "1 1 170px" }}>
                        {role === "editor"
                          ? "Can edit this page and its sub-pages."
                          : "Can read this page and its sub-pages."}
                      </Typography>
                      <Button
                        variant="contained"
                        disabled={!picked.length || busy}
                        onClick={() => {
                          actions.add.mutate(
                            { userIds: picked.map((p) => p._id), role },
                            { onSuccess: () => setPicked([]), onError: fail },
                          );
                        }}
                      >
                        Add
                      </Button>
                    </Box>
                  </>
                )}
                {data.members.map((m) => (
                  <Box
                    key={m.user_id}
                    sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5, py: 1 }}
                  >
                    <UserAvatar user={m} sx={{ width: 36, height: 36 }} />
                    <Box sx={{ flex: "1 1 120px", minWidth: 0, overflowWrap: "anywhere" }}>
                      <Typography sx={{ fontWeight: 500 }}>
                        <UserName user={m} />
                        {m.user_id === user?.id ? " (you)" : ""}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {m.role === "editor" ? "Editor" : "Viewer"}
                      </Typography>
                    </Box>
                    {data.can_manage && (
                      <>
                        <TextField
                          select
                          size="small"
                          label={`Role of ${m.username}`}
                          value={m.role}
                          disabled={busy}
                          onChange={(e) =>
                            actions.change.mutate(
                              { userId: m.user_id, role: e.target.value as Role },
                              { onError: fail },
                            )
                          }
                          sx={{ width: 130 }}
                        >
                          <MenuItem value="viewer">Viewer</MenuItem>
                          <MenuItem value="editor">Editor</MenuItem>
                        </TextField>
                        <Button
                          size="small"
                          color="error"
                          disabled={busy}
                          onClick={() => void remove(m.user_id, m.username)}
                        >
                          Remove
                        </Button>
                      </>
                    )}
                  </Box>
                ))}
                {data.notebook && (
                  <Typography variant="body2" color="text.secondary">
                    Members of “{data.notebook.name}” can also open this page.
                  </Typography>
                )}
              </Stack>
            )}
          </>
        )
      )}
    </ResponsiveDialog>
  );
}
