import { useContext, useState } from "react";
import {
  Box,
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useQuery } from "@tanstack/react-query";
import { PageQuery } from "@shared/xennote/pageSchema";
import { pageQuerySchema, propertyTypes, type PagePropertyQuery } from "@shared/xennote/properties";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { api } from "../../../../config/api";
import { xennoteKeys } from "../../../../hooks/xennote/keys";
import { useSocketInvalidate } from "../../../../hooks/useSocketEvent";
import { PageLinksContext } from "./pageLinksContext";

const labels = { equals: "Equals", atLeast: "At least", atMost: "At most", exists: "Exists" };

function QueryBlock({ node, editor, updateAttributes }: NodeViewProps) {
  const { sourcePageId, onOpenPage } = useContext(PageLinksContext);
  const raw: unknown = node.attrs.query;
  const parsed = pageQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : null;
  const key = xennoteKeys.pageQuery(sourcePageId ?? "", query);
  useSocketInvalidate("xennote:notebook_update", [key]);
  useSocketInvalidate("xennote:page_update", [key]);
  const result = useQuery({
    queryKey: key,
    queryFn: () =>
      api.post<Array<{ id: string; title: string; value: string | number }>>(
        `/api/xennote/pages/${sourcePageId}/query`,
        query,
      ),
    enabled: !!sourcePageId && !!query,
  });
  const [draft, setDraft] = useState<PagePropertyQuery | null>(null);
  const [error, setError] = useState("");
  const begin = () => {
    setError("");
    setDraft(query ?? { key: "", type: "text", operator: "exists", limit: 20 });
  };
  const apply = () => {
    if (!draft) return;
    const check = pageQuerySchema.safeParse({
      ...draft,
      value:
        draft.operator === "exists"
          ? undefined
          : draft.type === "number"
            ? String(draft.value ?? "").trim()
              ? Number(draft.value)
              : undefined
            : draft.value,
    });
    if (!check.success) return setError(check.error.issues[0]?.message ?? "Check the filter.");
    updateAttributes({ query: check.data });
    setDraft(null);
  };
  const rangeAllowed = draft?.type === "number" || draft?.type === "date";
  return (
    <NodeViewWrapper contentEditable={false}>
      <Box sx={{ my: 1, p: 1.5, border: 1, borderColor: "divider", borderRadius: 2, overflow: "auto" }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            {query ? `Pages by ${query.key}` : "Page query"}
          </Typography>
          {editor.isEditable && (
            <Button onClick={begin} size="small">
              Configure
            </Button>
          )}
        </Stack>
        {result.error ? (
          <Typography color="error" variant="body2">
            Couldn't run the query.
          </Typography>
        ) : query && result.isFetching && !result.data ? (
          <Typography variant="body2">Loading pages…</Typography>
        ) : result.data?.length ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Page</TableCell>
                <TableCell>{query?.key}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Button size="small" onClick={() => onOpenPage(row.id)}>
                      {row.title || "Untitled page"}
                    </Button>
                  </TableCell>
                  <TableCell>{row.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          query && (
            <Typography variant="body2" color="text.secondary">
              No pages match.
            </Typography>
          )
        )}
      </Box>
      {draft && (
        <ResponsiveDialog
          open
          title="Page query"
          onClose={() => setDraft(null)}
          actions={
            <>
              <Button onClick={() => setDraft(null)}>Cancel</Button>
              <Button variant="contained" onClick={apply}>
                Apply
              </Button>
            </>
          }
        >
          <Stack spacing={2} pt={1}>
            <TextField
              label="Property name"
              value={draft.key}
              onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            />
            <TextField
              select
              label="Property type"
              value={draft.type}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  type: e.target.value as PagePropertyQuery["type"],
                  operator: "exists",
                  value: undefined,
                })
              }
            >
              {propertyTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Filter"
              value={draft.operator}
              onChange={(e) => setDraft({ ...draft, operator: e.target.value as PagePropertyQuery["operator"] })}
            >
              {Object.entries(labels).map(([value, label]) => (
                <MenuItem
                  key={value}
                  value={value}
                  disabled={!rangeAllowed && value !== "exists" && value !== "equals"}
                >
                  {label}
                </MenuItem>
              ))}
            </TextField>
            {draft.operator !== "exists" && (
              <TextField
                label="Value"
                value={draft.value ?? ""}
                type={draft.type === "date" ? "date" : draft.type === "number" ? "number" : "text"}
                slotProps={draft.type === "date" ? { inputLabel: { shrink: true } } : undefined}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              />
            )}
            {error && (
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            )}
          </Stack>
        </ResponsiveDialog>
      )}
    </NodeViewWrapper>
  );
}

export const PageQueryView = PageQuery.extend({ addNodeView: () => ReactNodeViewRenderer(QueryBlock) });
