import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Button, List, ListItemButton, ListItemText, Stack, Typography } from "@mui/material";
import { format } from "date-fns";
import { useSnackbar } from "notistack";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import EmptyState from "../../../../components/ui/EmptyState";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { xennoteKeys } from "../../../../hooks/xennote/keys";
import { api } from "../../../../config/api";
import type { PublicPage } from "../../../../types/XenNotePage";
import { pageTitle } from "./pageTree";

const Reader = lazy(() => import("../editor/PublicPageReader"));
const titles = new Map<string, string>();
interface Version {
  id: string;
  title: string;
  at: string;
}

export default function PageHistoryDialog({
  id,
  editable,
  onClose,
}: {
  id: string;
  editable: boolean;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string>();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const path = `/api/xennote/pages/${id}/history`;
  const list = useQuery({
    queryKey: xennoteKeys.pageHistory(id),
    queryFn: () => api.get<Version[]>(`/api/xennote/pages/${id}/history`),
    staleTime: 0,
  });
  const active = selected ?? list.data?.[0]?.id;
  const body = useQuery({
    queryKey: xennoteKeys.pageVersion(id, active ?? ""),
    queryFn: () => api.get<PublicPage>(`/api/xennote/pages/${id}/history/${active}`),
    enabled: !!active,
    gcTime: 0,
  });
  const restore = useMutation({
    mutationFn: (version: string) => api.post(`${path}/${version}/restore`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: xennoteKeys.all });
      enqueueSnackbar("Version restored", { variant: "success" });
      onClose();
    },
    onError: (error) => enqueueSnackbar(error.message, { variant: "error" }),
  });
  const replace = async () => {
    if (
      active &&
      (await confirm({
        title: "Restore this version?",
        message: "The current page will be kept in its history.",
        confirmLabel: "Restore",
      }))
    ) {
      restore.mutate(active);
    }
  };
  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      title="Page history"
      maxWidth="md"
      actions={
        <>
          <Button onClick={onClose}>Close</Button>
          {editable && body.data && (
            <Button variant="contained" onClick={() => void replace()} disabled={restore.isPending}>
              Restore
            </Button>
          )}
        </>
      }
    >
      {list.isPending ? (
        <ListSkeleton rows={4} />
      ) : list.error ? (
        <ErrorDisplay error={list.error} title="Couldn't load page history" onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState title="No earlier versions" description="Earlier versions appear here as the page is edited." />
      ) : (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <List aria-label="Page versions" sx={{ width: { sm: 240 }, flexShrink: 0, maxHeight: 340, overflow: "auto" }}>
            {list.data.map((version) => (
              <ListItemButton key={version.id} selected={version.id === active} onClick={() => setSelected(version.id)}>
                <ListItemText primary={format(new Date(version.at), "PP p")} secondary={pageTitle(version.title)} />
              </ListItemButton>
            ))}
          </List>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {body.error ? (
              <ErrorDisplay error={body.error} title="Couldn't open this version" onRetry={() => body.refetch()} />
            ) : body.data ? (
              <>
                <Typography variant="h6" component="h2">
                  {pageTitle(body.data.title)}
                </Typography>
                <Suspense fallback={<ListSkeleton rows={3} />}>
                  <Reader key={body.data.id} detail={body.data} titles={titles} onOpenPage={() => undefined} />
                </Suspense>
              </>
            ) : (
              <ListSkeleton rows={3} />
            )}
          </Box>
        </Stack>
      )}
    </ResponsiveDialog>
  );
}
