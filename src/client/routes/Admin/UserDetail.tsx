import { useEffect, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  LinearProgress,
  Link,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import type { AdminUserDetail, NotifyChannel } from "@shared/admin";
import { FREE_STORAGE_BYTES } from "@shared/monetization";
import ErrorDisplay from "../../components/ErrorDisplay";
import ListSkeleton from "../../components/ui/ListSkeleton";
import SectionLabel from "../../components/ui/SectionLabel";
import UserName from "../../components/user/UserName";
import { useConfirm } from "../../components/ui/ConfirmProvider";
import { useTitle } from "../../hooks/useTitle";
import { useAdminActions, useAdminAudit, useAdminUser } from "../../hooks/admin/useAdminData";
import { formatFileSize } from "../../utils/fileUtils";
import StatusChip from "./components/StatusChip";
import TypedConfirmDialog from "./components/TypedConfirmDialog";
import { dateTime, shortDate, share } from "./adminFormat";

const card = { border: 1, borderColor: "divider", borderRadius: 2, p: 2.25 } as const;
const GB = 1024 ** 3;
const ITEM_OPTIONS = [
  { value: "1gb-xendrive-voucher", label: "1 GB XenDrive Voucher" },
  { value: "golden-badge", label: "Golden Badge" },
];
const CHANNELS: Array<{ value: NotifyChannel; label: string; note: string }> = [
  { value: "inapp", label: "In the app", note: "Shows in their notification list" },
  { value: "socket", label: "Live", note: "A toast if the app is open" },
  { value: "push", label: "Push", note: "Only if they turned it on" },
  { value: "email", label: "Email", note: "Only if they allow email" },
];

const errorText = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

function AccountCard({ user }: { user: AdminUserDetail }) {
  const { updateUser } = useAdminActions();
  const { enqueueSnackbar } = useSnackbar();
  const [isAdmin, setIsAdmin] = useState(user.roles.includes("admin"));
  useEffect(() => setIsAdmin(user.roles.includes("admin")), [user.roles]);
  const changed = isAdmin !== user.roles.includes("admin");

  const save = async () => {
    // Everyone is a user; the only role that changes is admin. Any other role they hold is kept.
    const others = user.roles.filter((r) => r !== "admin");
    try {
      await updateUser.mutateAsync({ userId: user._id, roles: isAdmin ? [...others, "admin"] : others });
      enqueueSnackbar("Roles saved", { variant: "success" });
    } catch (e) {
      enqueueSnackbar(errorText(e, "Couldn't save the roles"), { variant: "error" });
    }
  };

  return (
    <Box sx={card}>
      <Typography sx={{ fontWeight: 600, mb: 1 }}>Account</Typography>
      <SectionLabel>Roles</SectionLabel>
      <FormControlLabel
        sx={{ display: "flex" }}
        control={<Checkbox size="small" checked disabled />}
        label={
          <>
            User
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              Everyone
            </Typography>
          </>
        }
      />
      <FormControlLabel
        sx={{ display: "flex" }}
        control={<Checkbox size="small" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />}
        label={
          <>
            Admin
            <Typography component="span" variant="caption" color="warning.main" sx={{ ml: 1 }}>
              Full access to this panel
            </Typography>
          </>
        }
      />
      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
        <Button variant="contained" size="small" disabled={!changed || updateUser.isPending} onClick={save}>
          Save roles
        </Button>
      </Box>
    </Box>
  );
}

function StorageCard({ user }: { user: AdminUserDetail }) {
  const { updateUser } = useAdminActions();
  const { enqueueSnackbar } = useSnackbar();
  const [custom, setCustom] = useState("");
  const used = share(user.storage.used, user.storage.allowed);

  const grow = async (bytes: number) => {
    try {
      await updateUser.mutateAsync({ userId: user._id, xendriveQuota: Math.max(0, user.extraSpace + bytes) });
      enqueueSnackbar(`Space ${bytes >= 0 ? "added" : "removed"}`, { variant: "success" });
      setCustom("");
    } catch (e) {
      enqueueSnackbar(errorText(e, "Couldn't change the space"), { variant: "error" });
    }
  };

  return (
    <Box sx={card}>
      <Typography sx={{ fontWeight: 600 }}>Storage</Typography>
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1, mb: 0.75 }}>
        <Typography variant="body2" color="text.secondary">
          {formatFileSize(user.storage.used)} used
        </Typography>
        <Typography variant="body2" color="text.secondary">
          of {formatFileSize(user.storage.allowed)} ({formatFileSize(FREE_STORAGE_BYTES)} free tier
          {user.extraSpace > 0 ? ` + ${formatFileSize(user.extraSpace)}` : ""})
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, used * 100)}
        color={used >= 0.9 ? "warning" : "primary"}
        sx={{ height: 8, borderRadius: 4 }}
      />
      <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
        {user.storage.files.toLocaleString()} files
        {user.appBytes > 0 ? ` · ${formatFileSize(user.appBytes)} from chat` : ""}
      </Typography>
      <SectionLabel sx={{ mt: 2 }}>Add space</SectionLabel>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        {[1, 5, 10].map((n) => (
          <Button
            key={n}
            size="small"
            variant="outlined"
            color="inherit"
            disabled={updateUser.isPending}
            onClick={() => grow(n * GB)}
          >
            +{n} GB
          </Button>
        ))}
        <TextField
          size="small"
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="GB"
          sx={{ width: 84 }}
          slotProps={{ htmlInput: { "aria-label": "Custom amount in GB" } }}
        />
        <Button
          size="small"
          disabled={!custom || updateUser.isPending}
          onClick={() => grow(Math.round(parseFloat(custom) * GB))}
        >
          Add
        </Button>
      </Box>
    </Box>
  );
}

