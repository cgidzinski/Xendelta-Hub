import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type { XenBudgetBook, UpdateBookInput } from "./types";

export function useXenBudgetBook(bookId: string) {
    const queryClient = useQueryClient();

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ["xenbudget", "book", bookId],
        queryFn: async () => {
            const res = await apiClient.get(`/api/xenbudget/books/${bookId}`);
            return res.data.data as XenBudgetBook;
        },
        enabled: !!bookId,
        staleTime: 0,
        // Only reuse cached data as a placeholder for this same book — otherwise
        // navigating from another book briefly shows its name and currency.
        placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[2] === bookId ? prev : undefined),
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "book", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "books"] });
    };

    const updateMutation = useMutation({
        mutationFn: async (input: UpdateBookInput) => {
            const res = await apiClient.put(`/api/xenbudget/books/${bookId}`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const addMembersMutation = useMutation({
        mutationFn: async (memberIds: string[]) => {
            const res = await apiClient.post(`/api/xenbudget/books/${bookId}/members`, { memberIds });
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const removeMemberMutation = useMutation({
        mutationFn: async (userId: string) => {
            const res = await apiClient.delete(`/api/xenbudget/books/${bookId}/members/${userId}`);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: async () => {
            await apiClient.delete(`/api/xenbudget/books/${bookId}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["xenbudget", "books"] });
            queryClient.removeQueries({ queryKey: ["xenbudget", "book", bookId] });
        },
    });

    return {
        book: data,
        isLoading,
        isError,
        error,
        deleteBookAsync: deleteMutation.mutateAsync,
        isDeletingBook: deleteMutation.isPending,
        updateBook: updateMutation.mutate,
        isUpdating: updateMutation.isPending,
        addMembers: addMembersMutation.mutate,
        addMembersAsync: addMembersMutation.mutateAsync,
        isAddingMembers: addMembersMutation.isPending,
        removeMember: removeMemberMutation.mutate,
        isRemovingMember: removeMemberMutation.isPending,
    };
}
