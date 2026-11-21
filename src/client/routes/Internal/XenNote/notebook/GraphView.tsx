import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Autocomplete,
  Box,
  Button,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { NotebookGraph } from "@shared/xennote/graph";
import { api } from "../../../../config/api";
import { useLocalStorageState } from "../../../../hooks/useLocalStorageState";
import { useTitle } from "../../../../hooks/useTitle";
import { xennoteKeys } from "../../../../hooks/xennote/keys";
import PageContainer from "../../../../components/ui/PageContainer";
import PageHeader from "../../../../components/ui/PageHeader";
import DetailSkeleton from "../../../../components/ui/DetailSkeleton";
import EmptyState from "../../../../components/ui/EmptyState";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import NoteNavButton from "../components/NoteNavButton";

const Graph2D = lazy(() => import("./GraphCanvas2D"));
const Graph3D = lazy(() => import("./GraphCanvas3D"));
const isMode = (value: unknown): value is "2d" | "3d" => value === "2d" || value === "3d";
const isBool = (value: unknown): value is boolean => typeof value === "boolean";
const BOARD = "/internal/xennote";

export default function GraphView({ notebookId }: { notebookId?: string }) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));
  const navigate = useNavigate();
  const [mode, setMode] = useLocalStorageState("xennote_graph_mode", mobile ? "2d" : "3d", isMode);
  const [merge, setMerge] = useLocalStorageState("xennote_graph_merge_tags", false, isBool);
  const [selectedId, select] = useState("");
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [webgl] = useState(() => {
    try {
      const gl = document.createElement("canvas").getContext("webgl2");
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      return !!gl;
    } catch {
      return false;
    }
  });
  const query = useQuery({
    queryKey: xennoteKeys.graph(notebookId, !notebookId && merge),
    queryFn: () => {
      const params = new URLSearchParams();
      if (notebookId) params.set("notebook", notebookId);
      else if (merge) params.set("mergeTags", "true");
      return api.get<NotebookGraph>(`/api/xennote/graph?${params}`);
    },
  });
  const title = query.data?.notebook_name ? `Graph: ${query.data.notebook_name}` : "Graph";
  useTitle(title);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  const nodes = query.data?.nodes;
  const links = query.data?.links;
  const primary = theme.palette.primary.main;
  const secondary = theme.palette.secondary.main;
  const graph = useMemo(
    () => ({
      nodes: (nodes ?? []).map((n) => ({ ...n, color: n.kind === "tag" ? secondary : primary })),
      links: (links ?? []).map((link) => ({ ...link })),
    }),
    [links, nodes, primary, secondary],
  );
  const selected = nodes?.find((node) => node.id === selectedId) ?? null;
  const modeShown = webgl ? mode : "2d";
  const height = mobile || (width > 0 && width < 480) ? 420 : 580;
  const openSelected = () => {
    if (!selected) return;
    const book = selected.notebook_id ? `/b/${selected.notebook_id}` : "";
    if (selected.kind === "page") navigate(`${BOARD}${book}/p/${selected.id}`);
    else if (book && selected.tag) navigate(`${BOARD}${book}/t/${encodeURIComponent(selected.tag)}`);
  };
  const neighbours =
    selected?.kind === "tag"
      ? (links ?? []).filter((link) => link.target === selectedId).map((link) => link.source)
      : [];

  return (
    <PageContainer width="wide">
      <PageHeader title={title} subtitle={notebookId ? undefined : "All notebooks"} actions={<NoteNavButton />} />
      <Stack direction="row" gap={1.5} mb={2} alignItems="center" flexWrap="wrap">
        <ToggleButtonGroup
          value={modeShown}
          exclusive
          size="small"
          aria-label="Graph dimension"
          sx={{ "& .MuiToggleButton-root": { px: 2, py: 1 } }}
          onChange={(_, next: unknown) => {
            if (isMode(next)) setMode(next);
          }}
        >
          <ToggleButton value="2d">2D</ToggleButton>
          <ToggleButton value="3d" disabled={!webgl}>
            3D
          </ToggleButton>
        </ToggleButtonGroup>
        {!notebookId && (
          <FormControlLabel
            control={<Switch checked={merge} onChange={(_, checked) => setMerge(checked)} />}
            label="Merge same tag names"
          />
        )}
        <Autocomplete
          options={nodes ?? []}
          value={selected}
          onChange={(_, value) => select(value?.id ?? "")}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          getOptionKey={(n) => n.id}
          getOptionLabel={(n) => (n.notebook_name ? `${n.label} · ${n.notebook_name}` : n.label)}
          renderInput={(params) => <TextField {...params} label="Find a page or tag" size="small" />}
          sx={{ minWidth: "min(240px, 100%)", flex: 1 }}
        />
      </Stack>
      <Paper variant="outlined" sx={{ overflow: "hidden", borderRadius: 2 }}>
        <Box ref={frame} sx={{ minHeight: height, bgcolor: "background.default" }}>
          {query.isPending ? (
            <DetailSkeleton height={height} />
          ) : query.error ? (
            <ErrorDisplay error={query.error} title="Couldn't load the graph" onRetry={() => query.refetch()} />
          ) : !nodes?.length ? (
            <EmptyState title="No pages to show" />
          ) : (
            width > 0 && (
              <Suspense fallback={<DetailSkeleton height={height} />}>
                {modeShown === "3d" ? (
                  <Graph3D
                    graph={graph}
                    width={width}
                    height={height}
                    background={theme.palette.background.default}
                    edge={theme.palette.text.disabled}
                    select={select}
                  />
                ) : (
                  <Graph2D
                    graph={graph}
                    width={width}
                    height={height}
                    background={theme.palette.background.default}
                    edge={theme.palette.text.disabled}
                    select={select}
                  />
                )}
              </Suspense>
            )
          )}
        </Box>
      </Paper>
      {query.data?.truncated && (
        <Typography variant="caption" color="text.secondary">
          Showing recent pages. Open a notebook graph for a closer view.
        </Typography>
      )}
      {selected && (
        <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
          <Typography component="h2" variant="subtitle1">
            {selected.label}
          </Typography>
          {selected.notebook_name && (
            <Typography color="text.secondary" variant="body2">
              {selected.notebook_name}
            </Typography>
          )}
          {(selected.kind === "page" || selected.notebook_id) && (
            <Button onClick={openSelected}>{selected.kind === "page" ? "Open page" : "Open tag"}</Button>
          )}
          {selected.kind === "tag" && !selected.notebook_id && (
            <Stack direction="row" flexWrap="wrap">
              {neighbours.slice(0, 20).map((id) => (
                <Button key={id} onClick={() => select(id)}>
                  {nodes?.find((node) => node.id === id)?.label}
                </Button>
              ))}
            </Stack>
          )}
        </Paper>
      )}
    </PageContainer>
  );
}
