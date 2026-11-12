import type { ReactNode } from "react";
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import EmptyState from "../../../components/ui/EmptyState";
import ListSkeleton from "../../../components/ui/ListSkeleton";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** CSS width on a computer. */
  width?: number | string;
  align?: "left" | "right";
  /** On a phone the row becomes a card: the first column is its title, the rest are label and value pairs. */
  hideOnPhone?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * A table on a computer; on a phone each row is a card, so nothing scrolls sideways. The first column is the card's
 * title and the others are label and value pairs.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  onRowClick,
  emptyTitle = "Nothing here",
  emptyDescription,
}: DataTableProps<T>) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("md"));

  if (loading && !rows) return <ListSkeleton rows={6} height={52} gap={1} />;
  if (!rows || rows.length === 0)
    return <EmptyState title={emptyTitle} description={emptyDescription} sx={{ py: 5 }} />;

  if (phone) {
    const [title, ...rest] = columns;
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {rows.map((row) => (
          <Box
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            role={onRowClick ? "button" : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={onRowClick ? (e) => (e.key === "Enter" || e.key === " ") && onRowClick(row) : undefined}
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              p: 1.5,
              cursor: onRowClick ? "pointer" : "default",
              minHeight: 44,
            }}
          >
            <Box sx={{ mb: 0.75 }}>{title.render(row)}</Box>
            {rest
              .filter((c) => !c.hideOnPhone)
              .map((c) => (
                <Box
                  key={c.key}
                  sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.25, alignItems: "center" }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {c.header}
                  </Typography>
                  <Box sx={{ textAlign: "right", minWidth: 0 }}>{c.render(row)}</Box>
                </Box>
              ))}
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
      <Table size="medium">
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell
                key={c.key}
                align={c.align}
                sx={{
                  width: c.width,
                  color: "text.disabled",
                  fontWeight: 600,
                  fontSize: 12,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                {c.header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              hover={!!onRowClick}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(row) : undefined}
              sx={{ cursor: onRowClick ? "pointer" : "default", "&:last-child td": { borderBottom: 0 } }}
            >
              {columns.map((c) => (
                <TableCell key={c.key} align={c.align}>
                  {c.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** "1 to 25 of 1,284" with Previous and Next. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {from.toLocaleString()} to {to.toLocaleString()} of {total.toLocaleString()}
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button size="small" variant="outlined" color="inherit" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="small" variant="outlined" color="inherit" disabled={to >= total} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </Box>
    </Box>
  );
}
