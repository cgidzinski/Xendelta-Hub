import { useMemo, useState } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import {
    Alert, Autocomplete, Avatar, Box, Button, Chip, Divider, InputAdornment, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import { startOfWeek, startOfYear, subWeeks, subDays, startOfMonth, endOfMonth } from "date-fns";
import type { BookDetailContext } from "./BookDetail";
import { useXenBudgetItems, type ItemFilters } from "../../../hooks/xenbudget/useItems";
import ItemListItem from "./components/ItemListItem";
import { CategoryChip, FlagChip } from "./components/LabelChip";
import DateFilterModal, {
    dateFilterLabel, DEFAULT_DATE_FILTER, parseDateFilterValue, serializeDateFilterValue,
    type DateFilterValue,
} from "./components/DateFilterModal";
import ReviewModal from "./components/ReviewModal";
import ItemsTotalsBar from "./components/ItemsTotalsBar";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { groupByDay, dateOnlyToLocal } from "../../../utils/dateGrouping";
import { emptyStateSx, emptyStateIconCircleSx, sectionLabelSx } from "../../../components/ui/surfaceStyles";
import { FLAG_OFF_BUDGET } from "../../../constants/xenbudget";

/** What a budget hands over when its "View items" action navigates here. */
interface BudgetFilterSeed {
    categories: string[];
    from: string;
    to: string;
    period: string;
}

// Synthetic options in the filters dropdown below — not real flags or fields on the item.
const TYPE_EXPENSE = "__type_expense__";
const TYPE_INCOME = "__type_income__";
const NEED_FILTER = "__need__";
const WANT_FILTER = "__want__";
// Categories are prefixed so a category name can never collide with a flag name in the
// shared dropdown (both registries allow the same string).
const CATEGORY_PREFIX = "__category__";
// People are prefixed so a member's name can never collide with a category/flag name.
const PERSON_PREFIX = "__person__";
// The built-in flag the importer uses to say "nothing matched" — special-cased below so
// selecting it also catches items with no category that were never run through an import.
const FLAG_UNCATEGORISED = "Uncategorised";
const FLAG_NEEDS_REVIEW = "Needs review";

/** UTC midnight of a local-midnight Date's calendar day — item dates are date-only UTC. */
function startOfDayUtc(d: Date): string {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
}

/** The end of a calendar day in UTC, so an inclusive `$lte` still covers the whole day. */
function endOfDayUtc(d: Date): string {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)).toISOString();
}

