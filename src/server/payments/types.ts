/** What a provider is asked to charge for. */
export interface CheckoutOrder {
  purchaseId: string;
  userId: string;
  itemId: string;
  amountCents: number;
  currency: string;
}

/**
 * "completed": the money has been taken, fulfil the purchase now (the dummy provider).
 * "redirect": send the person to `url` to pay; the provider's webhook fulfils the purchase later (Stripe).
 */
export type CheckoutResult = { kind: "completed"; providerRef?: string } | { kind: "redirect"; url: string };

/**
 * The seam between the shop and whoever takes the money. To add Stripe: implement `startCheckout` to create a
 * Checkout Session and return `{ kind: "redirect", url }`, add a webhook route that verifies the signature and
 * calls `fulfilGemPurchase(purchaseId)`, and set PAYMENTS_PROVIDER=stripe. Nothing in the client changes.
 */
export interface PaymentProvider {
  readonly name: string;
  /** True when no real money moves. The shop shows a "test mode" banner. */
  readonly isTest: boolean;
  startCheckout(order: CheckoutOrder): Promise<CheckoutResult>;
}
