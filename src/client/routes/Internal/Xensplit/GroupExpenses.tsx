import { useState, useMemo } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { Box, Typography, TextField, InputAdornment, ToggleButtonGroup, ToggleButton, Avatar, IconButton, alpha } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import RepeatIcon from "@mui/icons-material/Repeat";
import CloseIcon from "@mui/icons-material/Close";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { startOfWeek, startOfMonth, startOfYear, subWeeks } from "date-fns";
import type { GroupDetailContext } from "./GroupDetail";
import type { XenSplitExpense } from "../../../hooks/xensplit/types";
import ExpenseListItem, { FREQUENCY_LABELS, computeFinalExpenseIds } from "./components/ExpenseListItem";
import { formatCurrency } from "../../../utils/currencyUtils";
import { groupByDay } from "../../../utils/dateGrouping";
import { xsCardSx, xsBadgeSx } from "./components/rowStyles";
import {
    sortByMode, sortDateOf, nextSortMode, loadSortMode, saveSortMode,
    type SortField,
} from "./components/activitySort";
import { useConfirm } from "../../../components/ui/ConfirmProvider";

type DateFilter = "all" | "thisWeek" | "lastWeek" | "thisMonth" | "thisYear";

const DATE_FILTERS: { label: string; value: DateFilter }[] = [
    { label: "All", value: "all" },
    { label: "This Week", value: "thisWeek" },
    { label: "Last Week", value: "lastWeek" },
    { label: "This Month", value: "thisMonth" },
    { label: "This Year", value: "thisYear" },
];

type FilterKey = "recurring" | "held" | "deleted";

const PROPERTY_FILTERS: { label: string; value: FilterKey }[] = [
    { label: "Recurring", value: "recurring" },
    { label: "Held", value: "held" },
    { label: "Deleted", value: "deleted" },
];

const SORT_FIELDS: { label: string; value: SortField }[] = [
    { label: "Date", value: "date" },
    { label: "Added", value: "added" },
];

