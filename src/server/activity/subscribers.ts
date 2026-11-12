import { realtime } from "../realtime";
import { ACTIVITY_RECORDED, activityEvents, type RecordedActivity } from "./events";

// Who listens to the bus. Today: the "N new" pill on Home. Notifications and webhooks subscribe here too
// when they move off their per-route calls.
activityEvents.on(ACTIVITY_RECORDED, (a: RecordedActivity) => {
  realtime.toUsers(a.audienceIds, "feed:new", { activityId: a.id, app: a.app });
});