function dateRange(value: DateFilterValue): { from?: string; to?: string } {
    const now = new Date();
    switch (value.preset) {
        case "thisWeek":
            return { from: startOfDayUtc(startOfWeek(now)) };
        case "lastWeek":
            return {
                from: startOfDayUtc(startOfWeek(subWeeks(now, 1))),
                to: endOfDayUtc(subDays(startOfWeek(now), 1)),
            };
        case "thisYear":
            return { from: startOfDayUtc(startOfYear(now)) };
        case "custom":
            return {
                from: value.from ? startOfDayUtc(value.from) : undefined,
                to: value.to ? endOfDayUtc(value.to) : undefined,
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
    const [dateValue, setDateValueState] = useState<DateFilterValue>(() => {
        if (!seed) return parseDateFilterValue(localStorage.getItem(dateLsKey)) ?? DEFAULT_DATE_FILTER;
        // A monthly budget's window is one whole calendar month, so name it as that month
        // rather than an "Aug 1 – Aug 31" day range. Every other period keeps its exact
        // window as a custom day range.
        if (seed.period === "monthly") {
            const monthStart = startOfMonth(dateOnlyToLocal(seed.from));
            return { preset: "custom", from: monthStart, to: endOfMonth(monthStart) };
        }
        return {
            preset: "custom",
            from: dateOnlyToLocal(seed.from),
            // The budget's window ends exclusively; the date filter's end is inclusive of
            // that whole day, so it steps back an instant to name the last covered day.
            to: dateOnlyToLocal(new Date(new Date(seed.to).getTime() - 1)),
        };
    });
    const setDateValue = (next: DateFilterValue) => {
        setDateValueState(next);
        localStorage.setItem(dateLsKey, serializeDateFilterValue(next));
    };
    const [dateModalOpen, setDateModalOpen] = useState(false);
    const [reviewOpen, setReviewOpen] = useState(false);
    // Which source/card the list is narrowed to: "all", "manual", "csv", or "card:<id>".
    const [sourceFilter, setSourceFilter] = useState("all");
    // Seeded categories (from a budget's "View items") start pre-selected in the dropdown.
    const [selectedFilters, setSelectedFilters] = useState<string[]>(
        (seed?.categories ?? []).map((name) => CATEGORY_PREFIX + name),
    );

    const filterOptions = useMemo(
        () => [
            TYPE_EXPENSE, TYPE_INCOME, NEED_FILTER, WANT_FILTER,
            ...book.categories.map((c) => CATEGORY_PREFIX + c.name),
            ...book.members.map((m) => PERSON_PREFIX + m.user_id),
            ...book.flags.map((f) => f.name),
        ],
        [book.categories, book.members, book.flags],
    );

    // Filtering happens server-side (the list is paginated), so the filter object is part
    // of the query key rather than a useMemo over an already-loaded array.
    const filters: ItemFilters = useMemo(() => {
        const realFlags = selectedFilters.filter(
            (f) => ![
                FLAG_UNCATEGORISED, TYPE_EXPENSE, TYPE_INCOME,
                NEED_FILTER, WANT_FILTER,
            ].includes(f) && !f.startsWith(CATEGORY_PREFIX) && !f.startsWith(PERSON_PREFIX),
        );
        const selectedCategories = selectedFilters
            .filter((f) => f.startsWith(CATEGORY_PREFIX))
            .map((f) => f.slice(CATEGORY_PREFIX.length));
        const selectedPeople = selectedFilters
            .filter((f) => f.startsWith(PERSON_PREFIX))
            .map((f) => f.slice(PERSON_PREFIX.length));
        const wantsExpense = selectedFilters.includes(TYPE_EXPENSE);
        const wantsIncome = selectedFilters.includes(TYPE_INCOME);
        const wantsNeed = selectedFilters.includes(NEED_FILTER);
        const wantsWant = selectedFilters.includes(WANT_FILTER);
        const source = sourceFilter === "all" || sourceFilter.startsWith("card:")
            ? undefined
            : (sourceFilter as ItemFilters["source"] || undefined);
        const card = sourceFilter.startsWith("card:") ? sourceFilter.slice(5) : undefined;
        return {
            ...dateRange(dateValue),
            q: search.trim() || undefined,
            categories: selectedCategories.length ? selectedCategories : undefined,
            people: selectedPeople.length ? selectedPeople : undefined,
            flags: realFlags.length ? realFlags : undefined,
            // Selecting both (or neither) means "all types" — no filter to apply.
            type: wantsExpense !== wantsIncome ? (wantsExpense ? "expense" : "income") : undefined,
            need_want: wantsNeed !== wantsWant ? (wantsNeed ? "need" : "want") : undefined,
            // The *state* of having no category, not just the flag — so a hand-entered
            // item with no category is caught too, not only ones an import flagged.
            uncategorised: selectedFilters.includes(FLAG_UNCATEGORISED) || undefined,
            excluded: selectedFilters.includes(FLAG_OFF_BUDGET) ? "all" : "hidden",
            source,
            card,
        };
    }, [dateValue, search, selectedFilters, sourceFilter]);

    const {
        items, totals, isLoading, isError, error, hasMore, loadMore, isLoadingMore,
    } = useXenBudgetItems(book._id, filters);

    const dayGroups = useMemo(() => groupByDay(items, (i) => i.date, "UTC"), [items]);

    const reviewCount = book.review_count ?? 0;
    const needsReviewCount = book.needs_review_count ?? 0;
    const needsReviewFilterActive = selectedFilters.includes(FLAG_NEEDS_REVIEW);

    const toggleNeedsReviewFilter = () =>
        setSelectedFilters((prev) =>
            prev.includes(FLAG_NEEDS_REVIEW)
                ? prev.filter((f) => f !== FLAG_NEEDS_REVIEW)
                : [...prev, FLAG_NEEDS_REVIEW],
        );

    // Label for a filter option value. People show their username; categories drop the
    // prefix; everything else is a fixed label or the raw value.
    const optionLabel = (o: string) => (
        o === TYPE_EXPENSE ? "Expenses"
            : o === TYPE_INCOME ? "Income"
                : o === NEED_FILTER ? "Need"
                    : o === WANT_FILTER ? "Want"
                        : o.startsWith(CATEGORY_PREFIX) ? o.slice(CATEGORY_PREFIX.length)
                            : o.startsWith(PERSON_PREFIX)
                                ? (book.members.find((m) => m.user_id === o.slice(PERSON_PREFIX.length))?.username ?? o.slice(PERSON_PREFIX.length))
                                : o
    );

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box sx={{ pl: 2, pr: { xs: 2, sm: 3.5 }, pt: 2, flexShrink: 0 }}>
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
                        <TextField
                            select size="small" label="Source" value={sourceFilter}
                            onChange={(e) => setSourceFilter(e.target.value)}
                            sx={{ flexShrink: 0, "& .MuiInputBase-root": { width: "auto" } }}
                        >
                            <MenuItem value="all">All</MenuItem>
                            <MenuItem value="manual">Manual</MenuItem>
                            <MenuItem value="csv">Imported</MenuItem>
                            {book.import_presets.length > 0 && <Divider />}
                            {book.import_presets.map((p) => (
                                <MenuItem key={p._id} value={`card:${p._id}`}>{p.name}</MenuItem>
                            ))}
                        </TextField>
                        <Autocomplete
                            multiple disableCloseOnSelect size="small" fullWidth options={filterOptions}
                            value={selectedFilters} onChange={(_, v) => setSelectedFilters(v)}
                            /* MUI reserves 56px at the right end for the clear and popup
                            indicators together, on EVERY wrapped line - so each row of
                            chips stops well short of the X. The dropdown arrow earns none
                            of that here (clicking the field opens the list anyway), so it
                            goes, and the reservation drops to what the clear X itself
                            needs - any less and a full row of chips slides under it. */
                            forcePopupIcon={false}
                            sx={{
                                "& .MuiAutocomplete-inputRoot": { pr: "38px !important" },
                                "& .MuiAutocomplete-input": { minWidth: 20 },
                            }}
                            groupBy={(o) => (
                                o === TYPE_EXPENSE || o === TYPE_INCOME ? "Type"
                                    : o === NEED_FILTER || o === WANT_FILTER ? "Need / Want"
                                        : o.startsWith(CATEGORY_PREFIX) ? "Categories"
                                            : o.startsWith(PERSON_PREFIX) ? "People"
                                                : "Flags"
                            )}
                            getOptionLabel={optionLabel}
                            renderOption={(props, option) => {
                                const { key, ...optionProps } = props;
                                if (option.startsWith(PERSON_PREFIX)) {
                                    const member = book.members.find(
                                        (m) => m.user_id === option.slice(PERSON_PREFIX.length),
                                    );
                                    return (
                                        <Box component="li" key={key} {...optionProps} sx={{ gap: 1 }}>
                                            <Avatar
                                                src={member?.avatar || undefined}
                                                alt={member?.username}
                                                sx={{ width: 20, height: 20, fontSize: 10 }}
                                            >
                                                {member?.username[0]?.toUpperCase()}
                                            </Avatar>
                                            {member?.username ?? option.slice(PERSON_PREFIX.length)}
                                        </Box>
                                    );
                                }
                                return (
                                    <Box component="li" key={key} {...optionProps}>
                                        {optionLabel(option)}
                                    </Box>
                                );
                            }}
                            renderTags={(value, getTagProps) => value.map((option, index) => {
                                const { key, ...tagProps } = getTagProps({ index });
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
                                if (option === NEED_FILTER) {
                                    return <Chip key={key} size="small" label="Need" {...tagProps} />;
                                }
                                if (option === WANT_FILTER) {
                                    return <Chip key={key} size="small" label="Want" {...tagProps} />;
                                }
                                if (option.startsWith(CATEGORY_PREFIX)) {
                                    return (
                                        <CategoryChip
                                            key={key}
                                            name={option.slice(CATEGORY_PREFIX.length)}
                                            registry={book.categories}
                                            {...tagProps}
                                        />
                                    );
                                }
                                if (option.startsWith(PERSON_PREFIX)) {
                                    const member = book.members.find(
                                        (m) => m.user_id === option.slice(PERSON_PREFIX.length),
                                    );
                                    return (
                                        <Chip
                                            key={key}
                                            size="small"
                                            label={member?.username ?? option.slice(PERSON_PREFIX.length)}
                                            avatar={member?.avatar
                                                ? <Avatar src={member.avatar} sx={{ width: 16, height: 16, fontSize: 10 }} />
                                                : undefined}
                                            {...tagProps}
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
                    {!isLoading && <ItemsTotalsBar totals={totals} />}
                </Stack>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pl: 2, pr: { xs: 2, sm: 3.5 }, pb: 2 }}>
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
                                || selectedFilters.length > 0 || sourceFilter !== "all"
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
