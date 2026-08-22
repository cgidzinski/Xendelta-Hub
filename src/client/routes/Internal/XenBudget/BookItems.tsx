import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
    Autocomplete, Box, Button, Chip, InputAdornment, Stack, TextField, ToggleButton,
    ToggleButtonGroup, Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { startOfMonth, startOfWeek, startOfYear, subMonths } from "date-fns";
import type { BookDetailContext } from "./BookDetail";
import { useXenBudgetItems, type ItemFilters } from "../../../hooks/xenbudget/useItems";
import ItemListItem from "./components/ItemListItem";
import { CategoryChip, FlagChip } from "./components/LabelChip";
import ImportWizard from "./components/ImportWizard";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { groupByDay } from "../../../utils/dateGrouping";
import { emptyStateSx, emptyStateIconCircleSx, sectionLabelSx } from "../../../components/ui/surfaceStyles";

type DateFilter = "all" | "thisWeek" | "thisMonth" | "lastMonth" | "thisYear";

const DATE_FILTERS: { label: string; value: DateFilter }[] = [
    { label: "All", value: "all" },
    { label: "This week", value: "thisWeek" },
    { label: "This month", value: "thisMonth" },
    { label: "Last month", value: "lastMonth" },
    { label: "This year", value: "thisYear" },
];

type Quick = "all" | "expense" | "income";

const QUICK_FILTERS: { label: string; value: Quick }[] = [
    { label: "All", value: "all" },
    { label: "Expenses", value: "expense" },
    { label: "Income", value: "income" },
];

// Synthetic option in the flags dropdown below — not a real flag or a field on the item.
const EXCLUDED_FILTER = "__excluded__";
// The built-in flag the importer uses to say "nothing matched" — special-cased below so
// selecting it also catches items with no category that were never run through an import.
const FLAG_UNCATEGORISED = "Uncategorised";

function dateRange(filter: DateFilter): { from?: string; to?: string } {
    const now = new Date();
    if (filter === "thisWeek") return { from: startOfWeek(now).toISOString() };
    if (filter === "thisMonth") return { from: startOfMonth(now).toISOString() };
    if (filter === "lastMonth") {
        return {
            from: startOfMonth(subMonths(now, 1)).toISOString(),
            to: startOfMonth(now).toISOString(),
        };
    }
    if (filter === "thisYear") return { from: startOfYear(now).toISOString() };
    return {};
}

