import type { CheckoutOrder, CheckoutResult, PaymentProvider } from "./types";

/** Takes no money: every checkout succeeds at once. A stand-in until a real provider is wired up. */
export const dummyProvider: PaymentProvider = {
  name: "dummy",
  isTest: true,
  async startCheckout(order: CheckoutOrder): Promise<CheckoutResult> {
    return { kind: "completed", providerRef: `dummy_${order.purchaseId}` };
  },
};
