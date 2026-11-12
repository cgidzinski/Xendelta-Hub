import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../config/api";
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
      return api.post<XenBudgetBook>(base, input);
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ bankId, input }: { bankId: string; input: PiggyBankInput }) => {
      return api.put<XenBudgetBook>(`${base}/${bankId}`, input);
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (bankId: string) => {
      return api.delete<XenBudgetBook>(`${base}/${bankId}`);
    },
    onSuccess: invalidate,
  });

  const addContributionMutation = useMutation({
    mutationFn: async ({ bankId, input }: { bankId: string; input: ContributionInput }) => {
      return api.post<XenBudgetBook>(`${base}/${bankId}/contributions`, input);
    },
    onSuccess: invalidate,
  });

  const updateContributionMutation = useMutation({
    mutationFn: async ({
      bankId,
      contributionId,
      input,
    }: {
      bankId: string;
      contributionId: string;
      input: Partial<ContributionInput>;
    }) => {
      return api.put<XenBudgetBook>(`${base}/${bankId}/contributions/${contributionId}`, input);
    },
    onSuccess: invalidate,
  });

  const deleteContributionMutation = useMutation({
    mutationFn: async ({ bankId, contributionId }: { bankId: string; contributionId: string }) => {
      return api.delete<XenBudgetBook>(`${base}/${bankId}/contributions/${contributionId}`);
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
