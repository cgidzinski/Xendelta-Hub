import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type { XenBudgetBook, BudgetInput, BudgetStatusResponse } from "./types";

/** What each active budget has spent in the period it is currently in. */
export function useXenBudgetStatus(bookId: string, currency?: string) {
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ["xenbudget", "budget-status", bookId, currency],
        queryFn: async () => {
            const res = await apiClient.get(`/api/xenbudget/books/${bookId}/budget-status`, {
                params: currency ? { currency } : {},
            });
            return res.data.data as BudgetStatusResponse;
        },
        enabled: !!bookId,
        staleTime: 0,
        placeholderData: (prev) => prev,
    });

    return { status: data, budgets: data?.budgets ?? [], isLoading, isError, error };
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
