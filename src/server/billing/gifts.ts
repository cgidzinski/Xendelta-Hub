import { formatWholeGems } from "@shared/billing";
import { GemTransaction } from "../models/gemTransaction";
import { User } from "../models/user";
import { AppError } from "../utils/http";
import { notify } from "../utils/notificationUtils";
import { balanceOf, transfer, userAccount } from "./ledger";

// Giving gems to another person (docs/billing.md): the one way to receive gems without buying them. It is a ledger
// transfer between two people, so no gems are created, and like a donation it can't be reversed.

/** Give whole gems from one person to another, once per request id. Returns the giver's new balance. */
export async function giftGems(
  fromId: string,
  toId: string,
  gems: number,
  note: string | undefined,
  requestId: string,
): Promise<{ balance: number }> {
  if (fromId === toId) throw new AppError(400, "You can't give gems to yourself");
  const recipient = await User.exists({ _id: toId });
  if (!recipient) throw new AppError(404, "Person not found");

  const idempotencyKey = `gift:${fromId}:${requestId}`;
  // A retry of a gift that already went through must not tell the recipient twice.
  const isRetry = !!(await GemTransaction.exists({ idempotencyKey }));
  await transfer({
    from: userAccount(fromId),
    to: userAccount(toId),
    amount: gems,
    kind: "gift",
    idempotencyKey,
    meta: note ? { note } : undefined,
  });

  if (!isRetry) {
    const giver = await User.findById(fromId, "username").lean().exec();
    await notify(toId, {
      title: "You were given gems",
      message: `${giver?.username ?? "Someone"} gave you ${formatWholeGems(gems)}${note ? `: ${note}` : "."}`,
      link: "/internal/billing",
      icon: "announcement",
    });
  }
  return { balance: await balanceOf(userAccount(fromId)) };
}
