import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type { XenBudgetSummary } from "./types";

export interface SummaryParams {
    from?: string;
    to?: string;
    group_by?: "day" | "week" | "month";
    currency?: string;
    categories?: string[];
    flags?: string[];
    people?: string[];
}

/**
 * The tallies behind the Overview and the report page. The server computes every figure
 * in one $facet pass, so the per-category, per-person and top-line numbers always reconcile.
 * Defaults to the current UTC month.
 */
export function useXenBudgetSummary(bookId: string, params: SummaryParams = {}) {
    const { data, isLoading, isError, error, isFetching } = useQuery({
        queryKey: ["xenbudget", "summary", bookId, params],
        queryFn: async () => {
            const res = await apiClient.get(`/api/xenbudget/books/${bookId}/summary`, {
                params: {
                    ...(params.from ? { from: params.from } : {}),
                    ...(params.to ? { to: params.to } : {}),
                    ...(params.group_by ? { group_by: params.group_by } : {}),
                    ...(params.currency ? { currency: params.currency } : {}),
                    ...(params.categories?.length ? { categories: params.categories.join(",") } : {}),
                    ...(params.flags?.length ? { flags: params.flags.join(",") } : {}),
                    ...(params.people?.length ? { people: params.people.join(",") } : {}),
                },
            });
            return res.data.data as XenBudgetSummary;
        },
        enabled: !!bookId,
        staleTime: 0,
        // Keep the previous numbers on screen while a range change refetches, so the
        // tally doesn't flash empty.
        placeholderData: (prev) => prev,
    });

    return { summary: data, isLoading, isFetching, isError, error };
}
