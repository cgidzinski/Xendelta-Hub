import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { invalidateItemDerived } from "./invalidate";
import type { XenBudgetBook, RuleInput, ReapplyResult } from "./types";

export interface RulePreviewMatch {
    _id: string;
    description: string;
    amount: number;
    currency: string;
    date: string;
    type: "expense" | "income";
    already_tagged: boolean;
}

export interface RulePreviewResult {
    matches: RulePreviewMatch[];
    limit: number;
    scanned: number;
}

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

    // A sweep rewrites categories, flags and exclusions across the book, so everything
    // derived from items is stale afterwards.
    const invalidateEverything = () => invalidateItemDerived(queryClient, bookId);

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
        mutationFn: async (opts: { dry_run?: boolean; include_manually_edited?: boolean; exclude_ids?: string[] }) => {
            const res = await apiClient.post(`/api/xenbudget/books/${bookId}/rules/reapply`, opts);
            return res.data.data as ReapplyResult;
        },
        // A dry run writes nothing, so only a real sweep needs to invalidate.
        onSuccess: (data) => { if (!data.dry_run) invalidateEverything(); },
    });

    const previewMutation = useMutation({
        mutationFn: async ({ input, ruleId }: { input: RuleInput; ruleId?: string }) => {
            const query = ruleId ? `?ruleId=${encodeURIComponent(ruleId)}` : "";
            const res = await apiClient.post(`/api/xenbudget/books/${bookId}/rules/preview${query}`, input);
            return res.data.data as RulePreviewResult;
        },
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
        previewRuleAsync: previewMutation.mutateAsync,
        isPreviewingRule: previewMutation.isPending,
    };
}

