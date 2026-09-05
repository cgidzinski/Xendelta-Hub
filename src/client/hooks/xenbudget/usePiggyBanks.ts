import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { invalidateItemDerived } from "./invalidate";
import type { XenBudgetBook, PiggyBankInput, ContributionInput } from "./types";

/**
 * Piggy banks and their ledgers.
 *
 * Banks ride on the book payload, so there is no query here to pair with these mutations —
 * every endpoint answers with the whole book, exactly as the budget routes do. The
 * invalidation is the full item-derived set rather than just the book: a contribution
 * recorded as a transaction moves the summary, the budget bars and the item list too.
 */
export function useXenBudgetPiggyBanks(bookId: string) {
    const queryClient = useQueryClient();
    const base = `/api/xenbudget/books/${bookId}/piggy-banks`;
    const invalidate = () => invalidateItemDerived(queryClient, bookId);

    const createMutation = useMutation({
        mutationFn: async (input: PiggyBankInput) => {
            const res = await apiClient.post(base, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const updateMutation = useMutation({
        mutationFn: async ({ bankId, input }: { bankId: string; input: PiggyBankInput }) => {
            const res = await apiClient.put(`${base}/${bankId}`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: async (bankId: string) => {
            const res = await apiClient.delete(`${base}/${bankId}`);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const addContributionMutation = useMutation({
        mutationFn: async ({ bankId, input }: { bankId: string; input: ContributionInput }) => {
            const res = await apiClient.post(`${base}/${bankId}/contributions`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const updateContributionMutation = useMutation({
        mutationFn: async (
            { bankId, contributionId, input }:
                { bankId: string; contributionId: string; input: Partial<ContributionInput> },
        ) => {
            const res = await apiClient.put(`${base}/${bankId}/contributions/${contributionId}`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const deleteContributionMutation = useMutation({
        mutationFn: async ({ bankId, contributionId }: { bankId: string; contributionId: string }) => {
            const res = await apiClient.delete(`${base}/${bankId}/contributions/${contributionId}`);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    return {
        createBankAsync: createMutation.mutateAsync,
        isCreatingBank: createMutation.isPending,
        updateBankAsync: updateMutation.mutateAsync,
        isUpdatingBank: updateMutation.isPending,
        deleteBankAsync: deleteMutation.mutateAsync,
        isDeletingBank: deleteMutation.isPending,
        addContributionAsync: addContributionMutation.mutateAsync,
        isAddingContribution: addContributionMutation.isPending,
        updateContributionAsync: updateContributionMutation.mutateAsync,
        isUpdatingContribution: updateContributionMutation.isPending,
        deleteContributionAsync: deleteContributionMutation.mutateAsync,
        isDeletingContribution: deleteContributionMutation.isPending,
    };
}
