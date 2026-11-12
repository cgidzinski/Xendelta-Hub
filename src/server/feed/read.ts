import { Types } from "mongoose";
import { Activity } from "../models/activity";
import { User } from "../models/user";
import { membersOf } from "../activity/spaces";
import { isActivityVerb, type ActivityActor, type FeedEntry } from "@shared/activity";
import type { FeedPage } from "@shared/feed";
import { PUBLIC_USER_FIELDS } from "../utils/publicUser";

/** Events by the same person with the same key, no further apart than this, read as one entry. */
export const MERGE_WINDOW_MS = 2 * 60 * 60 * 1000;
export const DEFAULT_FEED_LIMIT = 20;
// Merging and filtering shrink a page, so read a few raw events per entry we want.
const OVERFETCH = 4;

export interface FeedQuery {
  cursor?: string;
  app?: string;
  limit?: number;
}

interface RawActivity {
  _id: Types.ObjectId;
  actor: string | null;
  app: string;
  verb: string;
  object: { type: string; id: string; label?: string };
  space?: { app?: string; id?: string; label?: string };
  data?: Record<string, unknown>;
  groupKey?: string;
  createdAt: Date;
}

const spaceKey = (a: Pick<RawActivity, "space">) =>
  a.space?.app && a.space.id ? `${a.space.app}:${a.space.id}` : null;

/** The cursor is the time and id of the last event read, so paging is stable when events share a timestamp. */
const encodeCursor = (a: RawActivity) => `${a.createdAt.getTime()}_${a._id.toString()}`;
function decodeCursor(cursor: string | undefined): { t: Date; id: Types.ObjectId } | null {
  const [t, id] = (cursor ?? "").split("_");
  if (!t || !id || !Types.ObjectId.isValid(id) || Number.isNaN(Number(t))) return null;
  return { t: new Date(Number(t)), id: new Types.ObjectId(id) };
}

/**
 * One page of a person's feed: other people's events in spaces they are still in, newest first, with muted and
 * hidden things left out and bursts merged into single entries.
 */
export async function readFeed(userId: string, query: FeedQuery = {}): Promise<FeedPage> {
  const limit = query.limit ?? DEFAULT_FEED_LIMIT;
  const user = await User.findById(userId, "feedPrefs hiddenActivityIds").lean();
  const mutedApps = user?.feedPrefs?.mutedApps ?? [];
  const mutedSpaces = new Set(user?.feedPrefs?.mutedSpaces ?? []);
  const hidden = (user?.hiddenActivityIds ?? []).filter((id) => Types.ObjectId.isValid(id));

  const filter: Record<string, unknown> = { audienceIds: userId, actor: { $ne: userId } };
  const and: Record<string, unknown>[] = [];
  if (query.app) and.push({ app: query.app });
  if (mutedApps.length) and.push({ app: { $nin: mutedApps } });
  if (hidden.length) and.push({ _id: { $nin: hidden.map((id) => new Types.ObjectId(id)) } });
  const cursor = decodeCursor(query.cursor);
  if (cursor) and.push({ $or: [{ createdAt: { $lt: cursor.t } }, { createdAt: cursor.t, _id: { $lt: cursor.id } }] });
  if (and.length) filter.$and = and;

  const fetchLimit = limit * OVERFETCH;
  const raw = (await Activity.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(fetchLimit)
    .lean()) as unknown as RawActivity[];

  // Still a member? One lookup per space on the page.
  const spaces = new Map<string, Set<string> | null>();
  await Promise.all(
    [...new Set(raw.map(spaceKey).filter((k): k is string => !!k))].map(async (key) => {
      const [app, ...rest] = key.split(":");
      const members = await membersOf(app, rest.join(":"));
      spaces.set(key, members ? new Set(members) : null);
    }),
  );
  const visible = (a: RawActivity) => {
    const key = spaceKey(a);
    if (!key) return true;
    if (mutedSpaces.has(key)) return false;
    return spaces.get(key)?.has(userId) ?? false;
  };

  // Merge in order. Stop at the first event that would open one entry too many, and resume the next page from there.
  const entries: (FeedEntry & { oldest: number; total: number; hasTotal: boolean })[] = [];
  const open = new Map<string, (typeof entries)[number]>();
  let lastRead: RawActivity | null = null;
  let stoppedEarly = false;
  for (const a of raw) {
    if (!isActivityVerb(a.verb) || !visible(a)) {
      lastRead = a;
      continue;
    }
    const mergeKey = `${a.groupKey ?? a.verb}|${a.actor ?? ""}`;
    const target = open.get(mergeKey);
    if (target && target.oldest - a.createdAt.getTime() <= MERGE_WINDOW_MS) {
      target.ids.push(a._id.toString());
      target.count += 1;
      target.oldest = a.createdAt.getTime();
      if (typeof a.data?.amount === "number") {
        target.total += a.data.amount;
        target.hasTotal = true;
      }
      lastRead = a;
      continue;
    }
    if (entries.length >= limit) {
      stoppedEarly = true;
      break;
    }
    const amount = typeof a.data?.amount === "number" ? a.data.amount : 0;
    const entry = {
      id: a._id.toString(),
      ids: [a._id.toString()],
      verb: a.verb,
      app: a.app,
      actor: null as ActivityActor | null,
      object: a.object,
      space: a.space?.app && a.space.id ? { app: a.space.app, id: a.space.id, label: a.space.label } : undefined,
      data: { ...(a.data ?? {}) },
      count: 1,
      createdAt: a.createdAt.toISOString(),
      oldest: a.createdAt.getTime(),
      total: amount,
      hasTotal: typeof a.data?.amount === "number",
      _actorId: a.actor,
    };
    entries.push(entry);
    open.set(mergeKey, entry);
    lastRead = a;
  }

  // Who did it.
  const actorIds = [...new Set(entries.map((e) => (e as any)._actorId).filter(Boolean))] as string[];
  const users = actorIds.length
    ? await User.find({ _id: { $in: actorIds.filter((id) => Types.ObjectId.isValid(id)) } }, PUBLIC_USER_FIELDS).lean()
    : [];
  const byId = new Map(users.map((u) => [String(u._id), u]));

  const page: FeedEntry[] = entries.map((e) => {
    const { oldest: _oldest, total, hasTotal, ...rest } = e as any;
    const actorUser = rest._actorId ? byId.get(rest._actorId) : null;
    delete rest._actorId;
    const data = { ...rest.data };
    if (rest.count > 1 && hasTotal) data.total = total;
    return {
      ...rest,
      data,
      actor: actorUser
        ? { id: String(actorUser._id), username: actorUser.username ?? "Someone", avatar: actorUser.avatar }
        : null,
    };
  });

  const hasMore = stoppedEarly || raw.length === fetchLimit;
  return { entries: page, nextCursor: hasMore && lastRead ? encodeCursor(lastRead) : null };
}
