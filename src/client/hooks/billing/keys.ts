// Query keys for billing (docs/billing.md): your own bill, a community's bill and its fund.
export const billingKeys = {
  all: ["billing"] as const,
  me: () => [...billingKeys.all, "me"] as const,
  community: (id: string) => [...billingKeys.all, "community", id] as const,
  fund: (id: string) => [...billingKeys.all, "fund", id] as const,
};
