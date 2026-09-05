import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { invalidateItemDerived } from "./invalidate";
import type { XenBudgetBook, GoalInput, ContributionInput } from "./types";

/**
 * Savings goals and their ledgers.
 *
 * Goals ride on the book payload, so there is no query here to pair with these mutations —
 * every endpoint answers with the whole book, exactly as the budget routes do. The
 * invalidation is the full item-derived set rather than just the book: a contribution
 * recorded as a transaction moves the summary, the budget bars and the item list too.
 */
export function useXenBudgetGoals(bookId: string) {
    const queryClient = useQueryClient();
    const base = `/api/xenbudget/books/${bookId}/goals`;
    const invalidate = () => invalidateItemDerived(queryClient, bookId);

    const createMutation = useMutation({
        mutationFn: async (input: GoalInput) => {
            const res = await apiClient.post(base, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const updateMutation = useMutation({
        mutationFn: async ({ goalId, input }: { goalId: string; input: GoalInput }) => {
            const res = await apiClient.put(`${base}/${goalId}`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: async (goalId: string) => {
            const res = await apiClient.delete(`${base}/${goalId}`);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const addContributionMutation = useMutation({
        mutationFn: async ({ goalId, input }: { goalId: string; input: ContributionInput }) => {
            const res = await apiClient.post(`${base}/${goalId}/contributions`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const updateContributionMutation = useMutation({
        mutationFn: async (
            { goalId, contributionId, input }:
                { goalId: string; contributionId: string; input: Partial<ContributionInput> },
        ) => {
            const res = await apiClient.put(`${base}/${goalId}/contributions/${contributionId}`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const deleteContributionMutation = useMutation({
        mutationFn: async ({ goalId, contributionId }: { goalId: string; contributionId: string }) => {
            const res = await apiClient.delete(`${base}/${goalId}/contributions/${contributionId}`);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    return {
        createGoalAsync: createMutation.mutateAsync,
        isCreatingGoal: createMutation.isPending,
        updateGoalAsync: updateMutation.mutateAsync,
        isUpdatingGoal: updateMutation.isPending,
        deleteGoalAsync: deleteMutation.mutateAsync,
        isDeletingGoal: deleteMutation.isPending,
        addContributionAsync: addContributionMutation.mutateAsync,
        isAddingContribution: addContributionMutation.isPending,
        updateContributionAsync: updateContributionMutation.mutateAsync,
        isUpdatingContribution: updateContributionMutation.isPending,
        deleteContributionAsync: deleteContributionMutation.mutateAsync,
        isDeletingContribution: deleteContributionMutation.isPending,
    };
}
