import { Activity } from "../models/activity";
import { isActivityVerb, type ActivityObject, type ActivitySpace, type ActivityVerb } from "@shared/activity";
import { ACTIVITY_RECORDED, activityEvents } from "./events";
import { membersOf } from "./spaces";
import "./subscribers";

export interface RecordActivityInput {
  /** Who did it; null for the system. They never see their own action in their feed. */
  actor: string | null;
  verb: ActivityVerb;
  object: ActivityObject;
  space?: ActivitySpace;
  /** `space`: everyone in `space` right now. `users`: exactly these people. */
  audience: "space" | { users: string[] };
  data?: Record<string, unknown>;
  /** Overrides the default grouping key (verb + space), which decides which events merge into one feed entry. */
  groupKey?: string;
}

/**
 * Records that something happened, for the people it concerns. Call it after the change has been saved.
 *
 * It never throws: a feed failure is logged and swallowed so it can't break the action that caused it, the same
 * rule logXenSplit and notify follow.
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    if (!isActivityVerb(input.verb)) {
      console.error(`recordActivity: unknown verb ${input.verb}`);
      return;
    }
    let audience: string[] = [];
    if (input.audience === "space") {
      if (!input.space) throw new Error("audience 'space' needs a space");
      audience = (await membersOf(input.space.app, input.space.id)) ?? [];
    } else {
      audience = input.audience.users;
    }
    const audienceIds = [...new Set(audience)].filter((id) => id && id !== input.actor);
    if (audienceIds.length === 0) return;

    const doc = await Activity.create({
      actor: input.actor,
      app: input.verb.split(".")[0],
      verb: input.verb,
      object: input.object,
      space: input.space,
      audienceIds,
      data: input.data ?? {},
      groupKey:
        input.groupKey ?? `${input.verb}:${input.space ? `${input.space.app}:${input.space.id}` : input.object.id}`,
    });
    activityEvents.emit(ACTIVITY_RECORDED, {
      id: doc._id.toString(),
      actor: input.actor,
      app: doc.app,
      verb: input.verb,
      audienceIds,
    });
  } catch (error) {
    console.error(`recordActivity (${input.verb}) failed:`, error);
  }
}
