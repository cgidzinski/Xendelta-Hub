import { useState } from "react";
import { Box, Button, Checkbox, FormControlLabel, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import type { NotifyAudience, NotifyChannel } from "@shared/admin";
import PageHeader from "../../components/ui/PageHeader";
import SectionLabel from "../../components/ui/SectionLabel";
import { useConfirm } from "../../components/ui/ConfirmProvider";
import { useTitle } from "../../hooks/useTitle";
import { useAuth } from "../../contexts/AuthContext";
import { useAdminActions, useAdminBroadcasts, useAudienceReach } from "../../hooks/admin/useAdminData";
import FilterChips from "./components/FilterChips";
import { timeAgo } from "./adminFormat";
import { BRAND_NAME } from "@shared/brand";

const card = { border: 1, borderColor: "divider", borderRadius: 2, p: 2.5 } as const;
type Who = "everyone" | "role";
const CHANNELS: Array<{ value: NotifyChannel; label: string; note: string }> = [
  { value: "inapp", label: "In the app", note: "Shows in everyone's notification list" },
  { value: "socket", label: "Live", note: "A toast for people who have the app open" },
  { value: "push", label: "Push", note: "Phone and desktop alerts, only for people who turned them on" },
  { value: "email", label: "Email", note: "Respects each person's email setting. Use sparingly." },
];
const TEMPLATES = [
  {
    label: "Maintenance",
    title: "Maintenance tonight",
    message: `${BRAND_NAME} will be unavailable from 2 AM to 4 AM Eastern while we upgrade the database.`,
  },
  { label: "New feature", title: "Something new", message: "We've added something new. Take a look." },
  {
    label: "Security",
    title: "Please update your password",
    message: "For your security, please update your password.",
  },
];
const errorText = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

/** Send a notification to everyone, one role, or (from a person's page) one person. Replaces the demo buttons. */
export default function Messaging() {
  useTitle("Messaging");
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { notify } = useAdminActions();
  const { data: broadcasts } = useAdminBroadcasts();

  const [who, setWho] = useState<Who>("everyone");
  const [role, setRole] = useState("admin");
  const [channels, setChannels] = useState<NotifyChannel[]>(["inapp", "socket", "push"]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const { data: reach } = useAudienceReach(who, who === "role" ? role : "");

  const audience: NotifyAudience = who === "everyone" ? { type: "everyone" } : { type: "role", role };
  const ready = title.trim() && message.trim() && channels.length > 0 && (who === "everyone" || role.trim());

  const send = async (to: NotifyAudience, label: string) => {
    try {
      const result = await notify.mutateAsync({
        audience: to,
        title: title.trim(),
        message: message.trim(),
        link: link.trim() || undefined,
        channels,
      });
      enqueueSnackbar(`${label}: sent to ${result.people} ${result.people === 1 ? "person" : "people"}`, {
        variant: "success",
      });
    } catch (e) {
      enqueueSnackbar(errorText(e, "Couldn't send"), { variant: "error" });
    }
  };
  const sendAll = async () => {
    const people = reach?.people ?? 0;
    if (
      !(await confirm({
        title: "Send this notification?",
        message: `It will go to ${people.toLocaleString()} ${people === 1 ? "person" : "people"}. It can't be recalled.`,
        confirmLabel: "Send",
        destructive: false,
      }))
    )
      return;
    await send(audience, "Done");
  };

  return (
    <Box>
      <PageHeader title="Messaging" subtitle="Send a notification to everyone or to a group" />
      <Box
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.3fr) minmax(0, 1fr)" }, gap: 2.5 }}
      >
        <Box sx={{ ...card, display: "flex", flexDirection: "column", gap: 2.5 }}>
          <Box>
            <SectionLabel>Who</SectionLabel>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
              <FilterChips
                label="Audience"
                value={who}
                onChange={setWho}
                options={[
                  { value: "everyone", label: "Everyone" },
                  { value: "role", label: "A role" },
                ]}
              />
              {who === "role" && (
                <TextField
                  size="small"
                  label="Role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  sx={{ width: 160 }}
                />
              )}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {reach
                ? `${reach.people.toLocaleString()} ${reach.people === 1 ? "person" : "people"} · about ${reach.pushDevices.toLocaleString()} with a device that can get push`
                : "Counting..."}
            </Typography>
          </Box>

          <Box>
            <SectionLabel>How</SectionLabel>
            {CHANNELS.map((c) => (
              <FormControlLabel
                key={c.value}
                sx={{ display: "flex", alignItems: "flex-start", mb: 0.5 }}
                control={
                  <Checkbox
                    size="small"
                    checked={channels.includes(c.value)}
                    onChange={(e) =>
                      setChannels(e.target.checked ? [...channels, c.value] : channels.filter((x) => x !== c.value))
                    }
                  />
                }
                label={
                  <>
                    <Typography variant="body2">{c.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.note}
                    </Typography>
                  </>
                }
              />
            ))}
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Typography variant="body2" color="text.secondary">
                Start from
              </Typography>
              {TEMPLATES.map((t) => (
                <Button
                  key={t.label}
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() => {
                    setTitle(t.title);
                    setMessage(t.message);
                  }}
                >
                  {t.label}
                </Button>
              ))}
            </Box>
            <TextField
              size="small"
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            <TextField
              size="small"
              label="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              multiline
              minRows={3}
            />
            <TextField
              size="small"
              label="Link (optional)"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="/internal/blog"
            />
          </Box>

          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              variant="outlined"
              color="inherit"
              disabled={!ready || notify.isPending}
              onClick={() => send({ type: "users", userIds: [user.id] }, "Test")}
            >
              Send a test to me
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" disabled={!ready || notify.isPending} onClick={sendAll}>
              {who === "everyone" ? "Send to everyone" : `Send to ${role || "the role"}`}
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={card}>
            <Typography sx={{ fontWeight: 600, mb: 1.5 }}>How it will look</Typography>
            <SectionLabel>In the app</SectionLabel>
            <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.5, mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {title || "Your title"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {message || "Your message appears here."}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Just now
              </Typography>
            </Box>
            <SectionLabel>On a phone lock screen</SectionLabel>
            <Box sx={{ borderRadius: 3, bgcolor: "action.hover", p: 1.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="caption" color="text.secondary">
                  {BRAND_NAME}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  now
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {title || "Your title"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {message || "Your message appears here."}
              </Typography>
            </Box>
          </Box>

          <Box sx={card}>
            <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Recent broadcasts</Typography>
            {(broadcasts ?? []).length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                Nothing sent yet.
              </Typography>
            )}
            {(broadcasts ?? []).map((b) => (
              <Box key={b._id} sx={{ py: 1.25, borderTop: 1, borderColor: "divider" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                  <Typography variant="body2">{String(b.meta?.title ?? b.detail)}</Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                    {timeAgo(b.createdAt)}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {b.target.label} · by {b.admin.username}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