function GemsCard({ user }: { user: AdminUserDetail }) {
  const { adjustGems } = useAdminActions();
  const { enqueueSnackbar } = useSnackbar();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const n = Number(amount);
  const valid = Number.isInteger(n) && n !== 0 && reason.trim().length >= 3;

  const apply = async () => {
    try {
      await adjustGems.mutateAsync({ userId: user._id, amount: n, reason: reason.trim() });
      setAmount("");
      setReason("");
      enqueueSnackbar("Balance adjusted", { variant: "success" });
    } catch (e) {
      enqueueSnackbar(errorText(e, "Couldn't adjust the balance"), { variant: "error" });
    }
  };

  return (
    <Box sx={card}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Typography sx={{ fontWeight: 600 }}>Gems</Typography>
        <Typography sx={{ fontSize: 22, fontWeight: 600 }}>{user.gems.toLocaleString()}</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary">
        Bought {user.purchases.gems.toLocaleString()} across {user.purchases.count}{" "}
        {user.purchases.count === 1 ? "purchase" : "purchases"}
      </Typography>
      <SectionLabel sx={{ mt: 2 }}>Adjust balance</SectionLabel>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <TextField
          size="small"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9-]/g, ""))}
          placeholder="+/- gems"
          sx={{ width: 110 }}
          slotProps={{ htmlInput: { "aria-label": "Amount of gems" } }}
        />
        <TextField
          size="small"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (goes in the audit log)"
          sx={{ flex: 1, minWidth: 200 }}
          slotProps={{ htmlInput: { "aria-label": "Reason", maxLength: 200 } }}
        />
        <Button variant="contained" size="small" disabled={!valid || adjustGems.isPending} onClick={apply}>
          Apply
        </Button>
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.75 }}>
        Use this to correct a mistake or refund. To thank someone for a bug report, use Reward gems in Feedback.
      </Typography>
    </Box>
  );
}

