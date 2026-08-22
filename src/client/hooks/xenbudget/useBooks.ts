import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type { XenBudgetBook, CreateBookInput } from "./types";

export function useXenBudgetBooks() {
    const queryClient = useQueryClient();

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ["xenbudget", "books"],
        queryFn: async () => {
            const res = await apiClient.get("/api/xenbudget/books");
            return res.data.data as XenBudgetBook[];
        },
    });

    const createMutation = useMutation({
        mutationFn: async (input: CreateBookInput) => {
            const res = await apiClient.post("/api/xenbudget/books", input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["xenbudget", "books"] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (bookId: string) => {
            await apiClient.delete(`/api/xenbudget/books/${bookId}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["xenbudget", "books"] });
        },
    });

    return {
        books: data || [],
        isLoading,
        isError,
        error,
        createBook: createMutation.mutate,
        createBookAsync: createMutation.mutateAsync,
        isCreating: createMutation.isPending,
        deleteBook: deleteMutation.mutate,
        isDeleting: deleteMutation.isPending,
    };
}
