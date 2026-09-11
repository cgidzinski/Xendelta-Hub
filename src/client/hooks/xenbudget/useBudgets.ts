import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import {
    restateBudgetToUnit, scaleBudgetToRange,
} from "../../routes/Internal/XenBudget/components/budget/scaleBudgetToRange";
import { isAnchored, type PeriodMode } from "../../routes/Internal/XenBudget/components/periodMode";
import { normalizedAmounts } from "../../routes/Internal/XenBudget/components/budget/periodDisplay";
import type { XenBudgetBook, BudgetInput, BudgetStatusResponse } from "./types";

/** An explicit reporting window, as ISO strings. */
export interface BudgetStatusRange {
    from: string;
    to: string;
}

/**
 * What each active budget has spent, by default in the period it is currently in.
 *
 * Pass `range` to measure every budget over one shared window instead - what the report
 * page needs, since a budget's own month says nothing about the year being reported on.
 * Pass `history` to also get the last N of each budget's OWN periods back on `periods`,
 * for the margin strip. It widens the server's scan, so it is opt-in per page rather than
 * always on.
 * The amounts come back per-period either way, so restating them happens HERE rather than
 * at the call site: a per-period cap sitting next to a range's worth of spend is the one
 * mistake this hook exists to make impossible.
 *
 * Pass `mode` as well and the restatement follows the display ladder. When the window is
 * one calendar unit the amounts convert NOMINALLY (see restateBudgetToUnit), so a $600/yr
 * budget reads $50 in February just as it does in January. Anything else - a hand-picked
 * range, "last 3 months", a one-off budget - falls back to proportional range scaling,
 * which is the right maths for a span that isn't a whole unit.
 */
export function useXenBudgetStatus(
    bookId: string, currency?: string, range?: BudgetStatusRange, history?: number,
    mode?: PeriodMode,
) {
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ["xenbudget", "budget-status", bookId, currency, range?.from, range?.to, history],
        queryFn: async () => {
            const res = await apiClient.get(`/api/xenbudget/books/${bookId}/budget-status`, {
                params: {
                    ...(currency ? { currency } : {}),
                    ...(range ? { from: range.from, to: range.to } : {}),
                    ...(history ? { history } : {}),
                },
            });
            return res.data.data as BudgetStatusResponse;
        },
        enabled: !!bookId,
        staleTime: 0,
        placeholderData: (prev) => prev,
    });

    const budgets = useMemo(() => {
        const raw = data?.budgets ?? [];
        // Stash each budget's own per-period amount and its monthly/quarterly/yearly
        // equivalents BEFORE any range scaling, so the period identity stays correct on
        // restated cards too.
        const decorated = raw.map((b) => {
            const normalized = normalizedAmounts(b.period, b.amount);
            return {
                ...b,
                period_amount: b.amount,
                weekly_amount: normalized.weekly,
                monthly_amount: normalized.monthly,
                quarterly_amount: normalized.quarterly,
                yearly_amount: normalized.yearly,
            };
        });
        const from = range ? new Date(range.from) : null;
        const to = range ? new Date(range.to) : null;
        const scale = (b: typeof decorated[number]) => (
            from && to ? scaleBudgetToRange(b, from, to) : b
        );

        // A whole calendar unit converts nominally; a custom budget has no nominal rate, so
        // restateBudgetToUnit hands it back and it takes the range path like everything else.
        const unit = mode && isAnchored(mode) ? mode.kind : null;
        if (unit) return decorated.map((b) => restateBudgetToUnit(b, unit) ?? scale(b));

        return decorated.map(scale);
    }, [data, range?.from, range?.to, mode]);

    return { status: data, budgets, isLoading, isError, error };
}

export function useXenBudgetBudgets(bookId: string) {
    const queryClient = useQueryClient();

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "book", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "budget-status", bookId] });
    };

    const createMutation = useMutation({
        mutationFn: async (input: BudgetInput) => {
            const res = await apiClient.post(`/api/xenbudget/books/${bookId}/budgets`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const updateMutation = useMutation({
        mutationFn: async ({ budgetId, input }: { budgetId: string; input: BudgetInput }) => {
            const res = await apiClient.put(`/api/xenbudget/books/${bookId}/budgets/${budgetId}`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: async (budgetId: string) => {
            const res = await apiClient.delete(`/api/xenbudget/books/${bookId}/budgets/${budgetId}`);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    return {
        createBudgetAsync: createMutation.mutateAsync,
        isCreatingBudget: createMutation.isPending,
        updateBudgetAsync: updateMutation.mutateAsync,
        isUpdatingBudget: updateMutation.isPending,
        deleteBudgetAsync: deleteMutation.mutateAsync,
        isDeletingBudget: deleteMutation.isPending,
    };
}
