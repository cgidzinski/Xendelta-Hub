import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type { XenBudgetBook, RuleInput, ReapplyResult } from "./types";

/**
 * Rule CRUD and the re-apply sweep.
 *
 * Saving a rule only changes what happens to items from now on; existing items are
 * untouched until a sweep runs. That is deliberate — a rule edit shouldn't silently
 * rewrite history — which is why the rules tab offers "Re-apply" as its own action.
 */
export function useXenBudgetRules(bookId: string) {
    const queryClient = useQueryClient();

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "book", bookId] });
    };

    // A sweep rewrites tags, exclusions and flags across the book, so everything derived
    // from items is stale afterwards.
    const invalidateEverything = () => {
        invalidate();
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "items", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "summary", bookId] });
        queryClient.invalidateQueries({ queryKey: ["xenbudget", "budget-status", bookId] });
    };

    const createMutation = useMutation({
        mutationFn: async (input: RuleInput) => {
            const res = await apiClient.post(`/api/xenbudget/books/${bookId}/rules`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const updateMutation = useMutation({
        mutationFn: async ({ ruleId, input }: { ruleId: string; input: RuleInput }) => {
            const res = await apiClient.put(`/api/xenbudget/books/${bookId}/rules/${ruleId}`, input);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: async (ruleId: string) => {
            const res = await apiClient.delete(`/api/xenbudget/books/${bookId}/rules/${ruleId}`);
            return res.data.data as XenBudgetBook;
        },
        onSuccess: invalidate,
    });

    const reapplyMutation = useMutation({
        mutationFn: async (opts: { dry_run?: boolean; include_manually_edited?: boolean }) => {
            const res = await apiClient.post(`/api/xenbudget/books/${bookId}/rules/reapply`, opts);
            return res.data.data as ReapplyResult;
        },
        // A dry run writes nothing, so only a real sweep needs to invalidate.
        onSuccess: (data) => { if (!data.dry_run) invalidateEverything(); },
    });

    return {
        createRuleAsync: createMutation.mutateAsync,
        isCreatingRule: createMutation.isPending,
        updateRuleAsync: updateMutation.mutateAsync,
        isUpdatingRule: updateMutation.isPending,
        deleteRuleAsync: deleteMutation.mutateAsync,
        isDeletingRule: deleteMutation.isPending,
        reapplyAsync: reapplyMutation.mutateAsync,
        isReapplying: reapplyMutation.isPending,
    };
}
