import {
    Alert, Box, Checkbox, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow,
    Tooltip, Typography,
} from "@mui/material";
import BlockIcon from "@mui/icons-material/Block";
import FlagIcon from "@mui/icons-material/Flag";
import type {
    ImportPreviewRow, DuplicateMatch, XenBudgetTag,
} from "../../../../../hooks/xenbudget/types";
import type { MappingError } from "../../../../../utils/csvMapping";
import TagChip from "../TagChip";
import { formatCurrency } from "../../../../../utils/currencyUtils";
import { cardSx } from "../../../../../components/ui/surfaceStyles";

interface PreviewStepProps {
    previews: ImportPreviewRow[];
    duplicates: DuplicateMatch[];
    errors: MappingError[];
    tagRegistry: XenBudgetTag[];
    currency: string;
    /** Row indices (into `previews`) the user has chosen to import. */
    selected: Set<number>;
    onToggle: (index: number) => void;
}

export default function PreviewStep({
    previews, duplicates, errors, tagRegistry, currency, selected, onToggle,
}: PreviewStepProps) {
    const duplicateIndices = new Set(duplicates.map((d) => d.index));
    const skipped = previews.filter((p) => p.skipped);
    const importable = previews.filter((p) => !p.skipped);

    return (
        <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                <Chip size="small" label={`${selected.size} to import`} color="primary" />
                {duplicates.length > 0 && <Chip size="small" variant="outlined" label={`${duplicates.length} look like duplicates`} />}
                {skipped.length > 0 && <Chip size="small" variant="outlined" label={`${skipped.length} skipped by rules`} />}
                {errors.length > 0 && <Chip size="small" variant="outlined" color="warning" label={`${errors.length} unreadable`} />}
            </Stack>

            {duplicates.length > 0 && (
                <Alert severity="info">
                    Rows matching something already in this book are unticked. Two identical
                    charges on the same day are both real, so tick any you actually want.
                </Alert>
            )}

            {skipped.length > 0 && (
                <Alert severity="warning">
                    {skipped.length} row{skipped.length === 1 ? "" : "s"} will not be imported at all,
                    because {skipped.length === 1 ? "a rule is" : "rules are"} set to skip{" "}
                    {[...new Set(skipped.map((s) => s.skipped_by))].filter(Boolean).map((r) => `"${r}"`).join(", ")}.
                </Alert>
            )}

            <Box sx={{ ...cardSx, maxHeight: 340, overflow: "auto" }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox" />
                            <TableCell>Date</TableCell>
                            <TableCell>Description</TableCell>
                            <TableCell>Tags</TableCell>
                            <TableCell align="right">Amount</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {importable.map((row) => {
                            const isDuplicate = duplicateIndices.has(row.index);
                            return (
                                <TableRow key={row.index} sx={{ opacity: selected.has(row.index) ? 1 : 0.5 }}>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            size="small"
                                            checked={selected.has(row.index)}
                                            onChange={() => onToggle(row.index)}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                                        {new Date(row.item.date).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" alignItems="center" spacing={0.5}>
                                            <Typography variant="body2" noWrap>{row.item.description}</Typography>
                                            {row.item.flagged && (
                                                <Tooltip title={row.item.flag_reason || "Flagged"}>
                                                    <FlagIcon sx={{ fontSize: 14 }} color="warning" />
                                                </Tooltip>
                                            )}
                                            {row.item.excluded && (
                                                <Tooltip title={`Excluded from totals by "${row.item.excluded_reason}"`}>
                                                    <BlockIcon sx={{ fontSize: 14 }} color="disabled" />
                                                </Tooltip>
                                            )}
                                            {isDuplicate && <Chip size="small" variant="outlined" label="dup" sx={{ height: 16, fontSize: 10 }} />}
                                        </Stack>
                                        {row.item.description !== row.original.description && (
                                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                                                was &ldquo;{row.original.description}&rdquo;
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                                            {row.item.tags.map((t) => (
                                                <TagChip key={t} tag={t} registry={tagRegistry} sx={{ height: 16, fontSize: 10 }} />
                                            ))}
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                color: row.item.type === "income" ? "success.main" : "text.primary",
                                                textDecoration: row.item.excluded ? "line-through" : "none",
                                            }}
                                        >
                                            {row.item.type === "income" ? "+" : "−"}
                                            {formatCurrency(row.item.amount, currency)}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </Box>

            {errors.length > 0 && (
                <Box sx={{ ...cardSx, p: 1.25, maxHeight: 140, overflowY: "auto" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        Rows that could not be read:
                    </Typography>
                    {errors.slice(0, 30).map((e) => (
                        <Typography key={e.index} variant="caption" sx={{ display: "block" }}>
                            row {e.index + 1}: {e.reason}
                        </Typography>
                    ))}
                    {errors.length > 30 && (
                        <Typography variant="caption" color="text.secondary">
                            …and {errors.length - 30} more
                        </Typography>
                    )}
                </Box>
            )}
        </Stack>
    );
}
