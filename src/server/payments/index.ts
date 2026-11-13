import type { PaymentProvider } from "./types";

export type { CheckoutOrder, CheckoutResult, PaymentProvider } from "./types";
export { fulfilGemPurchase } from "./fulfil";

/**
 * The configured provider, or null when buying gems is switched off.
 *
 * Buying gems is switched off everywhere for now: the only provider is a dummy that takes no real payment, so it
 * must not hand out gems, not even to admins or in development. To turn it back on, return a real provider here
 * (see docs/monetization.md). `dummyProvider.ts` is kept for that purpose.
 */
export function getPaymentProvider(): PaymentProvider | null {
  return null;
}

/** A test provider on a production server is for admins only, so players can't mint gems. */
export function canUseProvider(provider: PaymentProvider, isAdmin: boolean): boolean {
  return !(provider.isTest && process.env.NODE_ENV === "production" && !isAdmin);
}
