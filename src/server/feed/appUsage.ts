import { Recipe } from "../models/recipe";
import { XenBudgetBook } from "../models/xenBudget";
import { XenKitchenItem } from "../models/xenKitchen";
import { XenNote } from "../models/xenNote";
import { XenRoutine } from "../models/xenRoutine";
import { XenSplit } from "../models/xenSplit";
import { XenDriveFile } from "../models/xendriveFile";
import { XenLink } from "../models/xenlink";

// Which apps this person already uses, so the "Did you know?" tips on Home can invite them to the ones they don't and only
// teach tricks for the ones they do. "Uses" means they have something in it: a note they wrote, a routine they are in, a
// file they uploaded themselves (not an app's), a group they belong to. It is asked when Home needs it and never stored.
// A new sub-app adds a line here (docs/adding-a-sub-app.md).
const CHECKS: Record<string, (userId: string) => Promise<unknown>> = {
  recipaint: (id) => Recipe.exists({ author: id }),
  xendrive: (id) => XenDriveFile.exists({ owner_id: id, "source.app": { $exists: false } }),
  xenlink: (id) => XenLink.exists({ owner_id: id }),
  xensplit: (id) => XenSplit.exists({ "roster.user_id": id }),
  xenbudget: (id) => XenBudgetBook.exists({ "roster.user_id": id }),
  xenroutine: (id) => XenRoutine.exists({ "members.user_id": id }),
  xenkitchen: (id) => XenKitchenItem.exists({ created_by: id }),
  xennote: (id) => XenNote.exists({ owner_id: id }),
};

export const TRACKED_APPS = Object.keys(CHECKS);

/** The keys of the apps this person has used. A check that fails counts as "not used" rather than failing the page. */
export async function usedApps(userId: string): Promise<string[]> {
  const results = await Promise.all(
    TRACKED_APPS.map(async (app) => [app, !!(await CHECKS[app](userId).catch(() => null))] as const),
  );
  return results.filter(([, used]) => used).map(([app]) => app);
}
