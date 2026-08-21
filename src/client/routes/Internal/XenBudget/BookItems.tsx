import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
    Box, Button, InputAdornment, Stack, TextField, ToggleButton, ToggleButtonGroup,
    Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import { startOfMonth, startOfWeek, startOfYear, subMonths } from "date-fns";
import type { BookDetailContext } from "./BookDetail";
import { useXenBudgetItems, type ItemFilters } from "../../../hooks/xenbudget/useItems";
import ItemListItem from "./components/ItemListItem";
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

type Quick = "all" | "expense" | "income" | "flagged" | "excluded";

const QUICK_FILTERS: { label: string; value: Quick }[] = [
    { label: "All", value: "all" },
    { label: "Expenses", value: "expense" },
    { label: "Income", value: "income" },
    { label: "Needs review", value: "flagged" },
    { label: "Excluded", value: "excluded" },
];

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

    // Filtering happens server-side (the list is paginated), so the filter object is part
    // of the query key rather than a useMemo over an already-loaded array.
    const filters: ItemFilters = useMemo(() => ({
        ...dateRange(dateFilter),
        q: search.trim() || undefined,
        type: quick === "expense" || quick === "income" ? quick : undefined,
        flagged: quick === "flagged" || undefined,
        excluded: quick === "excluded" ? "only" : "hidden",
    }), [dateFilter, search, quick]);

    const {
        items, isLoading, isError, error, hasMore, loadMore, isLoadingMore,
    } = useXenBudgetItems(book._id, filters);

    const dayGroups = useMemo(() => groupByDay(items, (i) => i.date), [items]);

    return (
        <Box sx={{ p: 2 }}>
            <Stack spacing={1.5} sx={{ mb: 2 }}>
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
                            ? "No items match those filters."
                            : "Add your first item to start tracking."}
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
        </Box>
    );
}
