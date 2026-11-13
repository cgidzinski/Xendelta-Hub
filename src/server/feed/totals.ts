import { Recipe } from "../models/recipe";
import { XenBudgetBook } from "../models/xenBudget";
import { XenKitchenBook, XenKitchenItem } from "../models/xenKitchen";
import { XenLink } from "../models/xenlink";
import { XenNote, XenNotebook } from "../models/xenNote";
import { XenRoutine } from "../models/xenRoutine";
import { XenSplit } from "../models/xenSplit";
import { XenDriveFile } from "../models/xendriveFile";

/**
 * How much the person has in each sub-app (recipes, notes, routines...), for the quiet count on a pinned-app tile.
 * Unlike the attention cards this is not "needs you", just "how much is in here". A count that fails is left out.
 */
export async function readTotals(userId: string): Promise<Record<string, number>> {
  const member = { "members.user_id": userId };
  const counts: Record<string, () => Promise<number>> = {
    recipaint: () => Recipe.countDocuments({ owner: userId }),
    xendrive: () => XenDriveFile.countDocuments({ owner_id: userId }),
    xenlink: () => XenLink.countDocuments({ owner_id: userId }),
    xensplit: () => XenSplit.countDocuments({ members: userId }),
    xenbudget: () => XenBudgetBook.countDocuments({ members: userId }),
    xenroutine: () => XenRoutine.countDocuments({ ...member, enabled: true }),
    xenkitchen: async () => {
      const books = await XenKitchenBook.find(member, "_id").lean();
      return XenKitchenItem.countDocuments({ book_id: { $in: books.map((b) => b._id) } });
    },
    xennote: async () => {
      const notebooks = await XenNotebook.find(member, "_id").lean();
      return XenNote.countDocuments({
        archived: { $ne: true },
        $or: [{ owner_id: userId }, { notebook_id: { $in: notebooks.map((n) => n._id) } }],
      });
    },
  };
  const entries = await Promise.all(
    Object.entries(counts).map(async ([app, count]) => {
      try {
        return [app, await count()] as const;
      } catch (e) {
        console.error(`Total for ${app} failed:`, e);
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((e): e is readonly [string, number] => e !== null));
}
