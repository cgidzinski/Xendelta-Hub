import {
    Alert, Box, Checkbox, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow,
    Tooltip, Typography,
} from "@mui/material";
import BlockIcon from "@mui/icons-material/Block";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import type {
    ImportPreviewRow, DuplicateMatch, XenBudgetLabel,
} from "../../../../../hooks/xenbudget/types";
import type { MappingError } from "../../../../../utils/csvMapping";
import { CategoryChip, FlagChip } from "../LabelChip";
import { formatCurrency } from "../../currency";
import { cardSx } from "../../../../../components/ui/surfaceStyles";
import { FLAG_OFF_BUDGET } from "../../../../../constants/xenbudget";

interface PreviewStepProps {
    previews: ImportPreviewRow[];
    duplicates: DuplicateMatch[];
    errors: MappingError[];
    categoryRegistry: XenBudgetLabel[];
    flagRegistry: XenBudgetLabel[];
    currency: string;
    /** Row indices (into `previews`) the user has chosen to import. */
    selected: Set<number>;
    onToggle: (index: number) => void;
    /** Row indices outside the wizard's optional date cutoff — shown, but unticked. */
    outOfRangeIndices?: Set<number>;
    /** Name(s) of the file(s) this preview was built from, e.g. "statement.csv". */
    fileLabel?: string;
}

export default function PreviewStep({
    previews, duplicates, errors, categoryRegistry, flagRegistry, currency, selected, onToggle,
    outOfRangeIndices, fileLabel,
}: PreviewStepProps) {
    const duplicateIndices = new Set(duplicates.map((d) => d.index));
    const skipped = previews.filter((p) => p.skipped);
    const importable = previews.filter((p) => !p.skipped);
    const outOfRange = outOfRangeIndices ?? new Set<number>();

    return (
        <Stack spacing={2}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                    <Chip size="small" label={`${selected.size} to import`} color="primary" />
                    {duplicates.length > 0 && <Chip size="small" variant="outlined" label={`${duplicates.length} look like duplicates`} />}
                    {outOfRange.size > 0 && <Chip size="small" variant="outlined" label={`${outOfRange.size} outside the date range`} />}
                    {skipped.length > 0 && <Chip size="small" variant="outlined" label={`${skipped.length} skipped by rules`} />}
                    {errors.length > 0 && <Chip size="small" variant="outlined" color="warning" label={`${errors.length} unreadable`} />}
                </Stack>
                {fileLabel && (
                    <Chip
                        size="small" variant="outlined" icon={<InsertDriveFileIcon fontSize="small" />}
                        label={fileLabel} sx={{ borderRadius: 1, flexShrink: 0, maxWidth: "100%" }}
                    />
                )}
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
                            <TableCell>Category</TableCell>
                            <TableCell align="right">Amount</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {importable.map((row) => {
                            const isDuplicate = duplicateIndices.has(row.index);
                            const isOutOfRange = outOfRange.has(row.index);
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
                                        {new Date(row.item.date).toLocaleDateString("en-US", {
                                            month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
                                        })}
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" alignItems="center" spacing={0.5}>
                                            <Typography variant="body2" noWrap>{row.item.description}</Typography>
                                            {row.item.flags.includes(FLAG_OFF_BUDGET) && (
                                                <Tooltip title="Off budget — not counted in totals">
                                                    <BlockIcon sx={{ fontSize: 14 }} color="disabled" />
                                                </Tooltip>
                                            )}
                                            {isDuplicate && <Chip size="small" variant="outlined" label="dup" sx={{ height: 16, fontSize: 10 }} />}
                                            {isOutOfRange && <Chip size="small" variant="outlined" color="warning" label="outside range" sx={{ height: 16, fontSize: 10 }} />}
                                        </Stack>
                                        {row.item.description !== row.original.description && (
                                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                                                was &ldquo;{row.original.description}&rdquo;
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                                            {row.item.categories.map((c) => (
                                                <CategoryChip key={c} name={c} registry={categoryRegistry} sx={{ height: 16, fontSize: 10 }} />
                                            ))}
                                            {row.item.flags.map((t) => (
                                                <FlagChip key={t} name={t} registry={flagRegistry} sx={{ height: 16, fontSize: 10 }} />
                                            ))}
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                color: row.item.type === "income" ? "success.main" : "error.main",
                                                textDecoration: row.item.flags.includes(FLAG_OFF_BUDGET) ? "line-through" : "none",
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
