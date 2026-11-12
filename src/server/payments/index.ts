import { dummyProvider } from "./dummyProvider";
import type { PaymentProvider } from "./types";

export type { CheckoutOrder, CheckoutResult, PaymentProvider } from "./types";
export { fulfilGemPurchase } from "./fulfil";

/**
 * The configured provider, or null when buying gems is switched off.
 *
 * PAYMENTS_PROVIDER: "dummy" | "none". Unset means "dummy" in development and "none" in production, so a
 * deployment can never hand out free gems by accident. Setting "dummy" in production is allowed (for trying the
 * shop on a real server) but only admins may check out; see `canUseProvider`.
 */
export function getPaymentProvider(): PaymentProvider | null {
  const configured = (process.env.PAYMENTS_PROVIDER || "").trim().toLowerCase();
  const name = configured || (process.env.NODE_ENV === "production" ? "none" : "dummy");
  if (name === "dummy") return dummyProvider;
  return null;
}

/** A test provider on a production server is for admins only, so players can't mint gems. */
export function canUseProvider(provider: PaymentProvider, isAdmin: boolean): boolean {
  return !(provider.isTest && process.env.NODE_ENV === "production" && !isAdmin);
}
