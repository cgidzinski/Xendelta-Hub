import { User } from "../models/user";
import type { Cosmetics } from "@shared/cosmetics";
import { PUBLIC_USER_FIELDS, cosmeticsOf } from "../utils/publicUser";
import { SPACE_SOURCES } from "./spaces";

// Who you know, derived from who you share spaces with. There is no friend list to keep: being added to the same
// group, book, notebook, routine or chat is the relationship, and it ends when the space does.

export interface KnownPerson {
  _id: string;
  username: string;
  avatar: string;
  cosmetics?: Cosmetics;
  /** How many spaces you share. */
  sharedCount: number;
  /** Which apps those spaces are in, as labels. */
  apps: string[];
}

export interface SharedSpace {
  app: string;
  label: string;
  id: string;
  name: string;
  link: string;
}

const DEFAULT_AVATAR = "/avatars/default-avatar.png";

export function publicPerson(user: any) {
  return {
    _id: String(user._id),
    username: user.username as string,
    avatar: (user.avatar as string) || DEFAULT_AVATAR,
    cosmetics: cosmeticsOf(user),
  };
}

/** Co-members of every space `userId` is in, counted per person. Self is never included. */
export async function knownTallyOf(userId: string): Promise<Map<string, { count: number; apps: Set<string> }>> {
  const tally = new Map<string, { count: number; apps: Set<string> }>();
  const perSource = await Promise.all(
    SPACE_SOURCES.map(async (source) => {
      const docs = await source.model.find({ [source.memberPath]: userId }, source.memberPath).lean();
      return { source, docs };
    }),
  );
  for (const { source, docs } of perSource) {
    for (const doc of docs as any[]) {
      // memberPath is "<array>.user_id", so walk to the array and read user_id off each entry.
      const [arrayKey] = source.memberPath.split(".");
      for (const member of (doc[arrayKey] ?? []) as Array<{ user_id?: string }>) {
        const id = member?.user_id ? String(member.user_id) : "";
        if (!id || id === userId) continue;
        const entry = tally.get(id) ?? { count: 0, apps: new Set<string>() };
        entry.count += 1;
        entry.apps.add(source.label);
        tally.set(id, entry);
      }
    }
  }
  return tally;
}

/** People you share at least one space with, most shared first, then by name. */
export async function knownPeopleOf(userId: string): Promise<KnownPerson[]> {
  const tally = await knownTallyOf(userId);
  if (tally.size === 0) return [];
  const users = await User.find({ _id: { $in: [...tally.keys()] } }, PUBLIC_USER_FIELDS).lean();
  return users
    .map((u) => {
      const entry = tally.get(String(u._id))!;
      return { ...publicPerson(u), sharedCount: entry.count, apps: [...entry.apps].sort() };
    })
    .sort((a, b) => b.sharedCount - a.sharedCount || a.username.localeCompare(b.username));
}

/** The spaces both people are in. The viewer is in all of them, so this reveals nothing they could not already see. */
export async function sharedSpacesBetween(viewer: string, target: string): Promise<SharedSpace[]> {
  const perSource = await Promise.all(
    SPACE_SOURCES.filter((s) => s.listOnProfile).map(async (source) => {
      const docs = await source.model
        .find({ $and: [{ [source.memberPath]: viewer }, { [source.memberPath]: target }] }, "name")
        .lean();
      return (docs as any[]).map((d) => ({
        app: source.app,
        label: source.label,
        id: String(d._id),
        name: (d.name as string) || source.label,
        link: source.link(String(d._id)),
      }));
    }),
  );
  return perSource.flat();
}
