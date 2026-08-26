import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type { XenBudgetRecurring, XenBudgetMerchants } from "./types";

export interface RecurringParams {
    currency?: string;
    /** How far back to look. The server defaults to 18 months and caps at 60. */
    lookback_months?: number;
}

/**
 * Subscriptions and bills, derived from imported history.
 *
 * Nothing is stored: the server reads the items already in the book and reports which of
 * them are one recurring charge. That means the answer changes as imports land, so it is
 * invalidated by the same things that invalidate a summary.
 */
export function useXenBudgetRecurring(bookId: string, params: RecurringParams = {}) {
    const { data, isLoading, isError, error, isFetching } = useQuery({
        queryKey: ["xenbudget", "recurring", bookId, params],
        queryFn: async () => {
            const res = await apiClient.get(`/api/xenbudget/books/${bookId}/recurring`, {
                params: {
                    ...(params.currency ? { currency: params.currency } : {}),
                    ...(params.lookback_months ? { lookback_months: params.lookback_months } : {}),
                },
            });
            return res.data.data as XenBudgetRecurring;
        },
        enabled: !!bookId,
        // Detection scans up to 18 months of items, and the answer doesn't change between
        // imports — so unlike the summary this one is worth holding briefly.
        staleTime: 60_000,
        placeholderData: (prev) => prev,
    });

    return { recurring: data, isLoading, isFetching, isError, error };
}

export interface MerchantParams {
    currency?: string;
    from?: string;
    to?: string;
    limit?: number;
}

/** Where the money went, grouped by the same merchant normalisation the detector uses. */
export function useXenBudgetMerchants(bookId: string, params: MerchantParams = {}) {
    const { data, isLoading, isError, error, isFetching } = useQuery({
        queryKey: ["xenbudget", "merchants", bookId, params],
        queryFn: async () => {
            const res = await apiClient.get(`/api/xenbudget/books/${bookId}/merchants`, {
                params: {
                    ...(params.currency ? { currency: params.currency } : {}),
                    ...(params.from ? { from: params.from } : {}),
                    ...(params.to ? { to: params.to } : {}),
                    ...(params.limit ? { limit: params.limit } : {}),
                },
            });
            return res.data.data as XenBudgetMerchants;
        },
        enabled: !!bookId,
        staleTime: 60_000,
        placeholderData: (prev) => prev,
    });

    return { merchants: data, isLoading, isFetching, isError, error };
}