export default function BookItems() {
    const { book, onEditItem } = useOutletContext<BookDetailContext>();
    const [search, setSearch] = useState("");
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");
    const [quick, setQuick] = useState<Quick>("all");
    const [activeCategories, setActiveCategories] = useState<string[]>([]);
    const [selectedFlags, setSelectedFlags] = useState<string[]>([]);
    const [importOpen, setImportOpen] = useState(false);

    const toggle = (list: string[], set: (v: string[]) => void, name: string) =>
        set(list.includes(name) ? list.filter((n) => n !== name) : [...list, name]);

    const flagFilterOptions = useMemo(
        () => [...book.flags.map((f) => f.name), EXCLUDED_FILTER],
        [book.flags],
    );

    // Filtering happens server-side (the list is paginated), so the filter object is part
    // of the query key rather than a useMemo over an already-loaded array.
    const filters: ItemFilters = useMemo(() => {
        const realFlags = selectedFlags.filter((f) => f !== EXCLUDED_FILTER && f !== FLAG_UNCATEGORISED);
        return {
            ...dateRange(dateFilter),
            q: search.trim() || undefined,
            categories: activeCategories.length ? activeCategories : undefined,
            flags: realFlags.length ? realFlags : undefined,
            type: quick === "expense" || quick === "income" ? quick : undefined,
            // The *state* of having no category, not just the flag — so a hand-entered
            // item with no category is caught too, not only ones an import flagged.
            uncategorised: selectedFlags.includes(FLAG_UNCATEGORISED) || undefined,
            excluded: selectedFlags.includes(EXCLUDED_FILTER) ? "only" : "hidden",
        };
    }, [dateFilter, search, quick, activeCategories, selectedFlags]);

    const {
        items, isLoading, isError, error, hasMore, loadMore, isLoadingMore,
    } = useXenBudgetItems(book._id, filters);

    const dayGroups = useMemo(() => groupByDay(items, (i) => i.date), [items]);

    return (
        <Box sx={{ p: 2 }}>
            <Stack spacing={1.5} sx={{ mb: 2 }}>
                <Stack direction="row" spacing={1}>
                    <TextField
                        size="small" fullWidth placeholder="Search descriptions"
                        value={search} onChange={(e) => setSearch(e.target.value)}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                                ),
                            },
                        }}
                    />
                    <Button
                        size="small" variant="outlined" startIcon={<UploadFileIcon />}
                        onClick={() => setImportOpen(true)} sx={{ flexShrink: 0 }}
                    >
                        Import
                    </Button>
                </Stack>
                <Box sx={{ overflowX: "auto", pb: 0.5 }}>
                    <ToggleButtonGroup
                        size="small" exclusive value={dateFilter}
                        onChange={(_, v) => v && setDateFilter(v)}
                    >
                        {DATE_FILTERS.map((f) => (
                            <ToggleButton key={f.value} value={f.value}>{f.label}</ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                </Box>
                <Box sx={{ overflowX: "auto", pb: 0.5 }}>
                    <ToggleButtonGroup
                        size="small" exclusive value={quick}
                        onChange={(_, v) => v && setQuick(v)}
                    >
                        {QUICK_FILTERS.map((f) => (
                            <ToggleButton key={f.value} value={f.value}>{f.label}</ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                </Box>
                {book.categories.length > 0 && (
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                        {book.categories.map((c) => (
                            <CategoryChip
                                key={c._id} name={c.name} registry={book.categories}
                                onClick={() => toggle(activeCategories, setActiveCategories, c.name)}
                                sx={{
                                    cursor: "pointer",
                                    // A selected chip reads as pressed rather than merely present.
                                    opacity: activeCategories.length === 0 || activeCategories.includes(c.name) ? 1 : 0.4,
                                    fontWeight: activeCategories.includes(c.name) ? 700 : 400,
                                }}
                            />
                        ))}
                    </Stack>
                )}
                <Autocomplete
                    multiple size="small" options={flagFilterOptions}
                    value={selectedFlags} onChange={(_, v) => setSelectedFlags(v)}
                    getOptionLabel={(o) => (o === EXCLUDED_FILTER ? "Excluded" : o)}
                    renderTags={(value, getTagProps) => value.map((option, index) => {
                        const { key, ...tagProps } = getTagProps({ index });
                        return option === EXCLUDED_FILTER
                            ? <Chip key={key} size="small" label="Excluded" {...tagProps} />
                            : <FlagChip key={key} name={option} registry={book.flags} {...tagProps} />;
                    })}
                    renderInput={(params) => (
                        <TextField
                            {...params} label="Flags"
                            placeholder={selectedFlags.length ? undefined : "Filter by flag"}
                        />
                    )}
                    sx={{ minWidth: 220 }}
                />
            </Stack>

            {isError ? (
                <ErrorDisplay error={error} />
            ) : isLoading ? (
                <LoadingSpinner message="Loading items..." />
            ) : items.length === 0 ? (
                <Box sx={emptyStateSx}>
                    <Box sx={emptyStateIconCircleSx}>
                        <ReceiptLongIcon color="disabled" />
                    </Box>
                    <Typography variant="subtitle1">Nothing here</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {search || quick !== "all" || dateFilter !== "all"
                            || selectedFlags.length > 0 || activeCategories.length > 0
                            ? "No items match those filters."
                            : "Add your first item, or import a CSV from your bank."}
                    </Typography>
                </Box>
            ) : (
                <Stack spacing={2}>
                    {dayGroups.map((group) => (
                        <Box key={group.key}>
                            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.75 }}>
                                {group.label}
                            </Typography>
                            <Stack spacing={0.75}>
                                {group.items.map((item) => (
                                    <ItemListItem
                                        key={item._id}
                                        item={item}
                                        members={book.members}
                                        categoryRegistry={book.categories}
                                        flagRegistry={book.flags}
                                        onClick={onEditItem}
                                    />
                                ))}
                            </Stack>
                        </Box>
                    ))}
                    {hasMore && (
                        <Button onClick={() => loadMore()} disabled={isLoadingMore} sx={{ alignSelf: "center" }}>
                            {isLoadingMore ? "Loading..." : "Load more"}
                        </Button>
                    )}
                </Stack>
            )}

            <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} book={book} />
        </Box>
    );
}
