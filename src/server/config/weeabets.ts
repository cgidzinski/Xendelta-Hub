/**
 * Weeabets XenCasino Configuration
 * Empty values mean the integration is disabled - callers should degrade gracefully
 * (a 503, not a crash), matching how Weeabets itself treats its own unset secrets.
 */

export const WEEABETS_API_URL = process.env.WEEABETS_API_URL || "";
export const WEEABETS_XENCASINO_SERVICE_TOKEN = process.env.WEEABETS_XENCASINO_SERVICE_TOKEN || "";
export const XENCASINO_DISCORD_ID = process.env.XENCASINO_DISCORD_ID || "";
