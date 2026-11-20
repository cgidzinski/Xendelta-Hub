import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Checkbox, Box, Button, List, ListItem, ListItemText, Paper, Tab, Tabs, Typography } from "@mui/material";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import { useSnackbar } from "notistack";
import type { ListedTask } from "@shared/xennote/tasks";
import { api } from "../../../../config/api";
import { xennoteKeys } from "../../../../hooks/xennote/keys";
import { useSocketInvalidate } from "../../../../hooks/useSocketEvent";
import { useXenNotebooks } from "../../../../hooks/xennote/useXenNote";
import { useTitle } from "../../../../hooks/useTitle";
import PageContainer from "../../../../components/ui/PageContainer";
import PageHeader from "../../../../components/ui/PageHeader";
import EmptyState from "../../../../components/ui/EmptyState";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import { cardSx } from "../../../../components/ui/surfaceStyles";

const BOARD = "/internal/xennote";

export default function TasksView() {
  const { notebookId } = useParams();
  const [done, setDone] = useState(false);
  const client = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data: notebooks } = useXenNotebooks();
  const name = notebooks?.find((book) => book._id === notebookId)?.name;
  const title = name ? `Tasks: ${name}` : "Tasks";
  useTitle(title);

  const key = xennoteKeys.tasks(notebookId, done);
  useSocketInvalidate("xennote:page_update", [key]);
  useSocketInvalidate("xennote:notebook_update", [key]);
  const list = useQuery({
    queryKey: key,
    queryFn: () => {
      const params = new URLSearchParams({ done: String(done) });
      if (notebookId) params.set("notebook", notebookId);
      return api.get<{ items: ListedTask[]; truncated: boolean }>(`/api/xennote/tasks?${params}`);
    },
  });
  const toggle = useMutation({
    mutationFn: (task: ListedTask) =>
      api.put(`/api/xennote/pages/${task.page_id}/tasks/${task.block_id}`, { checked: !task.done }),
    onSuccess: () => client.invalidateQueries({ queryKey: xennoteKeys.all }),
    onError: (error) => enqueueSnackbar(error.message, { variant: "error" }),
  });
  const groups = new Map<string, ListedTask[]>();
  for (const item of list.data?.items ?? []) {
    const group = groups.get(item.page_id) ?? [];
    group.push(item);
    groups.set(item.page_id, group);
  }
  return (
    <PageContainer>
      <PageHeader
        title={title}
        actions={
          <Button component={Link} to={notebookId ? `${BOARD}/b/${notebookId}` : BOARD}>
            Back
          </Button>
        }
      />
      <Tabs
        value={done ? "done" : "open"}
        onChange={(_, value) => setDone(value === "done")}
        aria-label="Task status"
        sx={{ mb: 2 }}
      >
        <Tab label="Open" value="open" />
        <Tab label="Completed" value="done" />
      </Tabs>
      {list.error ? (
        <ErrorDisplay error={list.error} title="Couldn't load tasks" onRetry={() => list.refetch()} />
      ) : list.isPending ? (
        <ListSkeleton rows={6} />
      ) : !groups.size ? (
        <EmptyState icon={<TaskAltIcon />} title={done ? "No completed tasks" : "No open tasks"} />
      ) : (
        [...groups.values()].map((items) => {
          const page = items[0];
          const path = page.notebook_id
            ? `${BOARD}/b/${page.notebook_id}/p/${page.page_id}`
            : `${BOARD}/p/${page.page_id}`;
          return (
            <Box component="section" key={page.page_id} sx={{ mb: 2.5 }}>
              <Typography component="h2" variant="subtitle1" sx={{ mb: 0.75 }}>
                <Button component={Link} to={path}>
                  {page.page_title || "Untitled page"}
                </Button>
                {page.notebook_name && (
                  <Typography component="span" variant="caption" color="text.secondary">
                    {page.notebook_name}
                  </Typography>
                )}
              </Typography>
              <Paper variant="outlined" sx={cardSx}>
                <List disablePadding>
                  {items.map((task, index) => (
                    <ListItem key={task.block_id} divider={index < items.length - 1}>
                      <Checkbox
                        checked={task.done}
                        disabled={!task.can_edit || toggle.isPending}
                        onChange={() => toggle.mutate(task)}
                        inputProps={{ "aria-label": task.text || "Untitled task" }}
                      />
                      <ListItemText primary={task.text || "Untitled task"} />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </Box>
          );
        })
      )}
      {list.data?.truncated && (
        <Typography variant="caption" color="text.secondary">
          Showing recent tasks. Open a notebook’s tasks for a shorter list.
        </Typography>
      )}
    </PageContainer>
  );
}
