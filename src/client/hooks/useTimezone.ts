import { useUserProfile } from "./user/useUserProfile";
import { browserTimezone } from "../constants/timezones";

/**
 * The timezone the signed-in user's tallies should be bucketed in.
 *
 * The browser's zone is only knowable client-side, so this is resolved here and sent with
 * each request that buckets by time (`?tz=`) rather than inferred on the server. An empty
 * stored preference means "follow my browser", which is the default.
 */
export function useTimezone(): string {
    const { profile } = useUserProfile();
    return profile?.timezone || browserTimezone();
}
