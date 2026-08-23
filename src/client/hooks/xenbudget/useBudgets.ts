import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { useTimezone } from "../useTimezone";
import { scaleBudgetToRange } from "../../routes/Internal/XenBudget/components/budget/scaleBudgetToRange";
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
 * The amounts come back per-period either way, so the range case rescales them HERE
 * rather than at the call site: a per-period cap sitting next to a range's worth of spend
 * is the one mistake this hook exists to make impossible.
 */
export function useXenBudgetStatus(bookId: string, currency?: string, range?: BudgetStatusRange) {
    // A budget period's boundaries are the viewer's, so the zone belongs in the key.
    const tz = useTimezone();

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ["xenbudget", "budget-status", bookId, currency, tz, range?.from, range?.to],
        queryFn: async () => {
            const res = await apiClient.get(`/api/xenbudget/books/${bookId}/budget-status`, {
                params: {
                    tz,
                    ...(currency ? { currency } : {}),
                    ...(range ? { from: range.from, to: range.to } : {}),
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
        if (!range) return raw;
        const from = new Date(range.from);
        const to = new Date(range.to);
        return raw.map((b) => scaleBudgetToRange(b, from, to));
    }, [data, range?.from, range?.to]);

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