function ItemsCard({ user }: { user: AdminUserDetail }) {
  const { giveItem, removeItem } = useAdminActions();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const [pick, setPick] = useState("");

  const give = async () => {
    try {
      await giveItem.mutateAsync({ userId: user._id, itemKey: pick });
      setPick("");
      enqueueSnackbar("Item given", { variant: "success" });
    } catch (e) {
      enqueueSnackbar(errorText(e, "Couldn't give the item"), { variant: "error" });
    }
  };
  const remove = async (itemKey: string, name: string) => {
    if (
      !(await confirm({
        title: "Remove item",
        message: `Take ${name} away from ${user.username}?`,
        confirmLabel: "Remove",
        destructive: true,
      }))
    )
      return;
    try {
      await removeItem.mutateAsync({ userId: user._id, itemKey });
    } catch (e) {
      enqueueSnackbar(errorText(e, "Couldn't remove the item"), { variant: "error" });
    }
  };

  return (
    <Box sx={card}>
      <Typography sx={{ fontWeight: 600, mb: 1 }}>Items</Typography>
      {user.inventory.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          No items.
        </Typography>
      )}
      {user.inventory.map((item, i) => (
        <Box
          key={`${item.itemKey}-${i}`}
          sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1, borderTop: 1, borderColor: "divider" }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2">{item.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {item.used ? "Used" : "Unused"} · {shortDate(item.purchasedAt)}
            </Typography>
          </Box>
          <Button size="small" color="error" onClick={() => remove(item.itemKey, item.name)}>
            Remove
          </Button>
        </Box>
      ))}
      <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
        <TextField
          select
          size="small"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          label="Give an item"
          sx={{ flex: 1 }}
        >
          {ITEM_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="outlined" size="small" disabled={!pick || giveItem.isPending} onClick={give}>
          Give
        </Button>
      </Box>
    </Box>
  );
}

