import { useMemo, useState } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import {
    Alert, Autocomplete, Box, Button, Chip, InputAdornment, Stack, TextField, Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import { endOfDay, startOfWeek, startOfYear, subWeeks } from "date-fns";
import type { BookDetailContext } from "./BookDetail";
import { useXenBudgetItems, type ItemFilters } from "../../../hooks/xenbudget/useItems";
import ItemListItem from "./components/ItemListItem";
import { CategoryChip, FlagChip } from "./components/LabelChip";
import DateFilterModal, {
    dateFilterLabel, DEFAULT_DATE_FILTER, parseDateFilterValue, serializeDateFilterValue,
    type DateFilterValue,
} from "./components/DateFilterModal";
import ReviewModal from "./components/ReviewModal";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { groupByDay } from "../../../utils/dateGrouping";
import { emptyStateSx, emptyStateIconCircleSx, sectionLabelSx } from "../../../components/ui/surfaceStyles";

/** What a budget hands over when its "View items" action navigates here. */
interface BudgetFilterSeed {
    categories: string[];
    from: string;
    to: string;
}

// Synthetic options in the filters dropdown below — not real flags or fields on the item.
const EXCLUDED_FILTER = "__excluded__";
const TYPE_EXPENSE = "__type_expense__";
const TYPE_INCOME = "__type_income__";
// The built-in flag the importer uses to say "nothing matched" — special-cased below so
// selecting it also catches items with no category that were never run through an import.
const FLAG_UNCATEGORISED = "Uncategorised";
const FLAG_NEEDS_REVIEW = "Needs review";

function dateRange(value: DateFilterValue): { from?: string; to?: string } {
    const now = new Date();
    switch (value.preset) {
        case "thisWeek":
            return { from: startOfWeek(now).toISOString() };
        case "lastWeek":
            return {
                from: startOfWeek(subWeeks(now, 1)).toISOString(),
                to: startOfWeek(now).toISOString(),
            };
        case "thisYear":
            return { from: startOfYear(now).toISOString() };
        case "custom":
            return {
                from: value.from ? value.from.toISOString() : undefined,
                to: value.to ? endOfDay(value.to).toISOString() : undefined,
            };
        default:
            return {};
    }
}

export default function BookItems() {
    const { book, onPreviewItem } = useOutletContext<BookDetailContext>();
    // "View items" on a budget hands over that budget's scope and window, so the tab opens
    // showing the items the bar was measuring rather than everything in the book.
    const seed = (useLocation().state as { budgetFilter?: BudgetFilterSeed } | null)?.budgetFilter;
    const [search, setSearch] = useState("");
    // Remembered per book, so leaving and coming back to Items picks up the same date
    // filter — except a budget's "View items" seed always wins, since that's a deliberate
    // navigation into a specific window, not a preference to fall back on.
    const dateLsKey = `xenbudget_dateFilter_items_${book._id}`;
    const [dateValue, setDateValueState] = useState<DateFilterValue>(
        seed ? {
            preset: "custom",
            from: new Date(seed.from),
            // The budget's window ends exclusively; the date filter's end is inclusive of
            // that whole day, so it steps back an instant to name the last covered day.
            to: new Date(new Date(seed.to).getTime() - 1),
        } : parseDateFilterValue(localStorage.getItem(dateLsKey)) ?? DEFAULT_DATE_FILTER,
    );
    const setDateValue = (next: DateFilterValue) => {
        setDateValueState(next);
        localStorage.setItem(dateLsKey, serializeDateFilterValue(next));
    };
    const [dateModalOpen, setDateModalOpen] = useState(false);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [activeCategories, setActiveCategories] = useState<string[]>(seed?.categories ?? []);
    const [selectedFilters, setSelectedFilters] = useState<string[]>([]);

    const toggle = (list: string[], set: (v: string[]) => void, name: string) =>
        set(list.includes(name) ? list.filter((n) => n !== name) : [...list, name]);

    const filterOptions = useMemo(
        () => [TYPE_EXPENSE, TYPE_INCOME, ...book.flags.map((f) => f.name), EXCLUDED_FILTER],
        [book.flags],
    );

    // Filtering happens server-side (the list is paginated), so the filter object is part
    // of the query key rather than a useMemo over an already-loaded array.
    const filters: ItemFilters = useMemo(() => {
        const realFlags = selectedFilters.filter(
            (f) => ![EXCLUDED_FILTER, FLAG_UNCATEGORISED, TYPE_EXPENSE, TYPE_INCOME].includes(f),
        );
        const wantsExpense = selectedFilters.includes(TYPE_EXPENSE);
        const wantsIncome = selectedFilters.includes(TYPE_INCOME);
        return {
            ...dateRange(dateValue),
            q: search.trim() || undefined,
            categories: activeCategories.length ? activeCategories : undefined,
            flags: realFlags.length ? realFlags : undefined,
            // Selecting both (or neither) means "all types" — no filter to apply.
            type: wantsExpense !== wantsIncome ? (wantsExpense ? "expense" : "income") : undefined,
            // The *state* of having no category, not just the flag — so a hand-entered
            // item with no category is caught too, not only ones an import flagged.
            uncategorised: selectedFilters.includes(FLAG_UNCATEGORISED) || undefined,
            excluded: selectedFilters.includes(EXCLUDED_FILTER) ? "only" : "hidden",
        };
    }, [dateValue, search, activeCategories, selectedFilters]);

    const {
        items, isLoading, isError, error, hasMore, loadMore, isLoadingMore,
    } = useXenBudgetItems(book._id, filters);

    const dayGroups = useMemo(() => groupByDay(items, (i) => i.date), [items]);

    const reviewCount = book.review_count ?? 0;
    const needsReviewCount = book.needs_review_count ?? 0;
    const needsReviewFilterActive = selectedFilters.includes(FLAG_NEEDS_REVIEW);

    const toggleNeedsReviewFilter = () =>
        setSelectedFilters((prev) =>
            prev.includes(FLAG_NEEDS_REVIEW)
                ? prev.filter((f) => f !== FLAG_NEEDS_REVIEW)
                : [...prev, FLAG_NEEDS_REVIEW],
        );

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box sx={{ px: 2, pt: 2, flexShrink: 0 }}>
                <Stack spacing={1.5} sx={{ mb: 2 }}>
                    {needsReviewCount > 0 && (
                        <Alert
                            severity="error"
                            variant="outlined"
                            sx={{ alignItems: "center" }}
                            action={
                                <Button
                                    size="small"
                                    variant="contained"
                                    color="error"
                                    startIcon={<FactCheckIcon />}
                                    onClick={toggleNeedsReviewFilter}
                                >
                                    {needsReviewFilterActive ? "Clear" : "Show"}
                                </Button>
                            }
                        >
                            {needsReviewCount} Flagged
                        </Alert>
                    )}
                    {reviewCount > 0 && (
                        <Alert
                            severity="warning"
                            variant="outlined"
                            sx={{ alignItems: "center" }}
                            action={
                                <Button
                                    size="small" variant="contained" color="warning"
                                    startIcon={<FactCheckIcon />}
                                    onClick={() => setReviewOpen(true)}
                                >
                                    Review
                                </Button>
                            }
                        >
                            {reviewCount} Missing Category
                        </Alert>
                    )}
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
                    <Stack direction="row" spacing={1}>
                        <Autocomplete
                            multiple disableCloseOnSelect size="small" fullWidth options={filterOptions}
                            value={selectedFilters} onChange={(_, v) => setSelectedFilters(v)}
                            groupBy={(o) => (o === TYPE_EXPENSE || o === TYPE_INCOME
                                ? "Type" : o === EXCLUDED_FILTER ? "Other" : "Flags")}
                            getOptionLabel={(o) => (
                                o === EXCLUDED_FILTER ? "Excluded"
                                    : o === TYPE_EXPENSE ? "Expenses"
                                        : o === TYPE_INCOME ? "Income" : o
                            )}
                            renderTags={(value, getTagProps) => value.map((option, index) => {
                                const { key, ...tagProps } = getTagProps({ index });
                                if (option === EXCLUDED_FILTER) {
                                    return <Chip key={key} size="small" label="Excluded" {...tagProps} />;
                                }
                                if (option === TYPE_EXPENSE) {
                                    return (
                                        <Chip
                                            key={key} size="small" label="Expenses"
                                            icon={<TrendingDownIcon fontSize="small" />} {...tagProps}
                                        />
                                    );
                                }
                                if (option === TYPE_INCOME) {
                                    return (
                                        <Chip
                                            key={key} size="small" label="Income" color="success"
                                            icon={<TrendingUpIcon fontSize="small" />} {...tagProps}
                                        />
                                    );
                                }
                                return <FlagChip key={key} name={option} registry={book.flags} {...tagProps} />;
                            })}
                            renderInput={(params) => (
                                <TextField
                                    {...params} label="Filters"
                                    placeholder={selectedFilters.length ? undefined : "Filter items"}
                                />
                            )}
                        />
                        <Button
                            size="small" variant="outlined" startIcon={<CalendarMonthIcon />}
                            onClick={() => setDateModalOpen(true)} sx={{ flexShrink: 0 }}
                        >
                            {dateFilterLabel(dateValue)}
                        </Button>
                    </Stack>
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
                </Stack>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2, pb: 2 }}>
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
                            {search || dateValue.preset !== "all"
                                || selectedFilters.length > 0 || activeCategories.length > 0
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
                                            onClick={onPreviewItem}
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

            <DateFilterModal
                open={dateModalOpen} onClose={() => setDateModalOpen(false)}
                value={dateValue} onChange={setDateValue}
            />
            <ReviewModal
                open={reviewOpen} onClose={() => setReviewOpen(false)}
                book={book}
            />
        </Box>
    );
}
