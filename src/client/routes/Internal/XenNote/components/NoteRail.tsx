import type { ReactNode } from "react";
import { Link, useLocation, useMatch, useSearchParams, type To } from "react-router-dom";
import { Badge, Box, ListItemButton, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import NotesIcon from "@mui/icons-material/Notes";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import { railItemSx, railPanelSx } from "../../../../components/ui/railStyles";
import { sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import { useXenNotebooks } from "../../../../hooks/xennote/useXenNote";
import { useSharedXenNoteItems } from "../../../../hooks/xennote/usePageSharing";
import { useLocalStorageState } from "../../../../hooks/useLocalStorageState";
import { swatchColor } from "../noteColors";
import { reorderRowSx, useListDrag, type ReorderRowProps } from "../notebook/useListDrag";
import NoteRailSearch from "./NoteRailSearch";
import NoteRailTree from "./NoteRailTree";

const BOARD = "/internal/xennote";
const railGroupSx = { display: "flex", flexDirection: "column", gap: railPanelSx.gap } as const;
const isNotebookOrder = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === "string");

const UTILITIES = [
  { text: "Archive", to: `${BOARD}?scope=archive`, icon: <ArchiveOutlinedIcon /> },
  { text: "Trash", to: `${BOARD}?scope=trash`, icon: <DeleteOutlineIcon /> },
  { text: "Graph", to: `${BOARD}/graph`, icon: <HubOutlinedIcon /> },
];

function RailLink({
  icon,
  text,
  to,
  selected,
  onClick,
  indicator,
  reorder,
  dragging,
}: {
  icon: ReactNode;
  text: string;
  to: To;
  selected: boolean;
  onClick: () => void;
  indicator?: ReactNode;
  reorder?: ReorderRowProps;
  dragging?: boolean;
}) {
  return (
    <ListItemButton
      component={Link}
      to={to}
      selected={selected}
      aria-current={selected ? "page" : undefined}
      onClick={onClick}
      {...reorder}
      sx={{ ...railItemSx, ...(reorder && reorderRowSx(dragging ?? false)) }}
    >
      <Box sx={{ display: "flex", alignItems: "center", width: 20, justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </Box>
      <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: "inherit", fontSize: "inherit" }}>
        {text}
      </Typography>
      {indicator}
    </ListItemButton>
  );
}

export default function NoteRail({
  userId,
  onNavigate,
  onNewNotebook,
  variant = "list",
}: {
  userId: string;
  onNavigate: () => void;
  onNewNotebook: () => void;
  /** "tree" (a phone drawer): notebooks open to their sections and pages in place. "list" (desktop): flat, draggable. */
  variant?: "list" | "tree";
}) {
  const theme = useTheme();
  const pathname = useLocation().pathname.replace(/\/$/, "");
  const [params] = useSearchParams();
  const notebookId = useMatch(`${BOARD}/b/:notebookId/*`)?.params.notebookId;
  const atBoard = !!useMatch(BOARD);
  const notebookPath = notebookId ? `${BOARD}/b/${notebookId}` : undefined;
  const toolBase = notebookPath ?? BOARD;
  const routedTool =
    pathname === `${toolBase}/tasks` ? "tasks" : pathname === `${toolBase}/graph` ? "graph" : undefined;
  const requestedTool = notebookId ? params.get("tool")?.replace(/^notebook-/, "") : undefined;
  const tool = routedTool ?? requestedTool;
  const scope = params.get("scope");
  const { data: notebooks = [] } = useXenNotebooks();
  const [order, setOrder] = useLocalStorageState<string[]>(`xennote:notebook-order:${userId}`, [], isNotebookOrder);
  const rank = new Map(order.map((id, index) => [id, index]));
  const orderedNotebooks = notebooks.toSorted(
    (a, b) => (rank.get(a._id) ?? order.length) - (rank.get(b._id) ?? order.length),
  );
  const reorder = (id: string, { before, after }: { before?: string; after?: string }) => {
    const anchor = before ?? after;
    if (!anchor) return;
    const ids = orderedNotebooks.map((book) => book._id).filter((bookId) => bookId !== id);
    const index = ids.indexOf(anchor);
    if (index < 0) return;
    ids.splice(index + (before ? 0 : 1), 0, id);
    setOrder(ids);
  };
  const { listProps, drag, getRowProps } = useListDrag("data-notebook-row", reorder);
  const { data: shared = [] } = useSharedXenNoteItems();
  const sharedStatus = new Map(shared.flatMap(({ items }) => items.map((item) => [item.id, item.status])));
  const toolLink = (next: string, fallback: string) => {
    if (!notebookPath) return fallback;
    const search = new URLSearchParams(params);
    search.set("tool", next);
    return { pathname: routedTool ? notebookPath : pathname, search: search.toString() };
  };

  return (
    <Box
      component="nav"
      aria-label="XenNote navigation"
      sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      <Box sx={{ flexShrink: 0 }}>
        <NoteRailSearch />
      </Box>
      <Box data-list-drag-scroll sx={{ ...railGroupSx, flex: 1, minHeight: 0, overflowY: "auto" }}>
        <RailLink
          icon={<NotesIcon />}
          text="Loose notes"
          to={BOARD}
          selected={atBoard && scope !== "archive" && scope !== "trash"}
          onClick={onNavigate}
        />
        <Typography variant="caption" sx={{ ...sectionLabelSx, flexShrink: 0, px: 1.75, pt: 1.75, pb: 0.75 }}>
          Notebooks
        </Typography>
        {variant === "tree" ? (
          <NoteRailTree notebooks={orderedNotebooks} sharedStatus={sharedStatus} onNavigate={onNavigate} />
        ) : (
          <Box {...listProps} sx={{ ...railGroupSx, flexShrink: 0 }}>
            {orderedNotebooks.map((book) => {
              const color = swatchColor(theme, book.color);
              const status = sharedStatus.get(book._id);
              const sharedLabel =
                status === "new"
                  ? "New shared notebook"
                  : status === "changed"
                    ? "Shared notebook updated"
                    : "Shared notebook";
              const dragging = drag?.id === book._id;
              const dropEdge = drag?.target?.id === book._id ? drag.target.edge : undefined;
              return (
                <Box
                  key={book._id}
                  data-notebook-row={book._id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    position: "relative",
                    opacity: dragging ? 0.4 : 1,
                    "& > a": { flex: 1, minWidth: 0 },
                    ...(dropEdge && {
                      "&::after": {
                        content: '""',
                        position: "absolute",
                        insetInline: 0,
                        [dropEdge === "before" ? "top" : "bottom"]: -4,
                        height: 2,
                        bgcolor: "primary.main",
                        borderRadius: 1,
                        pointerEvents: "none",
                      },
                    }),
                  }}
                >
                  <RailLink
                    icon={
                      color ? (
                        <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color }} />
                      ) : (
                        <MenuBookOutlinedIcon />
                      )
                    }
                    text={book.name}
                    to={`${BOARD}/b/${book._id}`}
                    selected={notebookId === book._id && tool !== "tasks" && tool !== "graph"}
                    onClick={onNavigate}
                    reorder={orderedNotebooks.length > 1 ? getRowProps(book._id) : undefined}
                    dragging={dragging}
                    indicator={
                      <>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          {book.page_count}
                        </Typography>
                        {book.my_role !== "owner" && (
                          <Tooltip title={sharedLabel}>
                            <Badge variant="dot" color="primary" invisible={status !== "new" && status !== "changed"}>
                              <PeopleOutlineIcon fontSize="small" titleAccess={sharedLabel} />
                            </Badge>
                          </Tooltip>
                        )}
                      </>
                    }
                  />
                </Box>
              );
            })}
          </Box>
        )}
        <ListItemButton onClick={onNewNotebook} sx={{ ...railItemSx, color: "primary.main" }}>
          <AddIcon sx={{ fontSize: 20 }} />
          New notebook
        </ListItemButton>
      </Box>

      <Box sx={{ ...railGroupSx, pt: 1, mt: 1, borderTop: 1, borderColor: "divider" }}>
        {UTILITIES.map(({ text, to, icon }) => {
          const key = text.toLowerCase();
          const isTool = key === "graph";
          return (
            <RailLink
              key={text}
              icon={icon}
              text={text}
              to={isTool ? toolLink(key, to) : to}
              selected={isTool ? tool === key : atBoard && scope === key}
              onClick={onNavigate}
            />
          );
        })}
      </Box>
    </Box>
  );
}
