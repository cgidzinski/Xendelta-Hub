import type { Model } from "mongoose";
import { XenSplit } from "../models/xenSplit";
import { XenBudgetBook } from "../models/xenBudget";
import { XenNotebook } from "../models/xenNote";
import { XenKitchenBook } from "../models/xenKitchen";
import { XenRoutine } from "../models/xenRoutine";
import { Conversation } from "../models/conversation";
import { Community } from "../models/community";

// Every kind of shared thing, in one list. "Who do I know?" and "what do we share?" are answered by asking each of
// these who is in it, so a person you have never been added alongside is a stranger and nothing needs maintaining.
// A new sub-app with members registers one line here (docs/adding-a-sub-app.md).
export interface SpaceSource {
  app: string;
  label: string;
  model: Model<any>;
  /** The indexed path holding member ids, e.g. "roster.user_id". Every source also has a `name`. */
  memberPath: string;
  link: (id: string) => string;
  /** Shown under "Spaces you share" on a profile. Chats are not: the Message button covers them. */
  listOnProfile: boolean;
}

export const SPACE_SOURCES: SpaceSource[] = [
  {
    app: "xensplit",
    label: "XenSplit",
    model: XenSplit,
    memberPath: "roster.user_id",
    link: (id) => `/internal/xensplit/groups/${id}`,
    listOnProfile: true,
  },
  {
    app: "xenbudget",
    label: "XenBudget",
    model: XenBudgetBook,
    memberPath: "roster.user_id",
    link: (id) => `/internal/xenbudget/books/${id}`,
    listOnProfile: true,
  },
  {
    app: "xennote",
    label: "XenNote",
    model: XenNotebook,
    memberPath: "members.user_id",
    link: () => "/internal/xennote",
    listOnProfile: true,
  },
  {
    app: "xenkitchen",
    label: "XenKitchen",
    model: XenKitchenBook,
    memberPath: "members.user_id",
    link: () => "/internal/xenkitchen",
    listOnProfile: true,
  },
  {
    app: "xenroutine",
    label: "XenRoutine",
    model: XenRoutine,
    memberPath: "members.user_id",
    link: () => "/internal/xenroutine",
    listOnProfile: true,
  },
  {
    app: "community",
    label: "Communities",
    model: Community,
    memberPath: "members.user_id",
    link: (id) => `/internal/communities/${id}`,
    listOnProfile: true,
  },
  {
    app: "chat",
    label: "Messages",
    model: Conversation,
    memberPath: "members.user_id",
    link: (id) => `/internal/messages/${id}`,
    listOnProfile: false,
  },
];