export default function GroupExpenses() {
    const { group, onViewExpense, user, cancelRecurring, isCancellingRecurring, isCreator, restoreExpense, isRestoringExpense } = useOutletContext<GroupDetailContext>();
    const confirm = useConfirm();
    const { groupId } = useParams<{ groupId: string }>();
    const sortKey = `xensplit_expenseSort_${groupId}`;
    const [search, setSearch] = useState("");
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");
    const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
    const [sort, setSort] = useState(() => loadSortMode(sortKey));

    const handleSortPress = (pressed: SortField | null) => {
        const next = nextSortMode(sort, pressed);
        setSort(next);
        saveSortMode(sortKey, next);
    };

    // Both timestamps travel with the row so the comparator and the day-header key read
    // the same values. `created_at` is absent on pre-schema expenses, hence the fallback.
    const asRow = (e: XenSplitExpense) => ({
        type: "expense" as const,
        date: e.date,
        added: e.created_at ?? e.date,
        item: e,
    });

    // Genesis expense id -> its recurring series, for chips on genesis rows
    const seriesByGenesisId = useMemo(() => {
        const map = new Map<string, NonNullable<typeof group.recurring_expenses>[number]>();
        for (const r of group.recurring_expenses ?? []) {
            if (r.genesis_expense_id) map.set(r.genesis_expense_id, r);
        }
        return map;
    }, [group.recurring_expenses]);

    const isRecurringExpense = (e: { _id: string; recurring_id?: string }) =>
        !!e.recurring_id || seriesByGenesisId.has(e._id);

    const matchesActiveFilters = (e: { _id: string; recurring_id?: string; on_hold?: boolean }) =>
        activeFilter === "recurring" ? isRecurringExpense(e) :
            activeFilter === "held" ? !!e.on_hold :
                true;

    const showingDeleted = activeFilter === "deleted";
    // Soft-deleted expenses are split out of group.expenses by the query `select`, so the
    // "Deleted" filter swaps the source array instead of filtering the live one.
    const sourceExpenses = showingDeleted ? (group.deleted?.expenses ?? []) : group.expenses;

    const finalExpenseIds = useMemo(
        () => computeFinalExpenseIds(group.expenses, group.recurring_expenses),
        [group.expenses, group.recurring_expenses]
    );

    const hasActiveFilters = activeFilter !== null;
    // A pending (not-yet-started) series has no expense yet, so it can't match "held"
    const pendingSeriesEligible = activeFilter === null || activeFilter === "recurring";

    // Future-start series that haven't created their first expense yet — exempt from date filter.
    // Folded away once a filter that a pending series can never match is active.
    const pendingSeries = useMemo(() => {
        if (!pendingSeriesEligible) return [];
        const q = search.trim().toLowerCase();
        return (group.recurring_expenses ?? [])
            .filter((r) => !r.genesis_expense_id && r.active)
            .filter((r) => !q || (r.pending_expense?.title ?? "").toLowerCase().includes(q))
            .sort((a, b) => new Date(a.next_run_at).getTime() - new Date(b.next_run_at).getTime());
    }, [group.recurring_expenses, search, pendingSeriesEligible]);

    // Held expenses, visible to all group members — pinned + exempt from date filter by
    // default. Once any filter chip is active, held items move into the normal filtered
    // list instead (so "held" becomes a real filter, not a permanent pin).
    const heldVisible = useMemo(() => {
        if (hasActiveFilters) return [];
        const q = search.trim().toLowerCase();
        const held = group.expenses
            .filter((e) => e.on_hold)
            .filter((e) => !q || e.title.toLowerCase().includes(q))
            .map(asRow);
        return sortByMode(held, sort).map((row) => row.item);
    }, [group.expenses, search, hasActiveFilters, sort]);

    // Active expenses, date-filtered. The range filter reads whichever timestamp the list
    // is sorted on, so the whole tab works off one timeline rather than two.
    const sortedItems = useMemo(() => {
        const now = new Date();
        const dateStart: Date | null =
            dateFilter === "thisWeek" ? startOfWeek(now) :
                dateFilter === "lastWeek" ? startOfWeek(subWeeks(now, 1)) :
                    dateFilter === "thisMonth" ? startOfMonth(now) :
                        dateFilter === "thisYear" ? startOfYear(now) :
                            null;
        const dateEnd: Date | null =
            dateFilter === "lastWeek" ? startOfWeek(now) : null;

        const expenses = sourceExpenses
            .filter((e) => showingDeleted ? true : hasActiveFilters ? matchesActiveFilters(e) : !e.on_hold)
            .map(asRow)
            .filter((row) => {
                if (search.trim() && !row.item.title.toLowerCase().includes(search.toLowerCase())) return false;
                const d = new Date(sortDateOf(row, sort.field));
                if (dateStart && d < dateStart) return false;
                if (dateEnd && d >= dateEnd) return false;
                return true;
            });

        return sortByMode(expenses, sort);
    }, [sourceExpenses, showingDeleted, search, dateFilter, activeFilter, seriesByGenesisId, sort]);

    // Group the sorted list into ordered day-groups, like the Overview feed. The key must be
    // the field it was sorted on - groupByDay only merges into its last group, so grouping on
    // the other timestamp would silently emit a header per row.
    const groupedItems = useMemo(
        () => groupByDay(sortedItems, (row) => sortDateOf(row, sort.field)),
        [sortedItems, sort.field]
    );

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box sx={{ flexShrink: 0 }}>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Search expenses…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                    sx={{ mb: 1.5 }}
                />
                <ToggleButtonGroup
                    size="small"
                    value={dateFilter}
                    exclusive
                    onChange={(_, v) => v && setDateFilter(v)}
                    fullWidth
                    sx={{ mb: 1.5, height: 30 }}
                >
                    {DATE_FILTERS.map((f) => (
                        <ToggleButton key={f.value} value={f.value} sx={{ px: 1, fontSize: "0.7rem", textTransform: "none", whiteSpace: "nowrap" }}>
                            {f.label}
                        </ToggleButton>
                    ))}
                </ToggleButtonGroup>
                <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                    <ToggleButtonGroup
                        size="small"
                        value={activeFilter}
                        exclusive
                        onChange={(_, v: FilterKey | null) => setActiveFilter(v)}
                        fullWidth
                        sx={{ flex: 1, minWidth: 0, height: 30 }}
                    >
                        {PROPERTY_FILTERS.map((f) => (
                            <ToggleButton key={f.value} value={f.value} sx={{ px: 1, fontSize: "0.7rem", textTransform: "none", whiteSpace: "nowrap" }}>
                                {f.label}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                    {/* Pressing the active button reverses the order - MUI reports that as null. */}
                    <ToggleButtonGroup
                        size="small"
                        value={sort.field}
                        exclusive
                        onChange={(_, v: SortField | null) => handleSortPress(v)}
                        sx={{ flexShrink: 0, height: 30 }}
                    >
                        {SORT_FIELDS.map((f) => (
                            <ToggleButton
                                key={f.value}
                                value={f.value}
                                title={`Sort by ${f.value === "added" ? "date added" : "transaction date"}`}
                                sx={{ px: 1, gap: 0.25, fontSize: "0.7rem", textTransform: "none", whiteSpace: "nowrap" }}
                            >
                                {f.label}
                                {sort.field === f.value && (
                                    sort.dir === "desc"
                                        ? <ArrowDownwardIcon sx={{ fontSize: 12 }} />
                                        : <ArrowUpwardIcon sx={{ fontSize: 12 }} />
                                )}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                </Box>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pb: { xs: 11, md: 1 } }}>
                {pendingSeries.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                        <Typography
                            variant="caption"
                            sx={{ px: 0.5, mb: 0.75, display: "block", color: "secondary.main", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.65rem" }}
                        >
                            Upcoming Recurring
                        </Typography>
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            {pendingSeries.map((series) => (
                                <Box
                                    key={series._id}
                                    sx={{
                                        ...xsCardSx,
                                        display: "grid",
                                        gridTemplateColumns: "40px 1fr auto",
                                        alignItems: "center",
                                        columnGap: 1.25,
                                        opacity: 0.75,
                                        borderStyle: "dashed",
                                    }}
                                >
                                    <Avatar sx={{ ...xsBadgeSx, bgcolor: (t) => alpha(t.palette.secondary.main, 0.15) }}>
                                        <RepeatIcon sx={{ fontSize: 22, color: "secondary.main" }} />
                                    </Avatar>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                            {series.pending_expense?.title ?? "Recurring expense"}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                                            Starts {new Date(series.next_run_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                            {" · "}{FREQUENCY_LABELS[series.frequency]}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                        {series.pending_expense?.amount != null && (
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                                {formatCurrency(series.pending_expense.amount, series.pending_expense.currency ?? group.default_currency)}
                                            </Typography>
                                        )}
                                        {(series.created_by === user.id || group.created_by === user.id) && (
                                            <IconButton
                                                size="small"
                                                disabled={isCancellingRecurring}
                                                onClick={async () => {
                                                    const ok = await confirm({
                                                        title: "Cancel this recurring expense?",
                                                        message: "No expenses have been created from it yet.",
                                                        confirmLabel: "Cancel series",
                                                        cancelLabel: "Keep it",
                                                    });
                                                    if (ok) cancelRecurring(series._id);
                                                }}
                                            >
                                                <CloseIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        )}
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}
                {heldVisible.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                        <Typography
                            variant="caption"
                            sx={{ px: 0.5, mb: 0.75, display: "block", color: "warning.main", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.65rem" }}
                        >
                            Held Expenses
                        </Typography>
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            {heldVisible.map((expense) => (
                                <ExpenseListItem
                                    key={expense._id}
                                    expense={expense}
                                    onClick={() => onViewExpense(expense)}
                                    userId={user.id}
                                    recurringSeries={seriesByGenesisId.get(expense._id)}
                                    isFinal={finalExpenseIds.has(expense._id)}
                                />
                            ))}
                        </Box>
                    </Box>
                )}
                {sortedItems.length === 0 ? (
                    <Box sx={{ textAlign: "center", py: heldVisible.length > 0 ? 3 : 6 }}>
                        <Typography variant="body1" color="text.secondary">
                            {showingDeleted
                                ? "No deleted expenses"
                                : search.trim() || dateFilter !== "all" || hasActiveFilters
                                    ? "No expenses match your filters"
                                    : "No expenses yet"}
                        </Typography>
                    </Box>
                ) : (
                    groupedItems.map((dateGroup) => (
                        <Box key={dateGroup.key} sx={{ mb: 2.5 }}>
                            <Typography
                                variant="caption"
                                color="text.disabled"
                                sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1, ml: 0.25 }}
                            >
                                {dateGroup.label}
                            </Typography>
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                {dateGroup.items.map((row) => (
                                    <ExpenseListItem
                                        key={row.item._id}
                                        expense={row.item}
                                        onClick={() => onViewExpense(row.item)}
                                        userId={user.id}
                                        // The day header is the added day when sorting that way, so the
                                        // row keeps showing its own transaction date.
                                        hideDate={sort.field === "date"}
                                        recurringSeries={seriesByGenesisId.get(row.item._id)}
                                        isFinal={finalExpenseIds.has(row.item._id)}
                                        deleted={showingDeleted}
                                        // Only the group owner may undo a deletion; without a
                                        // handler the row shows no Restore button.
                                        onRestore={showingDeleted && isCreator ? () => restoreExpense(row.item._id) : undefined}
                                        isRestoring={isRestoringExpense}
                                    />
                                ))}
                            </Box>
                        </Box>
                    ))
                )}
            </Box>
        </Box>
    );
}
