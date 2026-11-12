import { XenSplit } from "../models/xenSplit";
import { XenNotebook } from "../models/xenNote";

// "Who is in this space right now?" for each app that has shared spaces. An activity is stored with a snapshot of
// its audience, but is shown only to people still in the space, so a removed member stops seeing it.
// An app with shared things registers itself here with one line.
type MembersOf = (spaceId: string) => Promise<string[] | null>;

const idsOf = (list: unknown[] | undefined) => (list ?? []).map((m) => String(m));

export const SPACES: Record<string, MembersOf> = {
  xensplit: async (id) => {
    const group = await XenSplit.findById(id, "members").lean();
    return group ? idsOf(group.members) : null;
  },
  xennote: async (id) => {
    const book = await XenNotebook.findById(id, "members.user_id").lean();
    return book ? book.members.map((m) => m.user_id) : null;
  },
};

/** The current members of a space, or null if it no longer exists (or its app has no spaces). */
export async function membersOf(app: string, spaceId: string): Promise<string[] | null> {
  const resolve = SPACES[app];
  if (!resolve) return null;
  try {
    return await resolve(spaceId);
  } catch {
    return null;
  }
}
