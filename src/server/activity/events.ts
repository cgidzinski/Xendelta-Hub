import { EventEmitter } from "events";
import type { ActivityVerb } from "@shared/activity";

// The in-process bus. `recordActivity` emits here after it has stored an event; whoever cares subscribes
// (realtime today, notifications and webhooks later) instead of being called from every route.
export interface RecordedActivity {
  id: string;
  actor: string | null;
  app: string;
  verb: ActivityVerb;
  audienceIds: string[];
}

export const activityEvents = new EventEmitter();
export const ACTIVITY_RECORDED = "activity";
