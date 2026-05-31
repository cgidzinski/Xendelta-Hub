import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
} from "./types";

export function useExpenseImageUrls(groupId: string, expenseId: string | undefined, imageCount: number) {
  return useQuery<{ _id: string; signedUrl: string }[]>({
    queryKey: ["xensplit", "expense-image-urls", groupId, expenseId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/xensplit/groups/${groupId}/expenses/${expenseId}/image-urls`);
      return res.data.data;
    },
    enabled: !!expenseId && imageCount > 0,
    staleTime: 10 * 60 * 1000, // 10 min — signed URLs valid for 15 min
  });
}

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

  const uploadExpenseImagesMutation = useMutation({
    mutationFn: async ({ expenseId, files }: { expenseId: string; files: File[] }) => {
      const formData = new FormData();
      files.forEach((f) => formData.append("images", f));
      const res = await apiClient.post(`/api/xensplit/groups/${groupId}/expenses/${expenseId}/images`, formData);
      return res.data;
    },
    onSuccess: (_data, { expenseId }) => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["xensplit", "expense-image-urls", groupId, expenseId] });
    },
  });

  const deleteExpenseImageMutation = useMutation({
    mutationFn: async ({ expenseId, imageId }: { expenseId: string; imageId: string }) => {
      const res = await apiClient.delete(`/api/xensplit/groups/${groupId}/expenses/${expenseId}/images/${imageId}`);
      return res.data;
    },
    onSuccess: (_data, { expenseId }) => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["xensplit", "expense-image-urls", groupId, expenseId] });
    },
  });

  return {
    addExpense: addExpenseMutation.mutate,
    addExpenseAsync: addExpenseMutation.mutateAsync,
    isAddingExpense: addExpenseMutation.isPending,
    addExpenseError: addExpenseMutation.error,
    updateExpense: updateExpenseMutation.mutate,
    updateExpenseAsync: updateExpenseMutation.mutateAsync,
    isUpdatingExpense: updateExpenseMutation.isPending,
    updateExpenseError: updateExpenseMutation.error,
    deleteExpense: deleteExpenseMutation.mutate,
    isDeletingExpense: deleteExpenseMutation.isPending,
    deleteExpenseError: deleteExpenseMutation.error,
    uploadExpenseImages: uploadExpenseImagesMutation.mutateAsync,
    isUploadingImages: uploadExpenseImagesMutation.isPending,
    deleteExpenseImage: deleteExpenseImageMutation.mutate,
    isDeletingExpenseImage: deleteExpenseImageMutation.isPending,
  };
}