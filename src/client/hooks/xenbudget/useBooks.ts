import { xenbudgetKeys } from "./keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, api } from "../../config/api";
import type { XenBudgetBook, CreateBookInput } from "./types";

export function useXenBudgetBooks() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: xenbudgetKeys.books(),
    queryFn: async () => {
      return api.get<XenBudgetBook[]>("/api/xenbudget/books");
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateBookInput) => {
      return api.post<XenBudgetBook>("/api/xenbudget/books", input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xenbudgetKeys.books() });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (bookId: string) => {
      await apiClient.delete(`/api/xenbudget/books/${bookId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xenbudgetKeys.books() });
    },
  });

  return {
    books: data || [],
    isLoading,
    isError,
    error,
    refetch,
    createBook: createMutation.mutate,
    createBookAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    deleteBook: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}
