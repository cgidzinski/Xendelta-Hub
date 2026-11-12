import { XenSplit } from "../../models/xenSplit";
import { asBalanceInput, calculateBalances } from "../../utils/xenSplitUtils";
import { formatMoney } from "@shared/money";
import type { AttentionCard } from "@shared/feed";
import type { AttentionProvider } from "./types";

const OWE_THRESHOLD = 0.005;
const MAX_CARDS = 3;

/** Groups where the person owes money. Being owed money is not urgent, so it is not here. */
export const splitProvider: AttentionProvider = {
  key: "xensplit",
  async fetch(userId) {
    const groups = await XenSplit.find({ members: userId }).lean();
    const owed: { groupId: string; name: string; text: string; size: number }[] = [];
    for (const group of groups) {
      const members = group.members.map((m) => String(m));
      const mine = calculateBalances(asBalanceInput(group, members))[userId] ?? {};
      const debts = Object.entries(mine).filter(([, amount]) => amount < -OWE_THRESHOLD);
      if (!debts.length) continue;
      owed.push({
        groupId: String(group._id),
        name: group.name,
        text: debts.map(([currency, amount]) => formatMoney(Math.abs(amount), currency)).join(" + "),
        size: Math.max(...debts.map(([, amount]) => Math.abs(amount))),
      });
    }
    owed.sort((a, b) => b.size - a.size);
    const cards: AttentionCard[] = owed.slice(0, MAX_CARDS).map((o) => ({
      key: `xensplit:owe:${o.groupId}`,
      app: "xensplit",
      severity: "warning",
      title: `You owe ${o.text}`,
      subtitle: o.name,
      link: `/internal/xensplit/groups/${o.groupId}/balances`,
      count: 1,
    }));
    // Groups past the card cap still count toward the badge.
    if (owed.length > MAX_CARDS) cards[cards.length - 1].count += owed.length - MAX_CARDS;
    return cards;
  },
};
