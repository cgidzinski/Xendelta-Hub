import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
} from "./types";

export function useXenSplitExpenses(groupId: string) {
  const queryClient = useQueryClient();

  const addExpenseMutation = useMutation({
    mutationFn: async (input: CreateExpenseInput) => {
      const res = await apiClient.post(`/api/xensplit/groups/${groupId}/expenses`, input);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["xensplit", "balances", groupId] });
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: async ({ expenseId, updates }: { expenseId: string; updates: UpdateExpenseInput }) => {
      const res = await apiClient.put(`/api/xensplit/groups/${groupId}/expenses/${expenseId}`, updates);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["xensplit", "balances", groupId] });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      const res = await apiClient.delete(`/api/xensplit/groups/${groupId}/expenses/${expenseId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["xensplit", "balances", groupId] });
    },
  });

  return {
    addExpense: addExpenseMutation.mutate,
    isAddingExpense: addExpenseMutation.isPending,
    addExpenseError: addExpenseMutation.error,
    updateExpense: updateExpenseMutation.mutate,
    isUpdatingExpense: updateExpenseMutation.isPending,
    updateExpenseError: updateExpenseMutation.error,
    deleteExpense: deleteExpenseMutation.mutate,
    isDeletingExpense: deleteExpenseMutation.isPending,
    deleteExpenseError: deleteExpenseMutation.error,
  };
}