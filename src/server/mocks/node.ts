import { setupServer } from "msw/node";
import { weeabetsHandlers } from "./weeabetsHandlers";

const server = setupServer(...weeabetsHandlers);

/**
 * Starts intercepting Weeabets XenCasino requests for the lifetime of this process. Must
 * be called before any route file that transitively imports weeabetsClient.ts is
 * required, so interception is active before the first fetch(). `onUnhandledRequest:
 * "bypass"` means MSW only ever touches the Weeabets endpoints it explicitly mocks -
 * every other fetch() in the server (Discord OAuth, etc.) passes through untouched.
 */
export function startWeeabetsMock(): void {
    server.listen({ onUnhandledRequest: "bypass" });
    console.log(">>> MOCK_WEEABETS=true - intercepting Weeabets XenCasino requests via MSW");
}