function NotifyTab({ user }: { user: AdminUserDetail }) {
  const { notify } = useAdminActions();
  const { enqueueSnackbar } = useSnackbar();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [channels, setChannels] = useState<NotifyChannel[]>(["inapp", "socket", "push"]);

  const send = async () => {
    try {
      await notify.mutateAsync({
        audience: { type: "users", userIds: [user._id] },
        title: title.trim(),
        message: message.trim(),
        link: link.trim() || undefined,
        channels,
      });
      setTitle("");
      setMessage("");
      setLink("");
      enqueueSnackbar(`Sent to ${user.username}`, { variant: "success" });
    } catch (e) {
      enqueueSnackbar(errorText(e, "Couldn't send"), { variant: "error" });
    }
  };

  return (
    <Box sx={{ ...card, maxWidth: 640, display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography sx={{ fontWeight: 600 }}>Send {user.username} a notification</Typography>
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
        placeholder="/internal/xendrive"
      />
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
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          disabled={!title.trim() || !message.trim() || channels.length === 0 || notify.isPending}
          onClick={send}
        >
          Send
        </Button>
      </Box>
    </Box>
  );
}

function ActivityList({ userId, limit }: { userId: string; limit?: number }) {
  const { data } = useAdminAudit(
    { category: "", q: "", days: 0, page: 1, targetId: userId },
    { pageSize: limit ?? 25 },
  );
  if (!data) return <ListSkeleton rows={3} height={44} gap={1} />;
  if (data.items.length === 0)
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        No admin changes yet.
      </Typography>
    );
  return (
    <>
      {data.items.map((e) => (
        <Box key={e._id} sx={{ py: 1.25, borderTop: 1, borderColor: "divider" }}>
          <Typography variant="body2">{e.detail}</Typography>
          <Typography variant="caption" color="text.secondary">
            {e.admin.username} · {dateTime(e.createdAt)}
          </Typography>
        </Box>
      ))}
    </>
  );
}

/** One person: their account, storage, gems and items, a way to message them, and what admins have changed. */
export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { data: user, isLoading, isError, error, refetch } = useAdminUser(userId);
  const { resetAvatar, deleteUser } = useAdminActions();
  const [tab, setTab] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useTitle(user ? `Admin - ${user.username}` : "Admin - Person");

  if (isLoading) return <ListSkeleton rows={4} height={120} />;
  if (isError || !user)
    return <ErrorDisplay error={error ?? null} title="Couldn't load this person" onRetry={() => refetch()} />;

  const reset = async () => {
    if (
      !(await confirm({
        title: "Reset avatar",
        message: `Put ${user.username}'s picture back to the default?`,
        confirmLabel: "Reset",
        destructive: true,
      }))
    )
      return;
    try {
      await resetAvatar.mutateAsync(user._id);
      enqueueSnackbar("Avatar reset", { variant: "success" });
    } catch (e) {
      enqueueSnackbar(errorText(e, "Couldn't reset the avatar"), { variant: "error" });
    }
  };
  const remove = async () => {
    try {
      await deleteUser.mutateAsync({ userId: user._id, confirm: user.username });
      enqueueSnackbar(`${user.username} was deleted`, { variant: "success" });
      navigate("/admin/users", { replace: true });
    } catch (e) {
      enqueueSnackbar(errorText(e, "Couldn't delete"), { variant: "error" });
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.disabled" sx={{ mb: 1.5 }}>
        <Link component={RouterLink} to="/admin/users" underline="hover" color="inherit">
          Users
        </Link>{" "}
        / {user.username}
      </Typography>

      <Box sx={{ ...card, display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Avatar src={user.avatar} sx={{ width: 64, height: 64 }}>
          {user.username[0]?.toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
              <UserName user={{ username: user.username, cosmetics: user.badge ? { badge: user.badge } : undefined }} />
            </Typography>
            <StatusChip
              label={user.roles.includes("admin") ? "Admin" : "User"}
              tone={user.roles.includes("admin") ? "error" : "default"}
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {user.email} · Joined {shortDate(user.joinedAt)}
            {user.providers.length > 0 ? ` · Signs in with ${user.providers.join(", ")}` : ""}
          </Typography>
        </Box>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Overview" />
        <Tab label="Notify" />
        <Tab label="Activity" />
      </Tabs>

      {tab === 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) minmax(0, 1fr) 340px" },
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <AccountCard user={user} />
            <StorageCard user={user} />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <GemsCard user={user} />
            <ItemsCard user={user} />
          </Box>
          <Box sx={card}>
            <Typography sx={{ fontWeight: 600 }}>Activity</Typography>
            <Typography variant="caption" color="text.secondary">
              Admin changes to this person
            </Typography>
            <ActivityList userId={user._id} limit={6} />
          </Box>
        </Box>
      )}
      {tab === 1 && <NotifyTab user={user} />}
      {tab === 2 && (
        <Box sx={{ ...card, maxWidth: 720 }}>
          <ActivityList userId={user._id} />
        </Box>
      )}

      <Box
        sx={{
          border: 1,
          borderColor: "error.main",
          borderRadius: 2,
          p: 2.25,
          mt: 3,
          display: "flex",
          alignItems: { md: "center" },
          gap: 2,
          flexDirection: { xs: "column", md: "row" },
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 600 }} color="error.main">
            Danger zone
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Deleting a person removes their account and their files. You'll be asked to type their username.
          </Typography>
        </Box>
        <Button variant="outlined" color="inherit" onClick={reset} disabled={resetAvatar.isPending}>
          Reset avatar
        </Button>
        <Button variant="contained" color="error" onClick={() => setDeleting(true)}>
          Delete person
        </Button>
      </Box>

      <TypedConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${user.username}`}
        message={`This removes ${user.username}'s account and ${user.storage.files.toLocaleString()} ${user.storage.files === 1 ? "file" : "files"}. It can't be undone.`}
        phrase={user.username}
        confirmLabel="Delete person"
        busy={deleteUser.isPending}
        onConfirm={remove}
      />
    </Box>
  );
}
