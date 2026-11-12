import { useState } from "react";
import { Box, Button, Checkbox, LinearProgress, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { useSnackbar } from "notistack";
import type { AdminSystemReport } from "@shared/admin";
import PageHeader from "../../components/ui/PageHeader";
import ErrorDisplay from "../../components/ErrorDisplay";
import ListSkeleton from "../../components/ui/ListSkeleton";
import { useTitle } from "../../hooks/useTitle";
import { useAdminActions, useAdminSystem } from "../../hooks/admin/useAdminData";
import { formatFileSize } from "../../utils/fileUtils";
import DataTable, { type Column } from "./components/DataTable";
import StatCard from "./components/StatCard";
import TypedConfirmDialog from "./components/TypedConfirmDialog";
import BackupsCard from "./components/BackupsCard";
import { shortDate, timeAgo } from "./adminFormat";

const card = { border: 1, borderColor: "divider", borderRadius: 2, p: 2.25 } as const;
type Task = AdminSystemReport["tasks"][number];

const uptime = (seconds: number) => {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor((seconds % 3600) / 60)}m`;
};
const when = (iso: string | null) =>
  iso ? (new Date(iso).getTime() > Date.now() ? shortDate(iso) : timeAgo(iso)) : "Never";

/** Health, scheduled work, migrations and the tools. The one place a destructive reset lives, behind a typed word. */
export default function System() {
  useTitle("System");
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading, isError, error, refetch } = useAdminSystem();
  const { toggleTask, deleteAllChats, triggerServerError } = useAdminActions();
  const [clientError, setClientError] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Thrown while rendering so the app's top-level error boundary catches it, as a real render crash would be.
  if (clientError) throw new Error("Test client error triggered from the admin System page");

  const columns: Column<Task>[] = [
    {
      key: "task",
      header: "Task",
      render: (t) => (
        <Box>
          <Typography variant="body2">{t.label}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t.frequency ?? "One time"}
          </Typography>
        </Box>
      ),
    },
    {
      key: "next",
      header: "Next run",
      width: 130,
      render: (t) => (
        <Typography variant="body2" color="text.secondary" noWrap>
          {t.enabled ? when(t.nextRun) : "Off"}
        </Typography>
      ),
    },
    {
      key: "last",
      header: "Last run",
      width: 130,
      render: (t) => (
        <Typography variant="body2" color="text.secondary" noWrap>
          {when(t.lastRun)}
        </Typography>
      ),
    },
    {
      key: "error",
      header: "Last error",
      render: (t) => (
        <Typography variant="body2" color={t.lastError ? "error.main" : "text.disabled"} sx={{ maxWidth: 320 }} noWrap>
          {t.lastError ?? "None"}
        </Typography>
      ),
    },
    {
      key: "on",
      header: "On",
      width: 70,
      render: (t) => (
        <Checkbox
          size="small"
          checked={t.enabled}
          onChange={(e) => toggleTask.mutate({ taskId: t._id, enabled: e.target.checked })}
          slotProps={{ input: { "aria-label": `${t.label} enabled` } }}
        />
      ),
    },
  ];

  const failing = data?.tasks.filter((t) => t.enabled && t.lastError).length ?? 0;

  const serverError = async () => {
    try {
      await triggerServerError.mutateAsync();
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Server error triggered (check Bugsnag)", { variant: "error" });
    }
  };
  const wipe = async () => {
    try {
      const result = await deleteAllChats.mutateAsync();
      setConfirming(false);
      enqueueSnackbar(`Deleted ${result.messagesDeleted} messages and ${result.conversationsDeleted} conversations`, {
        variant: "success",
      });
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message || e?.message || "Couldn't delete the chats", { variant: "error" });
    }
  };

  return (
    <Box>
      <PageHeader title="System" subtitle="Health, scheduled work, migrations and the tools" />
      {isLoading ? (
        <ListSkeleton rows={4} height={100} />
      ) : isError || !data ? (
        <ErrorDisplay error={error ?? null} title="Couldn't load system information" onRetry={() => refetch()} />
      ) : (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
              gap: 2,
              mb: 2,
            }}
          >
            <StatCard
              label="Server"
              value="Running"
              noteTone="success"
              note={`Up ${uptime(data.health.uptimeSeconds)} · ${data.health.env}`}
            />
            <StatCard
              label="Database"
              value={data.health.database.connected ? "Connected" : "Down"}
              valueTone={data.health.database.connected ? undefined : "error"}
              note={`${formatFileSize(data.health.database.sizeBytes)} · ${data.health.database.collections} collections`}
            />
            <StatCard
              label="Scheduler"
              value={failing > 0 ? `${failing} failing` : "Healthy"}
              valueTone={failing > 0 ? "error" : undefined}
              note={`of ${data.tasks.filter((t) => t.enabled).length} enabled tasks`}
            />
            <StatCard
              label="Push"
              value={data.health.push.configured ? "Configured" : "Not set up"}
              valueTone={data.health.push.configured ? undefined : "warning"}
              note={`${data.health.push.devices.toLocaleString()} subscribed devices`}
            />
          </Box>

          <Box
            sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.7fr) minmax(0, 1fr)" }, gap: 2 }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box>
                <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Scheduled tasks</Typography>
                <DataTable columns={columns} rows={data.tasks} rowKey={(t) => t._id} emptyTitle="No scheduled tasks" />
              </Box>

              <Box sx={card}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1 }}>
                  <Typography sx={{ fontWeight: 600 }}>Document sizes</Typography>
                  <Typography variant="caption" color="text.disabled">
                    Against the 16 MB limit · read-only
                  </Typography>
                </Box>
                {data.documents.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Nothing large yet.
                  </Typography>
                )}
                {data.documents.map((d) => (
                  <Box
                    key={`${d.collection}-${d.label}`}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr 80px", sm: "minmax(0, 1.4fr) minmax(0, 2fr) 80px" },
                      gap: 1.5,
                      alignItems: "center",
                      py: 1,
                      borderTop: 1,
                      borderColor: "divider",
                    }}
                  >
                    <Typography variant="body2" noWrap>
                      {d.label}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, d.percentOfLimit)}
                      color={d.percentOfLimit > 50 ? "warning" : "primary"}
                      sx={{ height: 6, borderRadius: 3, display: { xs: "none", sm: "block" } }}
                    />
                    <Typography variant="body2" color="text.secondary" align="right">
                      {formatFileSize(d.bytes)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={card}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 0.5 }}>
                  <Typography sx={{ fontWeight: 600 }}>Migrations</Typography>
                  <Typography variant="body2" color="success.main">
                    {data.migrations.filter((m) => m.state === "up").length} applied
                  </Typography>
                </Box>
                {data.migrations
                  .slice(-8)
                  .reverse()
                  .map((m) => (
                    <Box
                      key={m.name}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                        py: 0.75,
                        borderTop: 1,
                        borderColor: "divider",
                      }}
                    >
                      <CheckIcon sx={{ fontSize: 16 }} color={m.state === "up" ? "success" : "disabled"} />
                      <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                        {m.name.replace(/^\d+-/, "")}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {m.appliedAt ? shortDate(m.appliedAt) : ""}
                      </Typography>
                    </Box>
                  ))}
              </Box>

              <BackupsCard />

              <Box sx={card}>
                <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Error monitoring</Typography>
                <Typography variant="body2" color="text.secondary">
                  Trigger a test error to confirm Bugsnag is receiving reports. The client error blanks the page;
                  refresh afterward.
                </Typography>
                <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                  <Button size="small" variant="outlined" color="warning" onClick={() => setClientError(true)}>
                    Client error
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    onClick={serverError}
                    disabled={triggerServerError.isPending}
                  >
                    Server error
                  </Button>
                </Box>
              </Box>

              <Box sx={{ ...card, borderColor: "error.main" }}>
                <Typography sx={{ fontWeight: 600 }} color="error.main">
                  Danger zone
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Delete every conversation and message for everyone. This can't be undone.
                </Typography>
                <Button
                  variant="contained"
                  color="error"
                  size="small"
                  sx={{ mt: 1.5 }}
                  onClick={() => setConfirming(true)}
                >
                  Delete all chats
                </Button>
              </Box>
            </Box>
          </Box>
        </>
      )}

      <TypedConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete all chats"
        message="This deletes every conversation and message for every person. It can't be undone."
        phrase="DELETE"
        confirmLabel="Delete all chats"
        busy={deleteAllChats.isPending}
        onConfirm={wipe}
      />
    </Box>
  );
}
