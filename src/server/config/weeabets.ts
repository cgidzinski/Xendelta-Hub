/**
 * Weeabets XenCasino Configuration
 * Empty values mean the integration is disabled - callers should degrade gracefully
 * (a 503, not a crash), matching how Weeabets itself treats its own unset secrets.
 *
 * MOCK_WEEABETS=true swaps in a fake but non-empty config so weeabetsClient.ts's real
 * fetch() calls go through normally (rather than short-circuiting at
 * assertServiceConfigured()) and land on MSW's mock server instead - see
 * src/server/mocks/. Hard-disabled outside development so it can never activate in a
 * real deployment even if the flag is left set by mistake.
 */

export const MOCK_WEEABETS = process.env.MOCK_WEEABETS === "true" && process.env.NODE_ENV !== "production";
export const MOCK_WEEABETS_BASE_URL = "https://weeabets.mock.internal";

export const WEEABETS_API_URL = MOCK_WEEABETS ? MOCK_WEEABETS_BASE_URL : process.env.WEEABETS_API_URL || "";
export const WEEABETS_XENCASINO_SERVICE_TOKEN = MOCK_WEEABETS
    ? "mock-service-token"
    : process.env.WEEABETS_XENCASINO_SERVICE_TOKEN || "";
export const XENCASINO_DISCORD_ID = MOCK_WEEABETS ? "000000000000000000" : process.env.XENCASINO_DISCORD_ID || "";
