import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
    Box, Button, InputAdornment, Stack, TextField, ToggleButton, ToggleButtonGroup,
    Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { startOfMonth, startOfWeek, startOfYear, subMonths } from "date-fns";
import type { BookDetailContext } from "./BookDetail";
import { useXenBudgetItems, type ItemFilters } from "../../../hooks/xenbudget/useItems";
import ItemListItem from "./components/ItemListItem";
import { CategoryChip, TagChip } from "./components/LabelChip";
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

type Quick = "all" | "expense" | "income" | "review" | "uncategorised" | "excluded";

const QUICK_FILTERS: { label: string; value: Quick }[] = [
    { label: "All", value: "all" },
    { label: "Expenses", value: "expense" },
    { label: "Income", value: "income" },
    { label: "Needs review", value: "review" },
    { label: "Uncategorised", value: "uncategorised" },
    { label: "Excluded", value: "excluded" },
];

// The built-in tag the importer and rules use to say "a human should look at this".
const TAG_NEEDS_REVIEW = "Needs review";

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
    const [activeTags, setActiveTags] = useState<string[]>([]);
    const [importOpen, setImportOpen] = useState(false);

    const toggle = (list: string[], set: (v: string[]) => void, name: string) =>
        set(list.includes(name) ? list.filter((n) => n !== name) : [...list, name]);

    // Filtering happens server-side (the list is paginated), so the filter object is part
    // of the query key rather than a useMemo over an already-loaded array.
    const filters: ItemFilters = useMemo(() => ({
        ...dateRange(dateFilter),
        q: search.trim() || undefined,
        categories: activeCategories.length ? activeCategories : undefined,
        // "Needs review" is that specific built-in tag; a chip row filters by any tag.
        tags: quick === "review"
            ? [TAG_NEEDS_REVIEW, ...activeTags]
            : (activeTags.length ? activeTags : undefined),
        type: quick === "expense" || quick === "income" ? quick : undefined,
        // The *state* of having no category, not the tag — so an item leaves this filter
        // the moment it's categorised, whether or not anyone cleared the tag.
        uncategorised: quick === "uncategorised" || undefined,
        excluded: quick === "excluded" ? "only" : "hidden",
    }), [dateFilter, search, quick, activeCategories, activeTags]);

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
                {book.tags.length > 0 && (
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                        {book.tags.map((tag) => (
                            <TagChip
                                key={tag._id} name={tag.name} registry={book.tags}
                                onClick={() => toggle(activeTags, setActiveTags, tag.name)}
                                sx={{
                                    cursor: "pointer",
                                    opacity: activeTags.length === 0 || activeTags.includes(tag.name) ? 1 : 0.4,
                                    fontWeight: activeTags.includes(tag.name) ? 700 : 400,
                                }}
                            />
                        ))}
                    </Stack>
                )}
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
                            || activeTags.length > 0 || activeCategories.length > 0
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
                                        tagRegistry={book.tags}
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
